import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CompensationService } from '@core/services/compensation.service';
import { SocialInsuranceRevisionService } from '@core/services/social-insurance-revision.service';
import { AgeEventContextService } from '@core/services/age-event-notification.service';
import { CompanyService } from '@core/services/company.service';
import { EmployeeService } from '@core/services/employee.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee } from '@features/employees/models/employee.model';
import { isRetiredEmployee } from '@features/employees/utils/retirement.utils';
import {
  PayrollBreakdownModalComponent,
  PayrollBreakdownValue,
} from '@features/payroll/components/payroll-breakdown-modal/payroll-breakdown-modal.component';
import { PayrollAdjustmentModalComponent } from '@features/payroll/components/payroll-adjustment-modal/payroll-adjustment-modal.component';
import { PayrollEntry, PayrollRecord } from '@features/payroll/models/compensation.model';
import {
  PayrollAdjustmentFormValue,
  findPayrollAdjustmentOption,
} from '@features/payroll/models/payroll-adjustment.model';
import {
  calculateFixedWagesTotal,
  calculatePayrollDisplayTotal,
  calculatePayrollEntryFixedWages,
  calculatePayrollPreAdjustmentTotal,
  employeeFullName,
  filterEmployeesForTargetMonth,
  formatTargetMonthLabel,
  getCurrentYearMonthKey,
  getNextYearMonthKey,
  getPreviousYearMonthKey,
  isFirstPayrollMonth,
  isBeforeHireMonth,
  isPayrollEntryLocked,
  isPayrollRowEditable,
  isRegistrationInitialPayrollRow,
  parseYearMonthKey,
  buildPayrollEntryFromFormValues,
  extractPayrollRowFormValues,
  mergePayrollRecords,
  resolvePayrollEntryForMonth,
  resolvePayrollAllowances,
  resolvePayrollBaseDays,
  roundNonNegativePayrollYen,
  resolvePayrollBaseSalary,
  toEmployeeAllowances,
  toYearMonthKeyFromParts,
} from '@features/payroll/utils/compensation.utils';
import {
  loadStoredTargetMonth,
  PAYROLL_STORAGE_KEYS,
  saveStoredTargetMonth,
} from '@features/payroll/utils/payroll-storage.utils';
import { buildMonthlyLockConfirmMessage } from '@features/payroll/utils/monthly-lock-confirm.utils';
import {
  buildUnappliedRevisionBlockMessage,
} from '@features/payroll/utils/pending-revision-application.utils';
import { expandPayrollLoadMonthsWithRegistrationHistory } from '@features/payroll/utils/payroll-engine-sync.utils';
import {
  canLockPayrollMonthSequentially,
  canSaveCompensationForTargetMonth,
  isSystemStartMonth,
  isBeforeSystemStartMonth,
  PREVIOUS_MONTH_NOT_LOCKED_MESSAGE,
  PREVIOUS_MONTH_NOT_LOCKED_COMPENSATION_SAVE_GUARD_MESSAGE,
  PREVIOUS_MONTH_NOT_LOCKED_COMPENSATION_SAVE_MESSAGE,
  PRE_SYSTEM_START_HISTORY_COMPENSATION_MESSAGE,
  shouldShowPreviousMonthNotLockedCompensationSaveWarning,
} from '@features/payroll/utils/monthly-lock.utils';
import { normalizeYearMonthKey } from '@features/payroll/utils/system-operation-month.utils';
import { CompanyAllowance } from '@features/settings/models/company-settings.model';
import { YearSelectComponent } from '@shared/components/year-select/year-select.component';
import { ToastService } from '@shared/services/toast.service';
import { RetiredEmployeeBadgeComponent } from '@shared/components/retired-employee-badge/retired-employee-badge.component';
import { SocialInsuranceTypeBadgeComponent } from '@shared/components/social-insurance-type-badge/social-insurance-type-badge.component';
import {
  matchesSocialInsuranceCategoryFilter,
  SOCIAL_INSURANCE_CATEGORY_FILTER_OPTIONS,
  SocialInsuranceCategoryFilter,
} from '@features/employees/utils/social-insurance-type-filter.utils';
import { BehaviorSubject, combineLatest, EMPTY, from, map, merge, startWith, switchMap } from 'rxjs';

type AllowanceFormGroup = FormGroup<{
  name: FormControl<string>;
  amount: FormControl<number>;
}>;

type PayrollRowFormGroup = FormGroup<{
  employeeId: FormControl<string>;
  employeeNumber: FormControl<string>;
  employeeName: FormControl<string>;
  locked: FormControl<boolean>;
  baseSalary: FormControl<number>;
  allowances: FormArray<AllowanceFormGroup>;
  nonFixedWages: FormControl<number>;
  adjustmentAmount: FormControl<number>;
  adjustmentType: FormControl<PayrollAdjustmentFormValue['adjustmentType']>;
  adjustmentTargetMonth: FormControl<string>;
  baseDays: FormControl<number>;
}>;

@Component({
  selector: 'app-monthly-payroll-table',
  standalone: true,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    PayrollBreakdownModalComponent,
    PayrollAdjustmentModalComponent,
    YearSelectComponent,
    RetiredEmployeeBadgeComponent,
    SocialInsuranceTypeBadgeComponent,
  ],
  templateUrl: './monthly-payroll-table.component.html',
  styleUrl: './monthly-payroll-table.component.scss',
})
export class MonthlyPayrollTableComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly employeeService = inject(EmployeeService);
  private readonly companyService = inject(CompanyService);
  private readonly compensationService = inject(CompensationService);
  private readonly revisionService = inject(SocialInsuranceRevisionService);
  private readonly monthlyLockService = inject(MonthlyLockService);
  private readonly ageEventContext = inject(AgeEventContextService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toast = inject(ToastService);

  readonly targetMonth = signal(getCurrentYearMonthKey());
  readonly isTargetMonthLocked = signal(false);
  readonly previousMonthLocked = signal<boolean | null>(null);
  readonly systemStartDate = signal('');
  readonly companySettingsLoaded = signal(false);
  readonly latestLockedMonth = signal<string | null>(null);
  readonly lockStateRefreshToken = signal(0);
  readonly lockActionError = signal('');
  readonly lockingMonth = signal(false);
  readonly loading = signal(true);
  /** 対象月のフォーム再構築中（月切替直後の entries 空状態と区別する） */
  readonly formRebuildInProgress = signal(false);
  /** rebuildForm 完了後の行数（FormArray.length の ChangeDetection 遅延を避ける） */
  readonly entriesCount = signal(0);
  /** 現在の対象月について rebuildForm が少なくとも1回完了したか */
  readonly formDataReady = signal(false);
  readonly loadError = signal('');
  readonly rowTotals = signal<number[]>([]);
  readonly rowFixedTotals = signal<number[]>([]);
  readonly savingState = signal<Record<string, boolean>>({});
  readonly rowErrors = signal<Record<string, string>>({});

  readonly breakdownModalOpen = signal(false);
  readonly breakdownRowIndex = signal<number | null>(null);
  readonly breakdownValue = signal<PayrollBreakdownValue | null>(null);
  readonly breakdownSaving = signal(false);
  readonly breakdownError = signal('');

  readonly adjustmentModalOpen = signal(false);
  readonly adjustmentRowIndex = signal<number | null>(null);
  readonly adjustmentValue = signal<PayrollAdjustmentFormValue>({
    adjustmentAmount: 0,
    adjustmentType: null,
    adjustmentTargetMonth: '',
  });
  readonly adjustmentPreAdjustmentTotal = signal(0);

  readonly hasUnappliedRevision = signal(false);
  readonly unappliedRevisionCheckReady = signal(false);
  readonly unappliedRevisionBlockMessage = computed(() =>
    buildUnappliedRevisionBlockMessage(
      normalizeYearMonthKey(this.targetMonth()) ?? this.targetMonth().trim()
    )
  );
  readonly monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);
  readonly socialInsuranceFilter = signal<SocialInsuranceCategoryFilter>('all');
  readonly socialInsuranceFilterOptions = SOCIAL_INSURANCE_CATEGORY_FILTER_OPTIONS;
  private unappliedRevisionCheckVersion = 0;

  readonly canConfirmTargetMonthLock = computed(() => {
    if (this.isTargetMonthBeforeSystemStart()) {
      return false;
    }

    if (this.isTargetMonthLocked() || this.loading()) {
      return false;
    }

    if (!this.companySettingsLoaded()) {
      return false;
    }

    const targetMonth = normalizeYearMonthKey(this.targetMonth()) ?? this.targetMonth().trim();
    const systemStartDate = normalizeYearMonthKey(this.systemStartDate()) ?? '';

    if (isSystemStartMonth(targetMonth, systemStartDate)) {
      return true;
    }

    const previousLocked = this.previousMonthLocked();
    if (previousLocked === null) {
      return false;
    }

    return canLockPayrollMonthSequentially({
      targetMonth,
      previousMonthLocked: previousLocked,
      systemStartDate,
      latestLockedMonth: this.latestLockedMonth(),
    });
  });

  readonly showPreviousMonthNotLockedWarning = computed(() => {
    if (this.isTargetMonthLocked() || this.loading() || !this.companySettingsLoaded()) {
      return false;
    }

    const targetMonth = normalizeYearMonthKey(this.targetMonth()) ?? this.targetMonth().trim();
    const systemStartDate = normalizeYearMonthKey(this.systemStartDate()) ?? '';

    if (isSystemStartMonth(targetMonth, systemStartDate)) {
      return false;
    }

    const previousLocked = this.previousMonthLocked();
    if (previousLocked === null) {
      return false;
    }

    return !canLockPayrollMonthSequentially({
      targetMonth,
      previousMonthLocked: previousLocked,
      systemStartDate,
      latestLockedMonth: this.latestLockedMonth(),
    });
  });

  readonly previousMonthNotLockedMessage = PREVIOUS_MONTH_NOT_LOCKED_MESSAGE;
  readonly previousMonthNotLockedCompensationSaveMessage =
    PREVIOUS_MONTH_NOT_LOCKED_COMPENSATION_SAVE_MESSAGE;
  readonly preSystemStartHistoryCompensationMessage =
    PRE_SYSTEM_START_HISTORY_COMPENSATION_MESSAGE;

  readonly isTargetMonthBeforeSystemStart = computed(() =>
    isBeforeSystemStartMonth(this.targetMonth(), this.systemStartDate())
  );

  readonly canSaveCompensationForTargetMonth = computed(() =>
    canSaveCompensationForTargetMonth({
      targetMonth: this.targetMonth(),
      previousMonthLocked: this.previousMonthLocked(),
      systemStartDate: this.systemStartDate(),
      companySettingsLoaded: this.companySettingsLoaded(),
    })
  );

  readonly showPreviousMonthNotLockedCompensationSaveWarning = computed(() =>
    shouldShowPreviousMonthNotLockedCompensationSaveWarning({
      targetMonth: this.targetMonth(),
      previousMonthLocked: this.previousMonthLocked(),
      systemStartDate: this.systemStartDate(),
      companySettingsLoaded: this.companySettingsLoaded(),
    })
  );

  /** 確定ボタンの disabled 状態（全条件評価後に1箇所で更新） */
  private readonly confirmButtonDisabledSubject = new BehaviorSubject<boolean>(true);
  readonly confirmButtonDisabled = toSignal(this.confirmButtonDisabledSubject, {
    initialValue: true,
  });

  /** toObservable は inject() 依存のためフィールド初期化時のみ生成する */
  private readonly targetMonth$ = toObservable(this.targetMonth);
  private readonly lockStateRefreshToken$ = toObservable(this.lockStateRefreshToken);
  private readonly companySettingsLoaded$ = toObservable(this.companySettingsLoaded);

  private readonly employees = signal<Employee[]>([]);
  private readonly employees$ = toObservable(this.employees);
  private readonly companyAllowances = signal<CompanyAllowance[]>([]);
  private readonly allowancesLoaded = signal(false);
  private readonly previousMonthRecord = signal<PayrollRecord | null>(null);
  private readonly targetMonthPayrollRecord = signal<PayrollRecord | null>(null);
  private readonly employeeById = signal<Record<string, Employee>>({});
  private rebuildVersion = 0;

  readonly form = this.fb.group({
    entries: this.fb.array<PayrollRowFormGroup>([]),
  });

  constructor() {
    effect(() => {
      this.targetMonth();
      this.loading();
      this.lockingMonth();
      this.formRebuildInProgress();
      this.entriesCount();
      this.formDataReady();
      this.isTargetMonthLocked();
      this.previousMonthLocked();
      this.companySettingsLoaded();
      this.latestLockedMonth();
      this.isTargetMonthBeforeSystemStart();
      this.systemStartDate();
      this.canConfirmTargetMonthLock();
      this.hasUnappliedRevision();
      this.unappliedRevisionCheckReady();

      untracked(() => this.refreshConfirmButtonDisabledState('effect'));
    });

    this.watchPreviousMonthLockState();
    this.checkUnappliedRevision();
  }

  ngOnInit(): void {
    const storedMonth =
      normalizeYearMonthKey(
        loadStoredTargetMonth(PAYROLL_STORAGE_KEYS.monthly, getCurrentYearMonthKey())
      ) ?? getCurrentYearMonthKey();
    this.targetMonth.set(storedMonth);
    this.ageEventContext.setPayrollTargetYearMonth(storedMonth);

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => {
          this.employees.set(employees);
          this.employeeById.set(Object.fromEntries(employees.map((employee) => [employee.id, employee])));
          this.loadError.set('');
          this.loading.set(false);
          void this.rebuildForm();
        },
        error: (error) => {
          this.loadError.set(
            error instanceof Error && error.message === 'ログインしていません'
              ? 'ログインしていません。再度ログインしてください。'
              : toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました')
          );
          this.employees.set([]);
          this.employeeById.set({});
          this.loading.set(false);
        },
      });

    void this.loadCompanyAllowances();
  }

  private checkUnappliedRevision(): void {
    combineLatest([
      this.targetMonth$,
      this.employees$,
      this.lockStateRefreshToken$,
      this.companySettingsLoaded$,
    ])
      .pipe(
        switchMap(([targetMonth, employees, , companyLoaded]) => {
          if (!companyLoaded) {
            this.hasUnappliedRevision.set(false);
            this.unappliedRevisionCheckReady.set(true);
            return EMPTY;
          }

          const normalizedTarget =
            normalizeYearMonthKey(targetMonth) ?? targetMonth.trim();
          if (!normalizedTarget || employees.length === 0) {
            this.hasUnappliedRevision.set(false);
            this.unappliedRevisionCheckReady.set(true);
            return EMPTY;
          }

          const version = ++this.unappliedRevisionCheckVersion;
          this.unappliedRevisionCheckReady.set(false);

          const baseMonths =
            this.revisionService.collectPayrollMonthsForPendingRevisionCheck(
              normalizedTarget
            );
          const loadFrom = baseMonths[0] ?? normalizedTarget;
          const loadTo = baseMonths.at(-1) ?? normalizedTarget;
          const monthsToLoad = expandPayrollLoadMonthsWithRegistrationHistory(
            baseMonths,
            employees,
            loadFrom,
            loadTo
          );

          return from(this.compensationService.getPayrollRecordsForMonths(monthsToLoad)).pipe(
            map((payrollRecords) => ({
              version,
              normalizedTarget,
              employees,
              payrollRecords,
            }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ version, normalizedTarget, employees, payrollRecords }) => {
          if (version !== this.unappliedRevisionCheckVersion) {
            return;
          }

          const hasUnapplied = this.revisionService.checkUnappliedRevisionForMonth(
            normalizedTarget,
            employees,
            payrollRecords
          );
          this.hasUnappliedRevision.set(hasUnapplied);
          this.unappliedRevisionCheckReady.set(true);
          this.refreshConfirmButtonDisabledState('unappliedRevisionCheck');
        },
        error: () => {
          this.hasUnappliedRevision.set(false);
          this.unappliedRevisionCheckReady.set(true);
          this.refreshConfirmButtonDisabledState('unappliedRevisionCheck:error');
        },
      });
  }

  private watchPreviousMonthLockState(): void {
    combineLatest([
      this.targetMonth$,
      this.lockStateRefreshToken$,
      this.companySettingsLoaded$,
    ])
      .pipe(
        switchMap(([targetMonth, , companyLoaded]) => {
          if (!companyLoaded) {
            this.previousMonthLocked.set(null);
            return EMPTY;
          }

          const normalizedTarget = normalizeYearMonthKey(targetMonth) ?? targetMonth.trim();
          const previousMonth = getPreviousYearMonthKey(normalizedTarget);
          this.previousMonthLocked.set(null);
          this.monthlyLockService.invalidateMonthLockCache(previousMonth);

          return this.monthlyLockService.watchMonthLocked(previousMonth);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (locked) => {
          this.previousMonthLocked.set(locked);
          this.refreshConfirmButtonDisabledState('previousMonthLock');
        },
        error: () => {
          this.previousMonthLocked.set(false);
          this.refreshConfirmButtonDisabledState('previousMonthLock:error');
        },
      });
  }

  /**
   * 確定ボタンの disabled 条件を一括評価する。
   * HTML: loading || lockingMonth || formRebuildInProgress || (formDataReady && entriesCount===0) || !canConfirmTargetMonthLock
   */
  private refreshConfirmButtonDisabledState(source: string): void {
    const loading = this.loading();
    const lockingMonth = this.lockingMonth();
    const formRebuildInProgress = this.formRebuildInProgress();
    const formDataReady = this.formDataReady();
    const entriesCount = this.entriesCount();
    const canConfirm = this.canConfirmTargetMonthLock();
    const hasUnappliedRevision = this.hasUnappliedRevision();
    const unappliedRevisionCheckReady = this.unappliedRevisionCheckReady();
    const isTargetLocked = this.isTargetMonthLocked();
    const previousMonthLocked = this.previousMonthLocked();

    const hasNoEligibleRows =
      formDataReady && !formRebuildInProgress && !loading && entriesCount === 0;

    const disabled =
      isTargetLocked ||
      loading ||
      lockingMonth ||
      formRebuildInProgress ||
      hasNoEligibleRows ||
      !unappliedRevisionCheckReady ||
      hasUnappliedRevision ||
      !canConfirm;

    console.log('[Disabled判定]', {
      source,
      disabled,
      前月ロックOK: canConfirm,
      行データ数: entriesCount,
      formArrayLength: this.entries.length,
      loading,
      lockingMonth,
      formRebuildInProgress,
      formDataReady,
      hasNoEligibleRows,
      isTargetLocked,
      previousMonthLocked,
      unappliedRevisionCheckReady,
      hasUnappliedRevision,
      targetMonth: this.targetMonth(),
      latestLockedMonth: this.latestLockedMonth(),
    });

    this.confirmButtonDisabledSubject.next(disabled);
    this.cdr.detectChanges();
  }

  get entries(): FormArray<PayrollRowFormGroup> {
    return this.form.controls.entries;
  }

  targetMonthLabel(): string {
    return formatTargetMonthLabel(this.targetMonth());
  }

  isRetiredRow(index: number): boolean {
    const employeeId = this.entries.at(index)?.controls.employeeId.value;
    if (!employeeId) {
      return false;
    }

    const employee = this.employeeById()[employeeId];
    return employee ? isRetiredEmployee(employee) : false;
  }

  employeeForRow(index: number): Employee | undefined {
    const employeeId = this.entries.at(index)?.controls.employeeId.value;
    return employeeId ? this.employeeById()[employeeId] : undefined;
  }

  visibleRowIndices(): number[] {
    const filter = this.socialInsuranceFilter();

    return this.entries.controls.reduce<number[]>((indices, _, index) => {
      const employee = this.employeeForRow(index);
      if (employee && matchesSocialInsuranceCategoryFilter(employee, filter)) {
        indices.push(index);
      }

      return indices;
    }, []);
  }

  onSocialInsuranceFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SocialInsuranceCategoryFilter;
    this.socialInsuranceFilter.set(value);
  }

  selectedYear(): number {
    return parseYearMonthKey(this.targetMonth()).year;
  }

  selectedMonth(): number {
    return parseYearMonthKey(this.targetMonth()).month;
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

  private setTargetMonth(yearMonth: string): void {
    const normalized = normalizeYearMonthKey(yearMonth) ?? yearMonth.trim();
    this.targetMonth.set(normalized);
    this.ageEventContext.setPayrollTargetYearMonth(normalized);
    saveStoredTargetMonth(PAYROLL_STORAGE_KEYS.monthly, normalized);
    this.rowErrors.set({});
    this.entries.clear();
    this.rowTotals.set([]);
    this.rowFixedTotals.set([]);
    this.entriesCount.set(0);
    this.formDataReady.set(false);
    this.formRebuildInProgress.set(true);
    this.refreshConfirmButtonDisabledState('setTargetMonth');
    void this.refreshLatestLockedMonth();
    void this.rebuildForm();
  }

  isRowLocked(index: number): boolean {
    return this.entries.at(index).controls.locked.value === true;
  }

  isRowBeforeHire(index: number): boolean {
    const employeeId = this.entries.at(index).controls.employeeId.value;
    const employee = this.employeeById()[employeeId];
    if (!employee) {
      return false;
    }

    return isBeforeHireMonth(employee, this.targetMonth());
  }

  isRowRegistrationLocked(index: number): boolean {
    const employeeId = this.entries.at(index).controls.employeeId.value;
    const employee = this.employeeById()[employeeId];
    if (!employee) {
      return false;
    }

    return isRegistrationInitialPayrollRow(employee, this.targetMonth());
  }

  isRowDisabled(index: number): boolean {
    const employeeId = this.entries.at(index)?.controls.employeeId.value;
    return (
      !this.canSaveCompensationForTargetMonth() ||
      this.isTargetMonthLocked() ||
      this.isRowLocked(index) ||
      this.isRowBeforeHire(index) ||
      this.isRowRegistrationLocked(index) ||
      (employeeId ? this.isRowSaving(employeeId) : false)
    );
  }

  async confirmLockTargetMonth(): Promise<void> {
    if (this.isTargetMonthBeforeSystemStart()) {
      return;
    }

    if (!this.unappliedRevisionCheckReady()) {
      return;
    }

    if (this.hasUnappliedRevision()) {
      this.lockActionError.set(this.unappliedRevisionBlockMessage());
      return;
    }

    if (this.confirmButtonDisabled() || this.lockingMonth()) {
      return;
    }

    this.lockActionError.set('');

    const targetMonth = normalizeYearMonthKey(this.targetMonth()) ?? this.targetMonth().trim();

    if (!confirm(buildMonthlyLockConfirmMessage(targetMonth))) {
      return;
    }

    this.lockingMonth.set(true);

    try {
      await this.monthlyLockService.lockPayrollMonth(
        targetMonth,
        this.employees(),
        this.targetMonthPayrollRecord()
      );
      this.isTargetMonthLocked.set(true);
      this.monthlyLockService.rememberMonthLocked(targetMonth, true);
      this.lockStateRefreshToken.update((value) => value + 1);
      await this.refreshLatestLockedMonth();
      this.syncAllRowControlStates();
    } catch (error) {
      this.lockActionError.set(
        error instanceof Error ? error.message : '月次確定に失敗しました'
      );
    } finally {
      this.lockingMonth.set(false);
      this.refreshConfirmButtonDisabledState('confirmLockTargetMonth:finally');
    }
  }

  rowTotal(index: number): number {
    return this.rowTotals()[index] ?? 0;
  }

  rowFixedTotal(index: number): number {
    return this.rowFixedTotals()[index] ?? 0;
  }

  hasRowAdjustment(index: number): boolean {
    return this.entries.at(index).controls.adjustmentAmount.value !== 0;
  }

  rowAdjustmentNote(index: number): string {
    const group = this.entries.at(index);
    const amount = group.controls.adjustmentAmount.value;
    if (amount === 0) {
      return '';
    }

    const typeLabel =
      findPayrollAdjustmentOption(group.controls.adjustmentType.value)?.label ?? '調整';
    const formattedAmount =
      amount > 0 ? `+${amount.toLocaleString('ja-JP')}` : amount.toLocaleString('ja-JP');

    return `※調整: ${formattedAmount}円（${typeLabel}）`;
  }

  canSaveRow(index: number): boolean {
    if (!this.canSaveCompensationForTargetMonth() || this.isRowDisabled(index)) {
      return false;
    }

    const employeeId = this.entries.at(index).controls.employeeId.value;
    const employee = this.employeeById()[employeeId];
    if (!employee) {
      return false;
    }

    if (isFirstPayrollMonth(employee, this.targetMonth())) {
      return true;
    }

    const previousMonth = getPreviousYearMonthKey(this.targetMonth());
    const previousEntry = resolvePayrollEntryForMonth(
      employee,
      previousMonth,
      this.previousMonthRecord()
    );

    return isPayrollEntryLocked(previousEntry);
  }

  isRowSaving(employeeId: string): boolean {
    return Boolean(this.savingState()[employeeId]);
  }

  private markRowSaving(employeeId: string, group: PayrollRowFormGroup): void {
    this.savingState.update((state) => ({ ...state, [employeeId]: true }));
    this.setPayrollRowInputsEnabled(group, false);
    this.cdr.detectChanges();
  }

  private clearRowSaving(employeeId: string, group: PayrollRowFormGroup): void {
    this.savingState.update((state) => {
      const next = { ...state };
      delete next[employeeId];
      return next;
    });

    if (!group.controls.locked.value) {
      const employee = this.employeeById()[employeeId];
      if (employee) {
        this.applyRowControlStateAfterInit(
          group,
          employee,
          resolvePayrollEntryForMonth(
            employee,
            this.targetMonth(),
            this.targetMonthPayrollRecord()
          )
        );
      }
    }

    this.cdr.detectChanges();
  }

  rowError(employeeId: string): string {
    return this.rowErrors()[employeeId] ?? '';
  }

  needsPreviousMonthSave(index: number): boolean {
    if (!this.canSaveCompensationForTargetMonth()) {
      return false;
    }

    return !this.isRowDisabled(index) && !this.canSaveRow(index);
  }

  private assertCompensationSaveAllowed(): boolean {
    if (this.canSaveCompensationForTargetMonth()) {
      return true;
    }

    this.toast.show(PREVIOUS_MONTH_NOT_LOCKED_COMPENSATION_SAVE_GUARD_MESSAGE);
    return false;
  }

  openAdjustmentModal(index: number): void {
    if (this.isRowDisabled(index)) {
      return;
    }

    const group = this.entries.at(index);
    const raw = group.getRawValue();
    this.adjustmentRowIndex.set(index);
    this.adjustmentPreAdjustmentTotal.set(
      calculatePayrollPreAdjustmentTotal(
        raw.baseSalary,
        raw.allowances,
        raw.nonFixedWages
      )
    );
    this.adjustmentValue.set({
      adjustmentAmount: group.controls.adjustmentAmount.value,
      adjustmentType: group.controls.adjustmentType.value,
      adjustmentTargetMonth: group.controls.adjustmentTargetMonth.value,
    });
    this.adjustmentModalOpen.set(true);
  }

  onAdjustmentModalClosed(): void {
    this.adjustmentModalOpen.set(false);
    this.adjustmentRowIndex.set(null);
    this.adjustmentPreAdjustmentTotal.set(0);
    this.adjustmentValue.set({
      adjustmentAmount: 0,
      adjustmentType: null,
      adjustmentTargetMonth: '',
    });
  }

  onAdjustmentConfirmed(value: PayrollAdjustmentFormValue): void {
    const index = this.adjustmentRowIndex();
    if (index == null) {
      return;
    }

    const group = this.entries.at(index);
    group.controls.adjustmentAmount.setValue(value.adjustmentAmount);
    group.controls.adjustmentType.setValue(value.adjustmentType);
    group.controls.adjustmentTargetMonth.setValue(value.adjustmentTargetMonth);
    this.onAdjustmentModalClosed();
  }

  openBreakdownModal(index: number): void {
    if (this.isRowDisabled(index)) {
      return;
    }

    const group = this.entries.at(index);
    const raw = group.getRawValue();

    this.breakdownError.set('');
    this.breakdownRowIndex.set(index);
    this.breakdownValue.set({
      baseSalary: raw.baseSalary,
      allowances: raw.allowances.map((row) => ({
        name: row.name,
        amount: row.amount,
      })),
    });
    this.breakdownModalOpen.set(true);
  }

  onBreakdownModalClosed(): void {
    this.breakdownModalOpen.set(false);
    this.breakdownRowIndex.set(null);
    this.breakdownValue.set(null);
    this.breakdownSaving.set(false);
    this.breakdownError.set('');
  }

  async onBreakdownConfirmed(value: PayrollBreakdownValue): Promise<void> {
    const index = this.breakdownRowIndex();
    if (index == null || this.breakdownSaving() || this.isTargetMonthLocked()) {
      return;
    }

    const group = this.entries.at(index);
    const employeeId = group.controls.employeeId.value;

    group.controls.baseSalary.setValue(value.baseSalary);

    value.allowances.forEach((row, allowanceIndex) => {
      const allowanceGroup = group.controls.allowances.at(allowanceIndex);
      if (allowanceGroup) {
        allowanceGroup.patchValue(row);
      }
    });

    this.breakdownSaving.set(true);
    this.breakdownError.set('');

    try {
      const employeeAllowances = toEmployeeAllowances(value.allowances);

      await this.employeeService.updateEmployeePayrollData(
        employeeId,
        {
          baseSalary: value.baseSalary,
          allowances: employeeAllowances,
        },
        this.targetMonth()
      );

      this.syncEmployeeMasterLocally(employeeId, value.baseSalary, employeeAllowances);
      this.onBreakdownModalClosed();
    } catch (error) {
      this.breakdownError.set(
        error instanceof Error ? error.message : '従業員マスタの更新に失敗しました'
      );
    } finally {
      this.breakdownSaving.set(false);
    }
  }

  private syncEmployeeMasterLocally(
    employeeId: string,
    baseSalary: number,
    allowances: Employee['allowances']
  ): void {
    this.employees.update((employees) =>
      employees.map((employee) =>
        employee.id === employeeId ? { ...employee, baseSalary, allowances } : employee
      )
    );

    this.employeeById.update((map) => {
      const employee = map[employeeId];
      if (!employee) {
        return map;
      }

      return {
        ...map,
        [employeeId]: { ...employee, baseSalary, allowances },
      };
    });
  }

  async onSaveRow(index: number): Promise<void> {
    const group = this.entries.at(index);
    const employeeId = group.controls.employeeId.value?.trim();

    if (!employeeId || this.isRowSaving(employeeId)) {
      return;
    }

    if (!this.assertCompensationSaveAllowed()) {
      return;
    }

    if (
      group.controls.locked.value === true ||
      this.isRowRegistrationLocked(index) ||
      !this.canSaveRow(index)
    ) {
      return;
    }

    this.syncRowFormValuesFromDom(index);
    group.updateValueAndValidity();

    if (group.invalid) {
      group.markAllAsTouched();
      return;
    }

    const entry = this.buildPayrollEntry(group);

    this.markRowSaving(employeeId, group);
    this.rowErrors.update((errors) => {
      const next = { ...errors };
      delete next[employeeId];
      return next;
    });

    try {
      await this.compensationService.upsertPayrollEntry(this.targetMonth(), entry);
      this.mergePayrollEntryIntoLocalRecord(entry);
      await this.employeeService.updateEmployeePayrollData(
        employeeId,
        {
          baseSalary: entry.baseSalary,
          allowances: toEmployeeAllowances(entry.allowances),
        },
        this.targetMonth()
      );

      const employee = this.employeeById()[employeeId];
      if (employee) {
        const fixedWages = calculatePayrollEntryFixedWages(entry.baseSalary, entry.allowances);
        await this.employeeService.syncMasterStandardRemunerationIfHireMonthPayroll(
          employeeId,
          this.targetMonth(),
          employee.hireDate,
          fixedWages
        );
        await this.employeeService.applyScheduledAnnualDeterminationOnPayrollSave(
          employeeId,
          this.targetMonth(),
          employee
        );
      }

      group.controls.locked.setValue(true);
      const updatedEmployee = this.employeeById()[employeeId];
      if (updatedEmployee) {
        this.applyRowControlStateAfterInit(group, updatedEmployee, { ...entry, locked: true });
      }
    } catch (error) {
      this.rowErrors.update((errors) => ({
        ...errors,
        [employeeId]: error instanceof Error ? error.message : '保存に失敗しました',
      }));
    } finally {
      this.clearRowSaving(employeeId, group);
    }
  }

  private async loadCompanyAllowances(): Promise<void> {
    this.companySettingsLoaded.set(false);

    try {
      const company = await this.companyService.getCompanyForCurrentUser();
      this.companyAllowances.set(company?.allowances ?? []);
      this.systemStartDate.set(normalizeYearMonthKey(company?.systemStartDate) ?? '');
      await this.refreshLatestLockedMonth();
    } catch {
      this.companyAllowances.set([]);
      this.systemStartDate.set('');
      this.latestLockedMonth.set(null);
    } finally {
      this.companySettingsLoaded.set(true);
      this.allowancesLoaded.set(true);
      if (!this.loading()) {
        void this.rebuildForm();
      }
    }
  }

  private async refreshLatestLockedMonth(): Promise<void> {
    try {
      this.latestLockedMonth.set(await this.monthlyLockService.getLatestLockedMonth());
    } catch {
      this.latestLockedMonth.set(null);
    }
  }

  private async rebuildForm(): Promise<void> {
    if (this.loading() || !this.allowancesLoaded()) {
      return;
    }

    const version = ++this.rebuildVersion;
    this.formRebuildInProgress.set(true);
    this.refreshConfirmButtonDisabledState('rebuildForm:start');

    const eligibleEmployees = filterEmployeesForTargetMonth(
      this.employees(),
      this.targetMonth()
    );
    const previousMonth = getPreviousYearMonthKey(this.targetMonth());

    let savedRecord: PayrollRecord | null = null;
    let previousRecord: PayrollRecord | null = null;
    let rebuildSucceeded = false;

    try {
      const targetMonth = this.targetMonth();
      const [fetchedRecord, previousRecordResult] = await Promise.all([
        this.compensationService.getPayrollRecord(targetMonth),
        this.compensationService.getPayrollRecord(previousMonth),
      ]);

      if (version !== this.rebuildVersion) {
        return;
      }

      savedRecord = mergePayrollRecords(
        fetchedRecord,
        this.targetMonthPayrollRecord(),
        targetMonth
      );
      previousRecord = previousRecordResult;
      await Promise.all([this.refreshTargetMonthLock(), this.refreshLatestLockedMonth()]);

      if (version !== this.rebuildVersion) {
        return;
      }

      this.previousMonthRecord.set(previousRecord);
      this.targetMonthPayrollRecord.set(savedRecord);
      this.entries.clear();
      this.rowTotals.set([]);
      this.rowFixedTotals.set([]);

      eligibleEmployees.forEach((employee, index) => {
        const savedEntry = resolvePayrollEntryForMonth(employee, this.targetMonth(), savedRecord);
        const group = this.createRowGroup(employee, savedEntry);
        this.entries.push(group);
        this.attachRowTotalWatcher(index, group);
        this.applyRowControlStateAfterInit(group, employee, savedEntry);
      });

      this.syncAllRowControlStates();
      this.entriesCount.set(eligibleEmployees.length);
      this.formDataReady.set(true);
      rebuildSucceeded = true;
    } catch (error) {
      if (version !== this.rebuildVersion) {
        return;
      }

      this.loadError.set(
        error instanceof Error ? error.message : '保存データの取得に失敗しました'
      );
      this.entriesCount.set(this.entries.length);
      this.formDataReady.set(true);
    } finally {
      if (version === this.rebuildVersion) {
        this.formRebuildInProgress.set(false);
        this.refreshConfirmButtonDisabledState(
          rebuildSucceeded ? 'rebuildForm:complete' : 'rebuildForm:finally'
        );
      }
    }
  }

  private syncAllRowControlStates(): void {
    const savedRecord = this.targetMonthPayrollRecord();

    this.entries.controls.forEach((group) => {
      const employeeId = group.controls.employeeId.value;
      const employee = this.employeeById()[employeeId];
      if (!employee) {
        return;
      }

      const savedEntry = resolvePayrollEntryForMonth(employee, this.targetMonth(), savedRecord);
      this.applyRowControlStateAfterInit(group, employee, savedEntry);
    });
  }

  private isRowSaved(group: PayrollRowFormGroup, savedEntry: PayrollEntry | null): boolean {
    return isPayrollEntryLocked(savedEntry) || group.controls.locked.value === true;
  }

  private applyRowControlStateAfterInit(
    group: PayrollRowFormGroup,
    employee: Employee,
    savedEntry: PayrollEntry | null
  ): void {
    group.controls.employeeNumber.disable({ emitEvent: false });
    group.controls.employeeName.disable({ emitEvent: false });
    group.controls.locked.enable({ emitEvent: false });

    const saved = this.isRowSaved(group, savedEntry);
    const registrationLocked = isRegistrationInitialPayrollRow(
      employee,
      this.targetMonth(),
      savedEntry
    );
    const beforeHire = isBeforeHireMonth(employee, this.targetMonth());
    const monthLocked = this.isTargetMonthLocked();

    const inputsEnabled =
      !monthLocked &&
      !saved &&
      !registrationLocked &&
      !beforeHire &&
      isPayrollRowEditable(employee, this.targetMonth(), savedEntry);

    this.setPayrollRowInputsEnabled(group, inputsEnabled);
  }

  private mergePayrollEntryIntoLocalRecord(entry: PayrollEntry): void {
    const targetMonth = this.targetMonth();
    const current = this.targetMonthPayrollRecord();
    const entries = [...(current?.entries ?? [])];
    const index = entries.findIndex((row) => row.employeeId === entry.employeeId);

    if (index >= 0) {
      entries[index] = entry;
    } else {
      entries.push(entry);
    }

    this.targetMonthPayrollRecord.set({
      targetMonth,
      entries,
    });
  }

  private async refreshTargetMonthLock(): Promise<void> {
    try {
      const targetMonth = normalizeYearMonthKey(this.targetMonth()) ?? this.targetMonth().trim();
      this.monthlyLockService.invalidateMonthLockCache(targetMonth);
      this.isTargetMonthLocked.set(await this.monthlyLockService.isMonthLocked(targetMonth));
    } catch {
      this.isTargetMonthLocked.set(false);
    } finally {
      this.refreshConfirmButtonDisabledState('refreshTargetMonthLock');
    }
  }

  private setPayrollRowInputsEnabled(group: PayrollRowFormGroup, enabled: boolean): void {
    const toggle = enabled ? 'enable' : 'disable';
    const opts = { emitEvent: false };

    group.controls.baseSalary[toggle](opts);
    group.controls.nonFixedWages[toggle](opts);
    group.controls.adjustmentAmount[toggle](opts);
    group.controls.adjustmentType[toggle](opts);
    group.controls.adjustmentTargetMonth[toggle](opts);
    group.controls.baseDays[toggle](opts);
    group.controls.allowances[toggle](opts);

    for (const allowance of group.controls.allowances.controls) {
      allowance.controls.amount[toggle](opts);
    }
  }

  private createRowGroup(
    employee: Employee,
    savedEntry: PayrollEntry | null
  ): PayrollRowFormGroup {
    const allowanceRows = resolvePayrollAllowances(
      employee,
      this.companyAllowances(),
      savedEntry
    );
    const baseDays = resolvePayrollBaseDays(savedEntry, this.targetMonth());
    const saved =
      isPayrollEntryLocked(savedEntry) ||
      isRegistrationInitialPayrollRow(employee, this.targetMonth(), savedEntry);

    return this.fb.group({
      employeeId: employee.id,
      employeeNumber: this.fb.control({ value: employee.employeeNumber, disabled: true }),
      employeeName: this.fb.control({ value: employeeFullName(employee), disabled: true }),
      locked: this.fb.control(saved),
      baseSalary: this.fb.control(
        {
          value: resolvePayrollBaseSalary(employee, savedEntry),
          disabled: saved,
        },
        Validators.min(0)
      ),
      allowances: this.fb.array(
        allowanceRows.map((row) =>
          this.fb.group({
            name: row.name,
            amount: this.fb.control(
              {
                value: row.amount,
                disabled: saved,
              },
              Validators.min(0)
            ),
          })
        )
      ),
      nonFixedWages: this.fb.control(
        {
          value: savedEntry?.nonFixedWages ?? 0,
          disabled: saved,
        },
        Validators.min(0)
      ),
      adjustmentAmount: this.fb.control({
        value: savedEntry?.adjustmentAmount ?? 0,
        disabled: saved,
      }),
      adjustmentType: this.fb.control({
        value: savedEntry?.adjustmentType ?? null,
        disabled: saved,
      }),
      adjustmentTargetMonth: this.fb.control({
        value: savedEntry?.adjustmentTargetMonth ?? '',
        disabled: saved,
      }),
      baseDays: this.fb.control(
        {
          value: baseDays,
          disabled: saved,
        },
        [Validators.required, Validators.min(0)]
      ),
    });
  }

  private attachRowTotalWatcher(index: number, group: PayrollRowFormGroup): void {
    const recalculate = () => {
      const raw = group.getRawValue();
      const fixedTotal = calculateFixedWagesTotal(raw.baseSalary, raw.allowances);
      const total = calculatePayrollDisplayTotal(
        raw.baseSalary,
        raw.allowances,
        raw.nonFixedWages,
        raw.adjustmentAmount
      );

      this.rowFixedTotals.update((totals) => {
        const next = [...totals];
        next[index] = fixedTotal;
        return next;
      });

      this.rowTotals.update((totals) => {
        const next = [...totals];
        next[index] = total;
        return next;
      });
    };

    const amountChanges = group.controls.allowances.controls.map((allowance) =>
      allowance.controls.amount.valueChanges.pipe(startWith(allowance.controls.amount.value))
    );

    merge(
      group.controls.baseSalary.valueChanges.pipe(startWith(group.controls.baseSalary.value)),
      group.controls.nonFixedWages.valueChanges.pipe(startWith(group.controls.nonFixedWages.value)),
      group.controls.adjustmentAmount.valueChanges.pipe(
        startWith(group.controls.adjustmentAmount.value)
      ),
      ...amountChanges
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => recalculate());

    recalculate();
  }

  onSaveRowPrepare(index: number): void {
    this.syncRowFormValuesFromDom(index);
  }

  private syncRowFormValuesFromDom(index: number): void {
    const group = this.entries.at(index);
    const employeeId = group.controls.employeeId.value?.trim();
    if (!employeeId) {
      return;
    }

    const row = document.querySelector(`[data-payroll-row-id="${employeeId}"]`);
    if (!row) {
      return;
    }

    this.syncNumericFormControlFromDom(
      row,
      'baseDays',
      group.controls.baseDays
    );
    this.syncNumericFormControlFromDom(
      row,
      'nonFixedWages',
      group.controls.nonFixedWages
    );
  }

  private syncNumericFormControlFromDom(
    row: Element,
    field: string,
    control: FormControl<number>
  ): void {
    const input = row.querySelector(
      `[data-payroll-field="${field}"]`
    ) as HTMLInputElement | null;

    if (!input) {
      return;
    }

    const parsed = roundNonNegativePayrollYen(Number(input.value));
    if (Number.isFinite(parsed)) {
      control.setValue(parsed, { emitEvent: false });
    }
  }

  private buildPayrollEntry(group: PayrollRowFormGroup): PayrollEntry {
    return buildPayrollEntryFromFormValues(extractPayrollRowFormValues(group), {
      locked: true,
    });
  }
}
