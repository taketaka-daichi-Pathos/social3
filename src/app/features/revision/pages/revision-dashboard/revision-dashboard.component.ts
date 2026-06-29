import { DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompensationService } from '@core/services/compensation.service';
import { EmployeeService } from '@core/services/employee.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { SocialInsuranceRevisionService } from '@core/services/social-insurance-revision.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee } from '@features/employees/models/employee.model';
import { isRetiredEmployee } from '@features/employees/utils/retirement.utils';
import {
  formatTargetMonthLabel,
  getAnnualDeterminationMonths,
  getNextYearMonthKey,
  isEmployeeVisibleForTargetMonth,
  parseYearMonthKey,
  toYearMonthKeyFromParts,
} from '@features/payroll/utils/compensation.utils';
import {
  loadStoredRevisionOccasionalMonth,
  loadStoredRevisionYear,
  saveStoredRevisionOccasionalMonth,
  saveStoredRevisionYear,
} from '@features/payroll/utils/payroll-storage.utils';
import {
  AnnualDeterminationResult,
  OccasionalRevisionResult,
  RevisionStatus,
} from '@features/revision/models/revision.model';
import {
  buildAnnualRevisionHistoryEntry,
  buildOccasionalRevisionHistoryEntry,
  formatGradeWithAmount,
  gradeChangeDirection,
  isAnnualRevisionApplied,
  isOccasionalRevisionApplied,
  overlayAnnualResultsWithRevisionHistory,
  overlayOccasionalResultsWithRevisionHistory,
  resolveOccasionalPriorityOverAnnual,
} from '@features/revision/utils/revision-history.utils';
import { formatAnnualDeterminationBonusPeriodLabel } from '@features/revision/utils/annual-determination-bonus.utils';
import { formatOccasionalRevisionPeriodLabel } from '@features/revision/utils/occasional-revision.utils';
import {
  hasMissingPayrollInRevisionMonthDetails,
  REVISION_MISSING_PAYROLL_APPLY_ERROR,
  REVISION_MISSING_PAYROLL_APPLY_TOOLTIP,
} from '@features/revision/utils/revision-payroll-readiness.utils';
import { SubNavComponent, SubNavItem } from '@shared/components/sub-nav/sub-nav.component';
import { RetiredEmployeeBadgeComponent } from '@shared/components/retired-employee-badge/retired-employee-badge.component';
import { SocialInsuranceType } from '@features/onboarding/models/employee-registration.model';

export type RevisionStatusFilter = 'action_required' | 'applied' | 'excluded' | 'all';

interface RevisionStatusFilterTab {
  id: RevisionStatusFilter;
  label: string;
}

@Component({
  selector: 'app-revision-dashboard',
  standalone: true,
  imports: [DecimalPipe, SubNavComponent, RetiredEmployeeBadgeComponent],
  templateUrl: './revision-dashboard.component.html',
  styleUrl: './revision-dashboard.component.scss',
})
export class RevisionDashboardComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly employeeService = inject(EmployeeService);
  private readonly compensationService = inject(CompensationService);
  private readonly revisionService = inject(SocialInsuranceRevisionService);
  private readonly monthlyLockService = inject(MonthlyLockService);

  readonly statusFilterTabs: RevisionStatusFilterTab[] = [
    { id: 'all', label: 'すべて' },
    { id: 'action_required', label: '提出対象' },
    { id: 'applied', label: '適用済み' },
    { id: 'excluded', label: '対象外' },
  ];

  readonly activeSubTab = signal('annual');
  readonly targetYear = signal(new Date().getFullYear());
  readonly occasionalChangeMonth = signal('');
  readonly occasionalStatusFilter = signal<RevisionStatusFilter>('action_required');
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly applyError = signal('');
  readonly annualResults = signal<AnnualDeterminationResult[]>([]);
  readonly occasionalResults = signal<OccasionalRevisionResult[]>([]);
  readonly applyingKeys = signal<Set<string>>(new Set());
  readonly lockedMonths = signal<Set<string>>(new Set());

  private readonly employees = signal<Employee[]>([]);
  private rebuildVersion = 0;

  private static readonly APPLY_CONFIRM_MESSAGE =
    '社員マスタ（等級・標準報酬月額）が更新され、指定の適用月から新しい社会保険料が計算されます。よろしいですか？';

  readonly formatGradeWithAmount = formatGradeWithAmount;
  readonly gradeChangeDirection = gradeChangeDirection;
  readonly revisionMissingPayrollApplyTooltip = REVISION_MISSING_PAYROLL_APPLY_TOOLTIP;

  readonly subNavItems = computed<SubNavItem[]>(() => [
    {
      label: '算定基礎（定時決定）',
      id: 'annual',
      showBadge: this.annualPendingCount() > 0,
    },
    {
      label: '随時改定（月額変更）',
      id: 'occasional',
      showBadge: this.occasionalPendingCount() > 0,
      badgeTooltip: this.occasionalPendingTooltip(),
    },
  ]);

  readonly filteredOccasionalResults = computed(() =>
    this.occasionalResultsForSelectedMonth().filter((row) =>
      this.matchesOccasionalStatusFilter(row, this.occasionalStatusFilter())
    )
  );

  readonly occasionalResultsForSelectedMonth = computed(() => {
    const changeMonth = this.occasionalChangeMonth();
    if (!changeMonth) {
      return [];
    }

    return this.occasionalResults().filter((row) => row.changeMonth === changeMonth);
  });

  readonly annualPendingCount = computed(() =>
    this.annualResults().filter((row) => this.isAnnualSubmissionTarget(row)).length
  );

  readonly occasionalPendingCount = computed(() =>
    this.occasionalResults().filter((row) => this.isOccasionalActionRequired(row)).length
  );

  readonly occasionalPendingCountForSelectedMonth = computed(() =>
    this.occasionalResultsForSelectedMonth().filter((row) =>
      this.isOccasionalActionRequired(row)
    ).length
  );

  readonly occasionalPendingByApplicationMonth = computed(() => {
    const groups = new Map<string, number>();

    for (const row of this.occasionalResults()) {
      if (!this.isOccasionalActionRequired(row) || !row.applicationMonth) {
        continue;
      }

      groups.set(row.applicationMonth, (groups.get(row.applicationMonth) ?? 0) + 1);
    }

    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  });

  readonly occasionalPendingTooltip = computed(() => {
    const groups = this.occasionalPendingByApplicationMonth();
    if (groups.length === 0) {
      return '';
    }

    return groups
      .map(([applicationMonth, count]) => `${this.formatApplicationMonthLabel(applicationMonth)}: ${count}名`)
      .join(' / ');
  });

  ngOnInit(): void {
    const now = new Date();
    const currentYear = now.getFullYear();
    const targetYear = loadStoredRevisionYear(currentYear);

    this.targetYear.set(targetYear);
    this.occasionalChangeMonth.set(
      loadStoredRevisionOccasionalMonth(toYearMonthKeyFromParts(targetYear, now.getMonth() + 1))
    );
    this.syncOccasionalChangeMonthYear(targetYear);

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => {
          this.employees.set(employees);
          this.loadError.set('');
          void this.recalculate();
        },
        error: (error) => {
          this.loadError.set(
            error instanceof Error && error.message === 'ログインしていません'
              ? 'ログインしていません。再度ログインしてください。'
              : toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました')
          );
          this.annualResults.set([]);
          this.occasionalResults.set([]);
          this.loading.set(false);
        },
      });
  }

  onSubNavSelect(item: SubNavItem): void {
    this.activeSubTab.set(item.id);
  }

  selectOccasionalStatusFilter(filter: RevisionStatusFilter): void {
    this.occasionalStatusFilter.set(filter);
  }

  prevAnnualYear(): void {
    this.setTargetYear(this.targetYear() - 1);
  }

  nextAnnualYear(): void {
    this.setTargetYear(this.targetYear() + 1);
  }

  prevOccasionalChangeMonth(): void {
    this.shiftOccasionalChangeMonth(-1);
  }

  nextOccasionalChangeMonth(): void {
    this.shiftOccasionalChangeMonth(1);
  }

  occasionalChangeMonthLabel(): string {
    const changeMonth = this.occasionalChangeMonth();
    if (!changeMonth) {
      return '—';
    }

    return formatOccasionalRevisionPeriodLabel(changeMonth);
  }

  occasionalStatusFilterEmptyMessage(): string {
    switch (this.occasionalStatusFilter()) {
      case 'action_required':
        return '提出対象の従業員はいません';
      case 'applied':
        return '適用済みの従業員はいません';
      case 'excluded':
        return '対象外の従業員はいません';
      default:
        return '固定的賃金の変動は検出されませんでした';
    }
  }

  private setTargetYear(year: number): void {
    if (year < 1900 || year > 2100) {
      return;
    }

    this.targetYear.set(year);
    saveStoredRevisionYear(year);
    this.syncOccasionalChangeMonthYear(year);
    void this.recalculate();
  }

  private shiftOccasionalChangeMonth(delta: number): void {
    const current = this.occasionalChangeMonth();
    if (!current) {
      return;
    }

    const { year, month } = parseYearMonthKey(current);
    let nextMonth = month + delta;
    let nextYear = year;

    while (nextMonth < 1) {
      nextMonth += 12;
      nextYear -= 1;
    }

    while (nextMonth > 12) {
      nextMonth -= 12;
      nextYear += 1;
    }

    if (nextYear < 1900 || nextYear > 2100) {
      return;
    }

    const nextChangeMonth = toYearMonthKeyFromParts(nextYear, nextMonth);
    this.occasionalChangeMonth.set(nextChangeMonth);
    saveStoredRevisionOccasionalMonth(nextChangeMonth);

    if (nextYear !== this.targetYear()) {
      this.targetYear.set(nextYear);
      saveStoredRevisionYear(nextYear);
      void this.recalculate();
    }
  }

  private syncOccasionalChangeMonthYear(year: number): void {
    const current = this.occasionalChangeMonth();
    if (!current) {
      const fallback = toYearMonthKeyFromParts(year, new Date().getMonth() + 1);
      this.occasionalChangeMonth.set(fallback);
      saveStoredRevisionOccasionalMonth(fallback);
      return;
    }

    const { month } = parseYearMonthKey(current);
    const synced = toYearMonthKeyFromParts(year, month);
    this.occasionalChangeMonth.set(synced);
    saveStoredRevisionOccasionalMonth(synced);
  }

  private isAnnualTrulyExcluded(row: AnnualDeterminationResult): boolean {
    return (
      row.exclusionReasons.includes('hired_after_june') ||
      row.exclusionReasons.includes('occasional_revision_scheduled') ||
      row.occasionalPriorityApplicationMonth != null
    );
  }

  private isAnnualSubmissionTarget(row: AnnualDeterminationResult): boolean {
    return !this.isAnnualApplied(row) && !this.isAnnualTrulyExcluded(row);
  }

  private isOccasionalActionRequired(row: OccasionalRevisionResult): boolean {
    return row.status === 'eligible' && !this.isOccasionalApplied(row);
  }

  private matchesOccasionalStatusFilter(
    row: OccasionalRevisionResult,
    filter: RevisionStatusFilter
  ): boolean {
    switch (filter) {
      case 'action_required':
        return this.isOccasionalActionRequired(row);
      case 'applied':
        return this.isOccasionalApplied(row);
      case 'excluded':
        return !this.isOccasionalApplied(row) && row.status === 'excluded';
      case 'all':
        return true;
      default:
        return true;
    }
  }

  determinationMonthsLabel(): string {
    return getAnnualDeterminationMonths(this.targetYear())
      .map((month) => formatTargetMonthLabel(month))
      .join(' / ');
  }

  statusLabel(status: RevisionStatus): string {
    switch (status) {
      case 'eligible':
        return '改定対象';
      case 'applied':
        return '等級変更なし';
      case 'excluded':
        return '対象外';
      default:
        return '未確定';
    }
  }

  statusClass(status: RevisionStatus): string {
    switch (status) {
      case 'eligible':
        return 'revision__badge revision__badge--eligible';
      case 'applied':
        return 'revision__badge revision__badge--applied';
      case 'excluded':
        return 'revision__badge revision__badge--excluded';
      default:
        return 'revision__badge revision__badge--pending';
    }
  }

  annualStatusLabel(row: AnnualDeterminationResult): string {
    if (row.occasionalPriorityApplicationMonth) {
      const month = Number(row.occasionalPriorityApplicationMonth.split('-')[1]);
      return `対象外（${month}月随時改定を優先）`;
    }

    if (this.isAnnualApplied(row)) {
      return row.hasGradeChange ? '算定対象' : '等級変更なし';
    }

    return this.statusLabel(row.status);
  }

  annualStatusClass(row: AnnualDeterminationResult): string {
    if (row.occasionalPriorityApplicationMonth) {
      return 'revision__badge revision__badge--priority-excluded';
    }

    if (this.isAnnualApplied(row)) {
      return row.hasGradeChange
        ? 'revision__badge revision__badge--eligible'
        : 'revision__badge revision__badge--applied';
    }

    return this.statusClass(row.status);
  }

  occasionalStatusLabel(row: OccasionalRevisionResult): string {
    if (this.isOccasionalApplied(row)) {
      return this.occasionalAppliedHasGradeChange(row) ? '改定対象' : '等級変更なし';
    }

    return this.statusLabel(row.status);
  }

  occasionalStatusClass(row: OccasionalRevisionResult): string {
    if (this.isOccasionalApplied(row)) {
      return this.occasionalAppliedHasGradeChange(row)
        ? 'revision__badge revision__badge--eligible'
        : 'revision__badge revision__badge--applied';
    }

    return this.statusClass(row.status);
  }

  private occasionalAppliedHasGradeChange(row: OccasionalRevisionResult): boolean {
    return (
      row.currentHealthGrade !== row.proposedHealthGrade ||
      row.currentPensionGrade !== row.proposedPensionGrade
    );
  }

  isAnnualCalculationSuppressed(row: AnnualDeterminationResult): boolean {
    return row.occasionalPriorityApplicationMonth != null;
  }

  isOccasionalPriorityExclusionLabel(label: string): boolean {
    return label.endsWith('随時改定を優先');
  }

  formatMonth(yearMonth: string): string {
    return formatTargetMonthLabel(yearMonth);
  }

  formatApplicationMonthLabel(yearMonth: string): string {
    const { year, month } = parseYearMonthKey(yearMonth);
    return `${year}年${month}月適用`;
  }

  socialInsuranceTypeLabel(employeeId: string): string {
    const employee = this.employeeForId(employeeId);
    const type: SocialInsuranceType = employee?.socialInsuranceType ?? 'general';

    switch (type) {
      case 'short_time_worker':
        return '短時間就労者';
      case 'part_time_special':
        return '短時間労働者';
      default:
        return '一般';
    }
  }

  hasFrequentBonusAdjustment(row: AnnualDeterminationResult): boolean {
    return row.frequentBonusAdjustment.applied;
  }

  hasOccasionalFrequentBonusAdjustment(row: OccasionalRevisionResult): boolean {
    return row.frequentBonusAdjustment.applied;
  }

  annualAverageBreakdownTitle(row: AnnualDeterminationResult): string {
    const adjustment = row.frequentBonusAdjustment;
    if (!adjustment.applied || row.averagePayment == null) {
      return '';
    }

    const payrollAverage =
      adjustment.payrollOnlyAverage ??
      row.averagePayment - adjustment.monthlyBonusAllocation;

    return [
      `判定期間: ${formatAnnualDeterminationBonusPeriodLabel(row.targetYear)}`,
      `賞与支給回数: ${adjustment.bonusPaymentCount}回`,
      `賞与総額: ¥${adjustment.bonusTotalAmount.toLocaleString('ja-JP')}`,
      `月あたり賞与加算: ¥${adjustment.monthlyBonusAllocation.toLocaleString('ja-JP')}（総額÷12・円未満切捨て）`,
      `給与のみ平均: ¥${payrollAverage.toLocaleString('ja-JP')}`,
      `最終平均報酬月額: ¥${row.averagePayment.toLocaleString('ja-JP')}`,
    ].join('\n');
  }

  occasionalAverageBreakdownTitle(row: OccasionalRevisionResult): string {
    const adjustment = row.frequentBonusAdjustment;
    if (!adjustment.applied || row.averagePayment == null) {
      return '';
    }

    const targetYear = Number.parseInt(row.changeMonth.slice(0, 4), 10);
    const payrollAverage =
      adjustment.payrollOnlyAverage ??
      row.averagePayment - adjustment.monthlyBonusAllocation;

    return [
      `判定期間: ${formatAnnualDeterminationBonusPeriodLabel(targetYear)}`,
      `賞与支給回数: ${adjustment.bonusPaymentCount}回`,
      `賞与総額: ¥${adjustment.bonusTotalAmount.toLocaleString('ja-JP')}`,
      `月あたり賞与加算: ¥${adjustment.monthlyBonusAllocation.toLocaleString('ja-JP')}（総額÷12・円未満切捨て）`,
      `給与のみ平均: ¥${payrollAverage.toLocaleString('ja-JP')}`,
      `最終平均報酬月額: ¥${row.averagePayment.toLocaleString('ja-JP')}`,
    ].join('\n');
  }

  occasionalPanelNote(): string {
    return '固定的賃金に変動があり、その後継続する3ヶ月間の平均報酬月額が、現在の標準報酬月額と比べて2等級以上の差が生じた従業員を抽出します。';
  }

  annualApplyKey(row: AnnualDeterminationResult): string {
    return `annual:${row.employeeId}:${row.targetYear}`;
  }

  occasionalApplyKey(row: OccasionalRevisionResult): string {
    return `occasional:${row.employeeId}:${row.changeMonth}`;
  }

  isAnnualApplied(row: AnnualDeterminationResult): boolean {
    const employee = this.employees().find((item) => item.id === row.employeeId);
    return employee ? isAnnualRevisionApplied(employee, row) : false;
  }

  isOccasionalApplied(row: OccasionalRevisionResult): boolean {
    const employee = this.employees().find((item) => item.id === row.employeeId);
    return employee ? isOccasionalRevisionApplied(employee, row) : false;
  }

  annualExclusionLabels(row: AnnualDeterminationResult): string[] {
    if (this.isAnnualApplied(row)) {
      return [];
    }

    return row.exclusionLabels;
  }

  occasionalExclusionLabels(row: OccasionalRevisionResult): string[] {
    if (this.isOccasionalApplied(row)) {
      return [];
    }

    return row.exclusionLabels;
  }

  isAnnualRowMuted(row: AnnualDeterminationResult): boolean {
    return this.isAnnualTrulyExcluded(row) && !this.isAnnualApplied(row);
  }

  isOccasionalRowMuted(row: OccasionalRevisionResult): boolean {
    return row.status === 'excluded' && !this.isOccasionalApplied(row);
  }

  canApplyAnnual(row: AnnualDeterminationResult): boolean {
    return (
      this.canApplyAnnualIfPayrollComplete(row) && !this.hasMissingPayrollInAnnual(row)
    );
  }

  showAnnualApplyButton(row: AnnualDeterminationResult): boolean {
    return this.canApplyAnnualIfPayrollComplete(row);
  }

  isAnnualApplyDisabledByMissingPayroll(row: AnnualDeterminationResult): boolean {
    return this.showAnnualApplyButton(row) && this.hasMissingPayrollInAnnual(row);
  }

  hasMissingPayrollInAnnual(row: AnnualDeterminationResult): boolean {
    return hasMissingPayrollInRevisionMonthDetails(row.monthDetails);
  }

  canApplyOccasional(row: OccasionalRevisionResult): boolean {
    return (
      this.canApplyOccasionalIfPayrollComplete(row) &&
      !this.hasMissingPayrollInOccasional(row)
    );
  }

  showOccasionalApplyButton(row: OccasionalRevisionResult): boolean {
    return this.canApplyOccasionalIfPayrollComplete(row);
  }

  isOccasionalApplyDisabledByMissingPayroll(row: OccasionalRevisionResult): boolean {
    return this.showOccasionalApplyButton(row) && this.hasMissingPayrollInOccasional(row);
  }

  hasMissingPayrollInOccasional(row: OccasionalRevisionResult): boolean {
    return hasMissingPayrollInRevisionMonthDetails(row.monthDetails);
  }

  private canApplyAnnualIfPayrollComplete(row: AnnualDeterminationResult): boolean {
    if (!this.isAnnualSubmissionTarget(row)) {
      return false;
    }

    if (row.status !== 'eligible' && row.status !== 'applied') {
      return false;
    }

    if (row.averagePayment != null && row.averagePayment < 0) {
      return false;
    }

    if (row.occasionalPriorityApplicationMonth) {
      return false;
    }

    const employee = this.employees().find((item) => item.id === row.employeeId);
    if (employee && resolveOccasionalPriorityOverAnnual(employee, row.targetYear)) {
      return false;
    }

    if (
      row.proposedHealthStandard == null ||
      row.proposedPensionStandard == null ||
      row.proposedHealthGrade == null ||
      row.proposedPensionGrade == null
    ) {
      return false;
    }

    if (this.isRevisionApplicationMonthLocked(row.applicationMonth)) {
      return false;
    }

    return true;
  }

  private canApplyOccasionalIfPayrollComplete(row: OccasionalRevisionResult): boolean {
    if (row.status !== 'eligible' || this.isOccasionalApplied(row)) {
      return false;
    }

    if (this.isRevisionApplicationMonthLocked(row.applicationMonth)) {
      return false;
    }

    return row.averagePayment == null || row.averagePayment >= 0;
  }

  private isRevisionApplicationMonthLocked(applicationMonth: string | null): boolean {
    return applicationMonth != null && this.lockedMonths().has(applicationMonth);
  }

  isApplying(key: string): boolean {
    return this.applyingKeys().has(key);
  }

  async applyAnnual(row: AnnualDeterminationResult): Promise<void> {
    if (this.hasMissingPayrollInAnnual(row)) {
      this.applyError.set(REVISION_MISSING_PAYROLL_APPLY_ERROR);
      return;
    }

    if (!this.canApplyAnnual(row)) {
      return;
    }

    if (!confirm(RevisionDashboardComponent.APPLY_CONFIRM_MESSAGE)) {
      return;
    }

    const employee = this.employees().find((item) => item.id === row.employeeId);
    if (
      !employee ||
      row.proposedHealthStandard == null ||
      row.proposedPensionStandard == null ||
      row.proposedHealthGrade == null ||
      row.proposedPensionGrade == null
    ) {
      return;
    }

    if (resolveOccasionalPriorityOverAnnual(employee, row.targetYear)) {
      this.applyError.set('当年7〜9月に随時改定が適用されているため、算定基礎は適用できません。');
      return;
    }

    const key = this.annualApplyKey(row);
    this.applyError.set('');
    this.applyingKeys.update((keys) => new Set(keys).add(key));

    try {
      await this.employeeService.applyAnnualDeterminationRevision(row.employeeId, {
        healthStandardRemuneration: row.proposedHealthStandard,
        pensionStandardRemuneration: row.proposedPensionStandard,
        historyEntry: buildAnnualRevisionHistoryEntry(
          row,
          row.currentHealthGrade ?? 0,
          row.currentPensionGrade ?? 0
        ),
      });
    } catch (error) {
      this.applyError.set(
        error instanceof Error ? error.message : '算定基礎の適用に失敗しました'
      );
    } finally {
      this.applyingKeys.update((keys) => {
        const next = new Set(keys);
        next.delete(key);
        return next;
      });
    }
  }

  async applyOccasional(row: OccasionalRevisionResult): Promise<void> {
    if (this.hasMissingPayrollInOccasional(row)) {
      this.applyError.set(REVISION_MISSING_PAYROLL_APPLY_ERROR);
      return;
    }

    if (!this.canApplyOccasional(row)) {
      return;
    }

    if (!confirm(RevisionDashboardComponent.APPLY_CONFIRM_MESSAGE)) {
      return;
    }

    const employee = this.employees().find((item) => item.id === row.employeeId);
    if (
      !employee ||
      row.proposedHealthStandard == null ||
      row.proposedPensionStandard == null ||
      row.proposedHealthGrade == null ||
      row.proposedPensionGrade == null
    ) {
      return;
    }

    const key = this.occasionalApplyKey(row);
    this.applyError.set('');
    this.applyingKeys.update((keys) => new Set(keys).add(key));

    try {
      await this.employeeService.applyStandardRemunerationRevision(row.employeeId, {
        healthStandardRemuneration: row.proposedHealthStandard,
        pensionStandardRemuneration: row.proposedPensionStandard,
        historyEntry: buildOccasionalRevisionHistoryEntry(
          row,
          row.currentHealthGrade ?? 0,
          row.currentPensionGrade ?? 0
        ),
      });
    } catch (error) {
      this.applyError.set(
        error instanceof Error ? error.message : '随時改定の適用に失敗しました'
      );
    } finally {
      this.applyingKeys.update((keys) => {
        const next = new Set(keys);
        next.delete(key);
        return next;
      });
    }
  }

  isRetiredBadgeVisible(employeeId: string): boolean {
    const employee = this.employeeForId(employeeId);
    return employee ? isRetiredEmployee(employee) : false;
  }

  employeeForId(employeeId: string): Employee | undefined {
    return this.employees().find((item) => item.id === employeeId);
  }

  private employeesForCalculation(): Employee[] {
    return this.employees();
  }

  private async refreshLockedMonths(months: string[]): Promise<void> {
    const uniqueMonths = [...new Set(months)];
    const locked = new Set<string>();

    await Promise.all(
      uniqueMonths.map(async (month) => {
        if (await this.monthlyLockService.isMonthLocked(month)) {
          locked.add(month);
        }
      })
    );

    this.lockedMonths.set(locked);
  }

  private async recalculate(): Promise<void> {
    const version = ++this.rebuildVersion;
    this.loading.set(true);
    this.annualResults.set([]);
    this.occasionalResults.set([]);

    const employees = this.employeesForCalculation();
    const targetYear = this.targetYear();
    const determinationMonths = getAnnualDeterminationMonths(targetYear);
    const searchFrom = determinationMonths[0];
    const searchTo = toYearMonthKeyFromParts(targetYear + 1, 3);

    const monthsToLoad = this.collectMonths(searchFrom, searchTo, determinationMonths);

    try {
      const payrollRecords = await this.compensationService.getPayrollRecordsForMonths(monthsToLoad);
      if (version !== this.rebuildVersion) {
        return;
      }

      await this.refreshLockedMonths(monthsToLoad);
      if (version !== this.rebuildVersion) {
        return;
      }

      const payrollSnapshots = this.revisionService.buildPayrollSnapshotMap(payrollRecords);
      const allOccasionalResults = this.revisionService.calculateOccasionalRevisions(
        employees,
        payrollSnapshots,
        toYearMonthKeyFromParts(targetYear, 1),
        toYearMonthKeyFromParts(targetYear, 12)
      );
      const annualResults = this.revisionService.calculateAnnualDeterminations(
        targetYear,
        employees,
        payrollSnapshots,
        allOccasionalResults
      );
      const occasionalResults = allOccasionalResults.filter((result) =>
        result.changeMonth.startsWith(String(targetYear))
      );

      if (version !== this.rebuildVersion) {
        return;
      }

      this.occasionalResults.set(
        overlayOccasionalResultsWithRevisionHistory(occasionalResults, employees)
      );
      this.annualResults.set(overlayAnnualResultsWithRevisionHistory(annualResults, employees));
      this.loadError.set('');
    } catch (error) {
      if (version !== this.rebuildVersion) {
        return;
      }

      this.loadError.set(
        error instanceof Error ? error.message : '改定計算に失敗しました'
      );
      this.annualResults.set([]);
      this.occasionalResults.set([]);
    } finally {
      if (version === this.rebuildVersion) {
        this.loading.set(false);
      }
    }
  }

  private collectMonths(from: string, to: string, extra: string[]): string[] {
    const months = new Set<string>(extra);
    let current = from;

    while (current <= to) {
      months.add(current);
      current = getNextYearMonthKey(current);
    }

    return [...months].sort();
  }
}
