import { DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BonusInsuranceService } from '@core/services/bonus-insurance.service';
import { AgeEventContextService } from '@core/services/age-event-notification.service';
import { CompanyService } from '@core/services/company.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { CompensationService } from '@core/services/compensation.service';
import { EmployeeService } from '@core/services/employee.service';
import { SocialInsuranceRevisionService } from '@core/services/social-insurance-revision.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { SocialInsurancePremiumBreakdown } from '@core/models/social-insurance.model';
import { getPremiumTotals } from '@features/employees/utils/employee-display.utils';
import { Employee } from '@features/employees/models/employee.model';
import { CompensationRecord, PayrollRecord } from '@features/payroll/models/compensation.model';
import { CompanySettings } from '@features/settings/models/company-settings.model';
import {
  BonusInsuranceCalculationResult,
  bonusEntryKey,
  calculateBonusEntryAmount,
  getLockedBonusEntries,
  parseTargetYearMonth,
  sortLockedBonusEntriesByPaymentDate,
} from '@features/payroll/utils/bonus-insurance.utils';
import { formatPaymentDateLabel } from '@features/payroll/utils/bonus-history.utils';
import {
  filterEmployeesForBonusTargetMonth,
  filterEmployeesForTargetMonth,
  filterEmployeesWithLockedPayroll,
  formatTargetMonthLabel,
  getCurrentYearMonthKey,
  getNextYearMonthKey,
  getPreviousYearMonthKey,
  listFiscalYearMonthsUpTo,
  parseYearMonthKey,
  toYearMonthKeyFromParts,
} from '@features/payroll/utils/compensation.utils';
import {
  addPremiumBreakdownToCumulative,
  emptyPremiumBreakdown,
  mergePremiumBreakdowns,
} from '@features/payroll/utils/premium-merge.utils';
import {
  loadStoredTargetMonth,
  PAYROLL_STORAGE_KEYS,
  saveStoredTargetMonth,
} from '@features/payroll/utils/payroll-storage.utils';
import { EffectiveStandardRemuneration } from '@features/revision/models/revision.model';
import { isSocialInsuranceExemptForDate, isSocialInsuranceExemptForMonth } from '@features/employees/utils/leave-record.utils';
import { isSocialInsuranceExemptForRetirementMonth, isRetiredEmployee } from '@features/employees/utils/retirement.utils';
import { LeaveCompactBadgeComponent } from '@shared/components/leave-compact-badge/leave-compact-badge.component';
import { RetiredEmployeeBadgeComponent } from '@shared/components/retired-employee-badge/retired-employee-badge.component';
import { SocialInsuranceTypeBadgeComponent } from '@shared/components/social-insurance-type-badge/social-insurance-type-badge.component';
import {
  matchesSocialInsuranceCategoryFilter,
  SOCIAL_INSURANCE_CATEGORY_FILTER_OPTIONS,
  SocialInsuranceCategoryFilter,
} from '@features/employees/utils/social-insurance-type-filter.utils';
import { YearSelectComponent } from '@shared/components/year-select/year-select.component';

type PremiumView = 'payroll' | 'bonus' | 'combined';

interface PayrollPremiumRow {
  employee: Employee;
  effective: EffectiveStandardRemuneration;
  premiums: SocialInsurancePremiumBreakdown;
  totals: ReturnType<typeof getPremiumTotals>;
}

interface BonusPremiumRow {
  rowKey: string;
  employee: Employee;
  bonusAmount: number;
  paymentDate: string;
  paymentDateLabel: string;
  calculation: BonusInsuranceCalculationResult;
  totals: ReturnType<typeof getPremiumTotals>;
}

interface CombinedPremiumRow {
  employee: Employee;
  effective: EffectiveStandardRemuneration | null;
  premiums: SocialInsurancePremiumBreakdown;
  totals: ReturnType<typeof getPremiumTotals>;
  hasPayroll: boolean;
  hasBonus: boolean;
}

interface CumulativeTotals {
  healthEmployee: number;
  healthEmployer: number;
  longTermCareEmployee: number;
  longTermCareEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  employeeShare: number;
  employerShare: number;
  total: number;
}

/** サマリーカード表示用（当月・年度累計の納入額内訳） */
interface PremiumSummaryTotals {
  employeeShare: number;
  employerShare: number;
  total: number;
}

@Component({
  selector: 'app-monthly-insurance-premium-table',
  standalone: true,
  imports: [DecimalPipe, YearSelectComponent, LeaveCompactBadgeComponent, RetiredEmployeeBadgeComponent, SocialInsuranceTypeBadgeComponent],
  templateUrl: './monthly-insurance-premium-table.component.html',
  styleUrl: './monthly-insurance-premium-table.component.scss',
})
export class MonthlyInsurancePremiumTableComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly employeeService = inject(EmployeeService);
  private readonly compensationService = inject(CompensationService);
  private readonly revisionService = inject(SocialInsuranceRevisionService);
  private readonly bonusInsuranceService = inject(BonusInsuranceService);
  private readonly companyService = inject(CompanyService);
  private readonly monthlyLockService = inject(MonthlyLockService);
  private readonly ageEventContext = inject(AgeEventContextService);

  readonly premiumView = signal<PremiumView>('payroll');
  readonly targetMonth = signal(getCurrentYearMonthKey());
  readonly isTargetMonthLocked = signal(false);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly payrollRows = signal<PayrollPremiumRow[]>([]);
  readonly bonusRows = signal<BonusPremiumRow[]>([]);
  readonly combinedRows = signal<CombinedPremiumRow[]>([]);
  readonly cumulative = signal<CumulativeTotals | null>(null);
  readonly fiscalYearLabel = signal('');
  readonly emptyMessage = signal('');
  readonly socialInsuranceFilter = signal<SocialInsuranceCategoryFilter>('all');
  readonly socialInsuranceFilterOptions = SOCIAL_INSURANCE_CATEGORY_FILTER_OPTIONS;

  readonly filteredPayrollRows = computed(() => {
    const filter = this.socialInsuranceFilter();
    return this.payrollRows().filter((row) =>
      matchesSocialInsuranceCategoryFilter(row.employee, filter)
    );
  });

  readonly filteredBonusRows = computed(() => {
    const filter = this.socialInsuranceFilter();
    return this.bonusRows().filter((row) =>
      matchesSocialInsuranceCategoryFilter(row.employee, filter)
    );
  });

  readonly filteredCombinedRows = computed(() => {
    const filter = this.socialInsuranceFilter();
    return this.combinedRows().filter((row) =>
      matchesSocialInsuranceCategoryFilter(row.employee, filter)
    );
  });

  /** 対象月単月の明細合算（表示中タブのテーブル行から算出） */
  readonly currentMonthTotals = computed(() => {
    const view = this.premiumView();
    const rows =
      view === 'bonus'
        ? this.filteredBonusRows()
        : view === 'combined'
          ? this.filteredCombinedRows()
          : this.filteredPayrollRows();

    return this.aggregateRowTotals(rows.map((row) => row.totals));
  });

  readonly monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);

  private readonly employees = signal<Employee[]>([]);
  private payrollCumulative: CumulativeTotals | null = null;
  private bonusCumulative: CumulativeTotals | null = null;
  private combinedCumulative: CumulativeTotals | null = null;
  private rebuildVersion = 0;

  ngOnInit(): void {
    const storedMonth = loadStoredTargetMonth(
      PAYROLL_STORAGE_KEYS.insurance,
      getCurrentYearMonthKey()
    );
    this.targetMonth.set(storedMonth);
    this.ageEventContext.setPayrollTargetYearMonth(storedMonth);

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => {
          this.employees.set(employees);
          this.loadError.set('');
          void this.rebuild();
        },
        error: (error) => {
          this.loadError.set(
            error instanceof Error && error.message === 'ログインしていません'
              ? 'ログインしていません。再度ログインしてください。'
              : toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました')
          );
          this.payrollRows.set([]);
          this.bonusRows.set([]);
          this.combinedRows.set([]);
          this.cumulative.set(null);
          this.loading.set(false);
        },
      });
  }

  targetMonthLabel(): string {
    return formatTargetMonthLabel(this.targetMonth());
  }

  selectedYear(): number {
    return parseYearMonthKey(this.targetMonth()).year;
  }

  selectedMonth(): number {
    return parseYearMonthKey(this.targetMonth()).month;
  }

  premiumViewLabel(): string {
    switch (this.premiumView()) {
      case 'bonus':
        return '賞与';
      case 'combined':
        return '合算';
      default:
        return '月次給与';
    }
  }

  descriptionText(): string {
    switch (this.premiumView()) {
      case 'bonus':
        return `${this.targetMonthLabel()}の賞与に基づく社会保険料一覧です。標準賞与額の上限（厚年150万円／健保・介護年度累計573万円）を適用しています。`;
      case 'combined':
        return `${this.targetMonthLabel()}の月次給与と賞与の社会保険料を合算した一覧です。`;
      default:
        return `${this.targetMonthLabel()}の月次給与に基づく社会保険料一覧です。算定基礎・随時改定で決定された等級を反映しています。`;
    }
  }

  setPremiumView(view: PremiumView): void {
    if (this.premiumView() === view) {
      return;
    }

    this.premiumView.set(view);
    this.applyViewState();
  }

  goToPreviousMonth(): void {
    this.setTargetMonth(getPreviousYearMonthKey(this.targetMonth()));
  }

  goToNextMonth(): void {
    this.setTargetMonth(getNextYearMonthKey(this.targetMonth()));
  }

  onYearSelected(year: number): void {
    this.setTargetMonth(toYearMonthKeyFromParts(year, this.selectedMonth()));
  }

  onMonthChange(event: Event): void {
    const month = Number((event.target as HTMLSelectElement).value);
    this.setTargetMonth(toYearMonthKeyFromParts(this.selectedYear(), month));
  }

  onSocialInsuranceFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SocialInsuranceCategoryFilter;
    this.socialInsuranceFilter.set(value);
  }

  revisionSourceLabel(source: EffectiveStandardRemuneration['source']): string {
    switch (source) {
      case 'revision_history':
        return '改定履歴';
      case 'annual_determination':
        return '算定基礎';
      case 'occasional_revision':
        return '随時改定';
      default:
        return 'マスタ';
    }
  }

  private sumPremiumTotalsForView(view: PremiumView): PremiumSummaryTotals {
    switch (view) {
      case 'bonus':
        return this.aggregateRowTotals(this.bonusRows().map((row) => row.totals));
      case 'combined':
        return this.aggregateRowTotals(this.combinedRows().map((row) => row.totals));
      default:
        return this.aggregateRowTotals(this.payrollRows().map((row) => row.totals));
    }
  }

  private aggregateRowTotals(
    rows: Array<Pick<PremiumSummaryTotals, 'employeeShare' | 'employerShare' | 'total'>>
  ): PremiumSummaryTotals {
    return rows.reduce(
      (totals, row) => ({
        employeeShare: totals.employeeShare + row.employeeShare,
        employerShare: totals.employerShare + row.employerShare,
        total: totals.total + row.total,
      }),
      { employeeShare: 0, employerShare: 0, total: 0 }
    );
  }

  isRetiredBadgeVisible(employee: Employee): boolean {
    return isRetiredEmployee(employee);
  }

  private setTargetMonth(yearMonth: string): void {
    this.targetMonth.set(yearMonth);
    this.ageEventContext.setPayrollTargetYearMonth(yearMonth);
    saveStoredTargetMonth(PAYROLL_STORAGE_KEYS.insurance, yearMonth);
    void this.rebuild();
  }

  private async refreshTargetMonthLock(): Promise<void> {
    try {
      this.isTargetMonthLocked.set(
        await this.monthlyLockService.isMonthLocked(this.targetMonth())
      );
    } catch {
      this.isTargetMonthLocked.set(false);
    }
  }

  private applyViewState(): void {
    switch (this.premiumView()) {
      case 'bonus':
        this.cumulative.set(this.bonusCumulative);
        break;
      case 'combined':
        this.cumulative.set(this.combinedCumulative);
        break;
      default:
        this.cumulative.set(this.payrollCumulative);
        break;
    }

    this.emptyMessage.set(this.buildEmptyMessage(this.premiumView()));
  }

  private async rebuild(): Promise<void> {
    const employees = this.employees();
    const version = ++this.rebuildVersion;
    this.loading.set(true);

    const targetMonth = this.targetMonth();
    const fiscalMonths = listFiscalYearMonthsUpTo(targetMonth);
    const { year, month } = parseYearMonthKey(targetMonth);
    const fiscalStartYear = month >= 4 ? year : year - 1;
    this.fiscalYearLabel.set(`${fiscalStartYear}年度（4月〜${this.targetMonthLabel()}）`);

    try {
      const [payrollRecords, bonusRecords, company] = await Promise.all([
        this.compensationService.getPayrollRecordsForMonths(fiscalMonths),
        this.compensationService.getBonusRecordsForMonths(fiscalMonths),
        this.companyService.getCompanyForCurrentUser(),
      ]);

      if (version !== this.rebuildVersion) {
        return;
      }

      await this.refreshTargetMonthLock();
      if (version !== this.rebuildVersion) {
        return;
      }

      const payrollRecordByMonth = new Map<string, PayrollRecord>(
        payrollRecords.map((record) => [record.targetMonth, record])
      );
      const bonusRecordByMonth = new Map<string, CompensationRecord>(
        bonusRecords.map((record) => [record.targetMonth, record])
      );
      const targetPayrollRecord = payrollRecordByMonth.get(targetMonth) ?? null;
      const targetBonusRecord = bonusRecordByMonth.get(targetMonth) ?? null;

      const payrollRows = this.buildPayrollRows(
        employees,
        targetMonth,
        targetPayrollRecord,
        company
      );
      const bonusRows = await this.buildBonusRows(
        employees,
        targetMonth,
        targetBonusRecord,
        bonusRecordByMonth
      );
      const combinedRows = this.buildCombinedRows(payrollRows, bonusRows);

      this.payrollCumulative = this.calculatePayrollCumulativeTotals(
        employees,
        fiscalMonths,
        payrollRecordByMonth,
        company
      );
      this.bonusCumulative = await this.calculateBonusCumulativeTotals(
        employees,
        fiscalMonths,
        bonusRecordByMonth
      );
      this.combinedCumulative = this.mergeCumulativeTotals(
        this.payrollCumulative,
        this.bonusCumulative
      );

      if (version !== this.rebuildVersion) {
        return;
      }

      this.payrollRows.set(payrollRows);
      this.bonusRows.set(bonusRows);
      this.combinedRows.set(combinedRows);
      this.applyViewState();
      this.loadError.set('');
    } catch (error) {
      if (version !== this.rebuildVersion) {
        return;
      }

      this.loadError.set(
        error instanceof Error ? error.message : '保険料の計算に失敗しました'
      );
      this.payrollRows.set([]);
      this.bonusRows.set([]);
      this.combinedRows.set([]);
      this.cumulative.set(null);
    } finally {
      if (version === this.rebuildVersion) {
        this.loading.set(false);
      }
    }
  }

  private buildEmptyMessage(view: PremiumView): string {
    const targetMonth = this.targetMonth();
    const employees = this.employees();

    if (view === 'combined') {
      if (this.combinedRows().length > 0) {
        return '';
      }

      return '該当月の月次給与または賞与の保険料データがありません';
    }

    if (view === 'bonus') {
      const visible = filterEmployeesForBonusTargetMonth(employees, targetMonth).length;
      return visible > 0
        ? '該当月に保存済みの賞与がないため、保険料を表示できません'
        : '対象月に該当する従業員がいません';
    }

    const visible = filterEmployeesForTargetMonth(employees, targetMonth).length;
    return visible > 0
      ? '該当月の月次給与が確定されていないため、保険料を表示できません'
      : '対象月に該当する従業員がいません';
  }

  private buildPayrollRows(
    employees: Employee[],
    targetMonth: string,
    targetPayrollRecord: PayrollRecord | null,
    company: CompanySettings | null
  ): PayrollPremiumRow[] {
    const eligibleEmployees = filterEmployeesWithLockedPayroll(
      employees,
      targetMonth,
      targetPayrollRecord
    );

    return eligibleEmployees.map((employee) => {
      const parsedTarget = parseTargetYearMonth(targetMonth);
      console.log('[Debug] MonthlyInsurancePremiumTable.buildPayrollRows 計算直前:', {
        targetMonth,
        targetYear: parsedTarget?.targetYear,
        targetMonthNumber: parsedTarget?.targetMonth,
        prefecture: company?.prefecture ?? null,
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
      });

      if (!parsedTarget) {
        console.warn(
          '[Debug] MonthlyInsurancePremiumTable: targetYear / targetMonth が未解析です:',
          targetMonth
        );
      }

      const { effective, premiums } = this.revisionService.calculatePremiumsForEmployee(
        employee,
        targetMonth,
        company
      );
      const totals = getPremiumTotals({
        age: 0,
        isLongTermCareInsured: false,
        healthGrade: null,
        pensionGrade: null,
        premiums,
      });

      return { employee, effective, premiums, totals };
    });
  }

  private async buildBonusRows(
    employees: Employee[],
    targetMonth: string,
    targetBonusRecord: CompensationRecord | null,
    bonusRecordByMonth: Map<string, CompensationRecord>
  ): Promise<BonusPremiumRow[]> {
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const lockedEntries = sortLockedBonusEntriesByPaymentDate(
      getLockedBonusEntries(targetBonusRecord).filter((entry) =>
        employeeById.has(entry.employeeId)
      )
    );
    const rows: BonusPremiumRow[] = [];

    for (const entry of lockedEntries) {
      const employee = employeeById.get(entry.employeeId);
      if (!employee) {
        continue;
      }

      const paymentDate =
        entry.paymentDate?.trim() ||
        targetBonusRecord?.paymentDate?.trim() ||
        `${targetMonth}-01`;

      if (filterEmployeesForBonusTargetMonth([employee], targetMonth, paymentDate).length === 0) {
        continue;
      }

      const bonusAmount =
        entry.bonusAmount ?? calculateBonusEntryAmount(entry.fixedWages, entry.nonFixedWages);
      const calculation = await this.bonusInsuranceService.calculateForEmployee(
        employee,
        targetMonth,
        bonusAmount,
        bonusRecordByMonth,
        paymentDate
      );
      const totals = getPremiumTotals({
        age: 0,
        isLongTermCareInsured: false,
        healthGrade: null,
        pensionGrade: null,
        premiums: calculation.premiums,
      });

      rows.push({
        rowKey: bonusEntryKey(employee.id, paymentDate),
        employee,
        bonusAmount,
        paymentDate,
        paymentDateLabel: formatPaymentDateLabel(paymentDate),
        calculation,
        totals,
      });
    }

    return rows.sort((a, b) => {
      const numberCompare = a.employee.employeeNumber.localeCompare(b.employee.employeeNumber);
      if (numberCompare !== 0) {
        return numberCompare;
      }

      return a.paymentDate.localeCompare(b.paymentDate);
    });
  }

  private buildCombinedRows(
    payrollRows: PayrollPremiumRow[],
    bonusRows: BonusPremiumRow[]
  ): CombinedPremiumRow[] {
    const payrollByEmployeeId = new Map(payrollRows.map((row) => [row.employee.id, row]));
    const bonusPremiumsByEmployeeId = new Map<string, SocialInsurancePremiumBreakdown>();

    for (const bonusRow of bonusRows) {
      const existing = bonusPremiumsByEmployeeId.get(bonusRow.employee.id) ?? emptyPremiumBreakdown();
      bonusPremiumsByEmployeeId.set(
        bonusRow.employee.id,
        mergePremiumBreakdowns(existing, bonusRow.calculation.premiums)
      );
    }

    const employeeIds = new Set([
      ...payrollByEmployeeId.keys(),
      ...bonusPremiumsByEmployeeId.keys(),
    ]);

    return [...employeeIds]
      .map((employeeId) => {
        const payrollRow = payrollByEmployeeId.get(employeeId);
        const bonusPremiums = bonusPremiumsByEmployeeId.get(employeeId) ?? emptyPremiumBreakdown();
        const employee =
          payrollRow?.employee ??
          bonusRows.find((row) => row.employee.id === employeeId)!.employee;
        const payrollPremiums = payrollRow?.premiums ?? emptyPremiumBreakdown();
        const premiums = mergePremiumBreakdowns(payrollPremiums, bonusPremiums);
        const totals = getPremiumTotals({
          age: 0,
          isLongTermCareInsured: false,
          healthGrade: null,
          pensionGrade: null,
          premiums,
        });

        return {
          employee,
          effective: payrollRow?.effective ?? null,
          premiums,
          totals,
          hasPayroll: Boolean(payrollRow),
          hasBonus: bonusPremiumsByEmployeeId.has(employeeId),
        };
      })
      .sort((a, b) => a.employee.employeeNumber.localeCompare(b.employee.employeeNumber));
  }

  private calculatePayrollCumulativeTotals(
    employees: Employee[],
    fiscalMonths: string[],
    payrollRecordByMonth: Map<string, PayrollRecord>,
    company: CompanySettings | null
  ): CumulativeTotals {
    const totals = this.createEmptyCumulativeTotals();

    for (const yearMonth of fiscalMonths) {
      const payrollRecord = payrollRecordByMonth.get(yearMonth) ?? null;
      const eligibleEmployees = filterEmployeesWithLockedPayroll(
        employees,
        yearMonth,
        payrollRecord
      );

      for (const employee of eligibleEmployees) {
        if (
          isSocialInsuranceExemptForMonth(employee, yearMonth) ||
          isSocialInsuranceExemptForRetirementMonth(employee, yearMonth)
        ) {
          continue;
        }

        const parsedTarget = parseTargetYearMonth(yearMonth);
        console.log('[Debug] MonthlyInsurancePremiumTable.calculatePayrollCumulativeTotals 計算直前:', {
          yearMonth,
          targetYear: parsedTarget?.targetYear,
          targetMonthNumber: parsedTarget?.targetMonth,
          prefecture: company?.prefecture ?? null,
          employeeId: employee.id,
        });

        const { premiums } = this.revisionService.calculatePremiumsForEmployee(
          employee,
          yearMonth,
          company
        );
        const rowTotals = getPremiumTotals({
          age: 0,
          isLongTermCareInsured: false,
          healthGrade: null,
          pensionGrade: null,
          premiums,
        });
        addPremiumBreakdownToCumulative(totals, premiums, rowTotals);
      }
    }

    return totals;
  }

  private async calculateBonusCumulativeTotals(
    employees: Employee[],
    fiscalMonths: string[],
    bonusRecordByMonth: Map<string, CompensationRecord>
  ): Promise<CumulativeTotals> {
    const totals = this.createEmptyCumulativeTotals();

    for (const yearMonth of fiscalMonths) {
      const bonusRecord = bonusRecordByMonth.get(yearMonth) ?? null;
      const lockedEntries = sortLockedBonusEntriesByPaymentDate(getLockedBonusEntries(bonusRecord));

      for (const entry of lockedEntries) {
        const employee = employees.find((row) => row.id === entry.employeeId);
        if (!employee) {
          continue;
        }

        const paymentDate =
          entry.paymentDate?.trim() || bonusRecord?.paymentDate?.trim() || `${yearMonth}-01`;

        if (filterEmployeesForBonusTargetMonth([employee], yearMonth, paymentDate).length === 0) {
          continue;
        }

        const bonusAmount =
          entry.bonusAmount ?? calculateBonusEntryAmount(entry.fixedWages, entry.nonFixedWages);

        if (
          isSocialInsuranceExemptForDate(employee, paymentDate) ||
          isSocialInsuranceExemptForRetirementMonth(employee, yearMonth)
        ) {
          continue;
        }

        const calculation = await this.bonusInsuranceService.calculateForEmployee(
          employee,
          yearMonth,
          bonusAmount,
          bonusRecordByMonth,
          paymentDate
        );
        const rowTotals = getPremiumTotals({
          age: 0,
          isLongTermCareInsured: false,
          healthGrade: null,
          pensionGrade: null,
          premiums: calculation.premiums,
        });
        addPremiumBreakdownToCumulative(totals, calculation.premiums, rowTotals);
      }
    }

    return totals;
  }

  private mergeCumulativeTotals(
    payroll: CumulativeTotals | null,
    bonus: CumulativeTotals | null
  ): CumulativeTotals {
    const left = payroll ?? this.createEmptyCumulativeTotals();
    const right = bonus ?? this.createEmptyCumulativeTotals();

    return {
      healthEmployee: left.healthEmployee + right.healthEmployee,
      healthEmployer: left.healthEmployer + right.healthEmployer,
      longTermCareEmployee: left.longTermCareEmployee + right.longTermCareEmployee,
      longTermCareEmployer: left.longTermCareEmployer + right.longTermCareEmployer,
      pensionEmployee: left.pensionEmployee + right.pensionEmployee,
      pensionEmployer: left.pensionEmployer + right.pensionEmployer,
      employeeShare: left.employeeShare + right.employeeShare,
      employerShare: left.employerShare + right.employerShare,
      total: left.total + right.total,
    };
  }

  private createEmptyCumulativeTotals(): CumulativeTotals {
    return {
      healthEmployee: 0,
      healthEmployer: 0,
      longTermCareEmployee: 0,
      longTermCareEmployer: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      employeeShare: 0,
      employerShare: 0,
      total: 0,
    };
  }
}
