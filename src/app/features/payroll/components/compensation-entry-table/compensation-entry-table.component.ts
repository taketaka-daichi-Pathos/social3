import { DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, computed, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { CompensationService } from '@core/services/compensation.service';
import { EmployeeService } from '@core/services/employee.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee } from '@features/employees/models/employee.model';
import { isRetiredEmployee, isAfterRetirementDate } from '@features/employees/utils/retirement.utils';
import { BonusHistoryDisplayRow } from '@features/payroll/models/bonus-history.model';
import { CompensationEntry, CompensationRecord, CompensationType } from '@features/payroll/models/compensation.model';
import {
  calculateStandardBonusAmount,
  resolvePensionCapDisplay,
  summarizeFiscalYearCumulativeBonus,
} from '@features/payroll/utils/bonus-insurance.utils';
import {
  createBonusHistoryEntry,
  findBonusHistoryForPaymentDate,
  formatPaymentDateLabel,
  groupBonusHistoryByPaymentDate,
  hasBonusHistoryForPaymentDate,
  normalizeBonusPaymentDate,
  resolveFiscalYearFromPaymentDate,
  resolveFiscalYearFromYearMonth,
  resolveTargetMonthFromPaymentDate,
} from '@features/payroll/utils/bonus-history.utils';
import {
  calculatePayrollEntryFixedWages,
  employeeFullName,
  filterEmployeesForTargetMonth,
  getCurrentYearMonthKey,
  resolvePayrollAllowances,
  resolvePayrollBaseSalary,
} from '@features/payroll/utils/compensation.utils';
import {
  loadStoredBonusPaymentDate,
  saveStoredBonusPaymentDate,
} from '@features/payroll/utils/payroll-storage.utils';
import { RetiredEmployeeBadgeComponent } from '@shared/components/retired-employee-badge/retired-employee-badge.component';
import { SocialInsuranceTypeBadgeComponent } from '@shared/components/social-insurance-type-badge/social-insurance-type-badge.component';
import {
  matchesSocialInsuranceCategoryFilter,
  SOCIAL_INSURANCE_CATEGORY_FILTER_OPTIONS,
  SocialInsuranceCategoryFilter,
} from '@features/employees/utils/social-insurance-type-filter.utils';

type EntryFormGroup = FormGroup<{
  employeeId: FormControl<string>;
  employeeNumber: FormControl<string>;
  employeeName: FormControl<string>;
  locked: FormControl<boolean>;
  blockedByRetirement: FormControl<boolean>;
  fixedWages: FormControl<number>;
  nonFixedWages: FormControl<number>;
}>;

@Component({
  selector: 'app-compensation-entry-table',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule, RetiredEmployeeBadgeComponent, SocialInsuranceTypeBadgeComponent],
  templateUrl: './compensation-entry-table.component.html',
  styleUrl: './compensation-entry-table.component.scss',
})
export class CompensationEntryTableComponent implements OnInit {
  readonly compensationType = input.required<CompensationType>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly employeeService = inject(EmployeeService);
  private readonly compensationService = inject(CompensationService);
  private readonly monthlyLockService = inject(MonthlyLockService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly paymentDateError = signal('');
  readonly isBonusMonthLocked = signal(false);
  readonly saveSuccess = signal('');
  readonly saveError = signal('');
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly savingRowIds = signal<Set<string>>(new Set());
  readonly rowErrors = signal<Record<string, string>>({});
  readonly historyExpanded = signal(true);
  readonly expandedPaymentDates = signal<Set<string>>(new Set());
  readonly socialInsuranceFilter = signal<SocialInsuranceCategoryFilter>('all');
  readonly socialInsuranceFilterOptions = SOCIAL_INSURANCE_CATEGORY_FILTER_OPTIONS;

  private readonly employees = signal<Employee[]>([]);
  private readonly employeeById = signal<Record<string, Employee>>({});
  private readonly optimisticSavedKeys = signal<Set<string>>(new Set());
  private skipEmployeeFormSyncOnce = false;
  private rebuildVersion = 0;
  private lastAppliedPaymentDate = '';

  readonly formatPaymentDateLabel = formatPaymentDateLabel;

  readonly form = this.fb.group({
    paymentDate: this.fb.control('', {
      validators: [CompensationEntryTableComponent.paymentDateValidator],
    }),
    entries: this.fb.array<EntryFormGroup>([]),
  });

  readonly allBonusHistoryRows = computed(() => {
    const rows: BonusHistoryDisplayRow[] = [];

    for (const employee of this.employees()) {
      for (const entry of employee.bonusHistory ?? []) {
        rows.push({
          ...entry,
          standardBonusAmount: calculateStandardBonusAmount(entry.bonusAmount),
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          employeeName: employeeFullName(employee),
        });
      }
    }

    return rows;
  });

  private readonly savedBonusRecord = signal<CompensationRecord | null>(null);

  readonly bonusHistoryPaymentDateGroups = computed(() =>
    groupBonusHistoryByPaymentDate(this.allBonusHistoryRows())
  );

  ngOnInit(): void {
    const stored = loadStoredBonusPaymentDate('');
    this.form.controls.paymentDate.setValue(stored);
    this.lastAppliedPaymentDate = normalizeBonusPaymentDate(stored);

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => {
          const wasLoading = this.loading();
          this.employees.set(employees);
          this.employeeById.set(Object.fromEntries(employees.map((employee) => [employee.id, employee])));
          this.loadError.set('');
          this.loading.set(false);
          this.reconcileOptimisticSavedKeys();

          if (this.skipEmployeeFormSyncOnce) {
            this.skipEmployeeFormSyncOnce = false;
            this.cdr.markForCheck();
            return;
          }

          if (wasLoading || this.shouldRebuildForm(employees)) {
            void this.rebuildForm();
            return;
          }

          void this.syncAfterEmployeeDataChange();
        },
        error: (error) => {
          this.loadError.set(
            error instanceof Error && error.message === 'ログインしていません'
              ? 'ログインしていません。再度ログインしてください。'
              : toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました')
          );
          this.employees.set([]);
          this.loading.set(false);
        },
      });
  }

  get entries(): FormArray<EntryFormGroup> {
    return this.form.controls.entries;
  }

  private static paymentDateValidator(control: AbstractControl): ValidationErrors | null {
    return normalizeBonusPaymentDate(control.value).length > 0 ? null : { paymentDate: true };
  }

  normalizedPaymentDate(): string {
    return normalizeBonusPaymentDate(this.form.controls.paymentDate.value);
  }

  isPaymentDateInvalid(): boolean {
    const control = this.form.controls.paymentDate;
    return control.invalid && (control.touched || control.dirty || Boolean(this.paymentDateError()));
  }

  isRowBonusAmountInvalid(index: number): boolean {
    const control = this.entries.at(index).controls.fixedWages;
    return control.invalid && control.touched;
  }

  get titleLabel(): string {
    return this.compensationType() === 'payroll' ? '月次給与' : '賞与';
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

  isRowBlockedByRetirement(index: number): boolean {
    return this.entries.at(index)?.controls.blockedByRetirement.value === true;
  }

  /** 賞与額入力・保存が不可な行か（確定済み月・保存済み・退職後支払日） */
  isRowInputDisabled(index: number): boolean {
    if (this.isBonusMonthLocked()) {
      return true;
    }

    if (this.isRowLocked(index)) {
      return true;
    }

    return this.isRowBlockedByRetirement(index);
  }

  isRowInputEnabled(index: number): boolean {
    return !this.isRowInputDisabled(index);
  }

  private isPaymentAfterEmployeeRetirement(employee: Employee | undefined, paymentDate: string): boolean {
    if (!employee || !paymentDate) {
      return false;
    }

    return isAfterRetirementDate(employee, paymentDate);
  }

  onPaymentDateChange(): void {
    this.syncPaymentDateControlFromDom();

    const nextPaymentDate = this.normalizedPaymentDate();
    const previousPaymentDate = this.lastAppliedPaymentDate;
    const previousTargetMonth = resolveTargetMonthFromPaymentDate(previousPaymentDate) ??
      getCurrentYearMonthKey();

    if (nextPaymentDate === previousPaymentDate) {
      return;
    }

    const preserveUnlockedInput = !previousPaymentDate && Boolean(nextPaymentDate);

    this.lastAppliedPaymentDate = nextPaymentDate;
    this.paymentDateError.set('');
    this.rowErrors.set({});
    saveStoredBonusPaymentDate(nextPaymentDate);
    this.form.controls.paymentDate.updateValueAndValidity({ emitEvent: false });

    const nextTargetMonth =
      resolveTargetMonthFromPaymentDate(nextPaymentDate) ?? getCurrentYearMonthKey();
    if (previousTargetMonth !== nextTargetMonth || this.shouldRebuildForm(this.employees())) {
      void this.rebuildForm({ preserveUnlockedInput });
      return;
    }

    void this.applyPaymentDateContext(preserveUnlockedInput);
  }

  onPaymentDateInput(): void {
    this.syncPaymentDateControlFromDom();
    this.form.controls.paymentDate.updateValueAndValidity({ emitEvent: false });
  }

  onBonusAmountInput(index: number, event: Event): void {
    if (this.isRowInputDisabled(index)) {
      return;
    }

    const amount = this.normalizeBonusAmount((event.target as HTMLInputElement).value);
    this.entries.at(index).controls.fixedWages.setValue(amount, { emitEvent: false });
  }

  toggleHistoryPanel(): void {
    this.historyExpanded.update((value) => !value);
  }

  isPaymentDateExpanded(paymentDate: string): boolean {
    return this.expandedPaymentDates().has(paymentDate);
  }

  togglePaymentDatePanel(paymentDate: string): void {
    this.expandedPaymentDates.update((dates) => {
      const next = new Set(dates);
      if (next.has(paymentDate)) {
        next.delete(paymentDate);
      } else {
        next.add(paymentDate);
      }
      return next;
    });
  }

  private derivedTargetMonth(): string {
    return resolveTargetMonthFromPaymentDate(this.normalizedPaymentDate()) ?? getCurrentYearMonthKey();
  }

  private savedKey(employeeId: string, paymentDate: string): string {
    return `${employeeId}:${normalizeBonusPaymentDate(paymentDate)}`;
  }

  private shouldRebuildForm(employees: Employee[]): boolean {
    if (this.entries.length === 0) {
      return true;
    }

    const currentIds = this.entries.controls
      .map((group) => group.controls.employeeId.value)
      .sort()
      .join(',');
    const nextIds = filterEmployeesForTargetMonth(employees, this.derivedTargetMonth())
      .map((employee) => employee.id)
      .sort()
      .join(',');

    return currentIds !== nextIds;
  }

  private markEmployeeSaved(employeeId: string, paymentDate: string): void {
    this.optimisticSavedKeys.update((keys) => {
      const next = new Set(keys);
      next.add(this.savedKey(employeeId, paymentDate));
      return next;
    });
  }

  private clearRowSaving(employeeId: string): void {
    this.savingRowIds.update((ids) => {
      const next = new Set(ids);
      next.delete(employeeId);
      return next;
    });
  }

  private reconcileOptimisticSavedKeys(): void {
    this.optimisticSavedKeys.update((keys) => {
      if (keys.size === 0) {
        return keys;
      }

      const next = new Set(keys);
      for (const employee of this.employees()) {
        for (const entry of employee.bonusHistory ?? []) {
          next.delete(this.savedKey(employee.id, entry.paymentDate));
        }
      }
      return next;
    });
  }

  private isEmployeeSavedForPaymentDate(employeeId: string, paymentDate: string): boolean {
    const normalizedPaymentDate = normalizeBonusPaymentDate(paymentDate);
    if (!normalizedPaymentDate) {
      return false;
    }

    if (this.optimisticSavedKeys().has(this.savedKey(employeeId, normalizedPaymentDate))) {
      return true;
    }

    const employee = this.employeeById()[employeeId];
    return hasBonusHistoryForPaymentDate(employee?.bonusHistory, normalizedPaymentDate);
  }

  private resolveSavedBonusAmount(employeeId: string, paymentDate: string): number {
    const normalizedPaymentDate = normalizeBonusPaymentDate(paymentDate);
    const historyEntry = findBonusHistoryForPaymentDate(
      this.employeeById()[employeeId]?.bonusHistory,
      normalizedPaymentDate
    );

    return historyEntry?.bonusAmount ?? 0;
  }

  private syncAllRowLockStates(preserveUnlockedInput = false): void {
    const paymentDate = this.normalizedPaymentDate();

    for (const group of this.entries.controls) {
      this.applyRowStateForPaymentDate(group, paymentDate, preserveUnlockedInput);
    }
  }

  private applyRowStateForPaymentDate(
    group: EntryFormGroup,
    paymentDate: string,
    preserveUnlockedInput = false
  ): void {
    const employeeId = group.controls.employeeId.value;
    const employee = this.employeeById()[employeeId];
    const blockedByRetirement = this.isPaymentAfterEmployeeRetirement(employee, paymentDate);

    group.controls.blockedByRetirement.setValue(blockedByRetirement, { emitEvent: false });

    if (blockedByRetirement) {
      group.controls.fixedWages.setValue(0, { emitEvent: false });
      group.controls.nonFixedWages.setValue(0, { emitEvent: false });
      group.controls.locked.setValue(false, { emitEvent: false });
      this.syncRowControlState(group, true);
      return;
    }

    const locked = this.isEmployeeSavedForPaymentDate(employeeId, paymentDate);

    if (locked) {
      const savedBonusAmount = this.resolveSavedBonusAmount(employeeId, paymentDate);
      group.controls.fixedWages.setValue(savedBonusAmount, { emitEvent: false });
      group.controls.nonFixedWages.setValue(0, { emitEvent: false });
    } else if (!preserveUnlockedInput) {
      group.controls.fixedWages.setValue(0, { emitEvent: false });
      group.controls.nonFixedWages.setValue(0, { emitEvent: false });
    }

    group.controls.locked.setValue(locked, { emitEvent: false });
    this.syncRowControlState(group, locked || this.isBonusMonthLocked());
  }

  private lockSavedRow(group: EntryFormGroup, bonusAmount: number): void {
    group.controls.fixedWages.setValue(bonusAmount, { emitEvent: false });
    group.controls.nonFixedWages.setValue(0, { emitEvent: false });
    group.controls.locked.setValue(true, { emitEvent: false });
    this.syncRowControlState(group, true);
  }

  private async applyPaymentDateContext(preserveUnlockedInput = false): Promise<void> {
    const paymentDate = this.normalizedPaymentDate();
    await this.refreshSavedBonusRecord(paymentDate);
    this.syncAllRowLockStates(preserveUnlockedInput);
    this.cdr.detectChanges();
  }

  private async syncAfterEmployeeDataChange(): Promise<void> {
    const paymentDate = this.normalizedPaymentDate();
    await this.refreshSavedBonusRecord(paymentDate);
    this.syncAllRowLockStates(true);
    this.cdr.markForCheck();
  }

  private async refreshSavedBonusRecord(paymentDate: string): Promise<void> {
    if (!paymentDate) {
      this.savedBonusRecord.set(null);
      return;
    }

    try {
      const savedRecord = await this.compensationService.getRecord(
        this.compensationType(),
        this.derivedTargetMonth()
      );
      this.savedBonusRecord.set(savedRecord);
    } catch {
      // 保存済みデータの再取得に失敗しても、履歴ベースのロックは維持する
    }
  }

  private ensureLatestPaymentDateExpanded(): void {
    const latestGroup = this.bonusHistoryPaymentDateGroups()[0];
    if (!latestGroup) {
      return;
    }

    this.expandedPaymentDates.update((dates) => new Set(dates).add(latestGroup.paymentDate));
  }

  private ensurePaymentDateExpanded(paymentDate: string): void {
    if (!paymentDate) {
      return;
    }

    this.expandedPaymentDates.update((dates) => new Set(dates).add(paymentDate));
  }

  rowBonusAmount(index: number): number {
    return this.normalizeBonusAmount(this.entries.at(index).getRawValue().fixedWages);
  }

  rowTotal(index: number): number {
    return this.rowBonusAmount(index);
  }

  rowStandardBonusAmount(index: number): number {
    return calculateStandardBonusAmount(this.rowBonusAmount(index));
  }

  cumulativeBonusSummary(index: number) {
    const employeeId = this.entries.at(index).controls.employeeId.value;
    const employee = this.employeeById()[employeeId];
    const paymentDate = this.normalizedPaymentDate();
    const fiscalYear =
      resolveFiscalYearFromPaymentDate(paymentDate) ??
      resolveFiscalYearFromYearMonth(getCurrentYearMonthKey());
    const excludePaymentDate =
      paymentDate && !this.isEmployeeSavedForPaymentDate(employeeId, paymentDate)
        ? paymentDate
        : undefined;

    return summarizeFiscalYearCumulativeBonus(
      employee?.bonusHistory,
      fiscalYear,
      excludePaymentDate
    );
  }

  pensionCapSummary(index: number) {
    return resolvePensionCapDisplay(this.rowStandardBonusAmount(index));
  }

  isRowLocked(index: number): boolean {
    const employeeId = this.entries.at(index).controls.employeeId.value;
    return this.isEmployeeSavedForPaymentDate(employeeId, this.normalizedPaymentDate());
  }

  hasPaymentDate(): boolean {
    return this.normalizedPaymentDate().length > 0;
  }

  isRowSaving(employeeId: string): boolean {
    return this.savingRowIds().has(employeeId);
  }

  rowError(employeeId: string): string {
    return this.rowErrors()[employeeId] ?? '';
  }

  hasBonusAmount(index: number): boolean {
    return this.rowTotal(index) > 0;
  }

  canSaveRow(index: number): boolean {
    return (
      this.isRowInputEnabled(index) &&
      this.hasPaymentDate() &&
      !this.isRowLocked(index) &&
      this.hasBonusAmount(index)
    );
  }

  saveRowHint(index: number): string {
    if (this.isRowInputDisabled(index)) {
      return '';
    }

    if (this.isRowLocked(index)) {
      return '';
    }

    if (!this.hasPaymentDate()) {
      return '支払い日を入力してください';
    }

    if (!this.hasBonusAmount(index)) {
      return '賞与額を入力してください';
    }

    return '';
  }

  async onSaveRow(index: number): Promise<void> {
    this.saveSuccess.set('');
    this.saveError.set('');

    try {
      this.syncPaymentDateControlFromDom();
      this.syncRowBonusAmountFromDom(index);
      this.form.controls.paymentDate.updateValueAndValidity();
      this.entries.at(index).controls.fixedWages.updateValueAndValidity();
      this.form.markAllAsTouched();
      this.entries.at(index).markAllAsTouched();

      if (!this.validateSaveForm(index)) {
        return;
      }

      if (this.isRowLocked(index)) {
        return;
      }

      if (this.isRowBlockedByRetirement(index)) {
        return;
      }

      const paymentDate = this.normalizedPaymentDate();
      const group = this.entries.at(index);
      const employeeId = group.controls.employeeId.value;
      const employee = this.employeeById()[employeeId];

      if (!employee) {
        const message = '従業員情報が見つかりません';
        this.saveError.set(message);
        return;
      }

      if (this.isEmployeeSavedForPaymentDate(employeeId, paymentDate)) {
        this.lockSavedRow(group, this.rowBonusAmount(index));
        return;
      }

      const bonusAmount = this.rowBonusAmount(index);
      const targetMonth = resolveTargetMonthFromPaymentDate(paymentDate);
      if (!targetMonth) {
        const message = '支払い日の形式が正しくありません';
        this.paymentDateError.set(message);
        this.saveError.set(message);
        return;
      }

      this.paymentDateError.set('');
      this.savingRowIds.update((ids) => new Set(ids).add(employeeId));
      this.rowErrors.update((errors) => {
        const next = { ...errors };
        delete next[employeeId];
        return next;
      });

      const raw = group.getRawValue();
      const standardBonusAmount = calculateStandardBonusAmount(bonusAmount);
      const fixedWagesAtPayment = await this.resolveFixedWagesAtPayment(employee, targetMonth);
      const savedAt = new Date().toISOString();
      const entry: CompensationEntry = {
        employeeId,
        employeeNumber: raw.employeeNumber,
        employeeName: raw.employeeName,
        fixedWages: bonusAmount,
        nonFixedWages: 0,
        locked: true,
        bonusAmount,
        standardBonusAmount,
        fixedWagesAtPayment,
        paymentDate,
        savedAt,
      };

      await this.compensationService.upsertBonusEntry(targetMonth, entry, paymentDate);
      this.skipEmployeeFormSyncOnce = true;
      await this.employeeService.appendBonusHistory(
        employeeId,
        createBonusHistoryEntry({
          paymentMonth: targetMonth,
          paymentDate,
          fixedWagesAtPayment,
          bonusAmount,
          standardBonusAmount,
        })
      );

      this.updateSavedBonusRecord(entry, paymentDate, targetMonth);
      this.markEmployeeSaved(employeeId, paymentDate);
      this.ensurePaymentDateExpanded(paymentDate);
      this.lockSavedRow(group, bonusAmount);
      this.saveSuccess.set('保存しました');
      this.scheduleSaveSuccessClear();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('[CompensationEntryTable] 賞与の保存に失敗しました', error);
      const message = toFirestoreErrorMessage(error, '保存に失敗しました');
      const employeeId = this.entries.at(index)?.controls.employeeId.value;
      this.saveError.set(message);
      if (employeeId) {
        this.rowErrors.update((errors) => ({
          ...errors,
          [employeeId]: message,
        }));
      }
    } finally {
      const employeeId = this.entries.at(index)?.controls.employeeId.value;
      if (employeeId) {
        this.clearRowSaving(employeeId);
      }
      this.cdr.markForCheck();
    }
  }

  private scheduleSaveSuccessClear(): void {
    window.setTimeout(() => {
      if (this.saveSuccess() === '保存しました') {
        this.saveSuccess.set('');
        this.cdr.markForCheck();
      }
    }, 3000);
  }

  private normalizeBonusAmount(value: unknown): number {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return 0;
    }

    return Math.floor(amount);
  }

  private validateSaveForm(index: number): boolean {
    const invalidControls = this.collectInvalidControlPaths(this.form);
    if (invalidControls.length > 0) {
      console.error('[CompensationEntryTable] 保存不可: invalid な FormControl', invalidControls);
      const message = '入力内容にエラーがあります（支払い日などを確認してください）';
      this.saveError.set(message);
      if (this.form.controls.paymentDate.invalid) {
        this.paymentDateError.set('支払い日を正しく入力してください');
      }
      return false;
    }

    if (!this.hasPaymentDate()) {
      const message = '支払い日を入力してください';
      this.paymentDateError.set(message);
      this.saveError.set(message);
      return false;
    }

    if (this.isRowInputDisabled(index)) {
      return false;
    }

    if (!this.hasBonusAmount(index)) {
      const message = '賞与額を入力してください';
      this.saveError.set(message);
      return false;
    }

    return true;
  }

  private collectInvalidControlPaths(
    control: AbstractControl,
    path = ''
  ): Array<{ path: string; errors: ValidationErrors | null }> {
    if (control instanceof FormGroup) {
      return Object.entries(control.controls).flatMap(([key, child]) =>
        this.collectInvalidControlPaths(child, path ? `${path}.${key}` : key)
      );
    }

    if (control instanceof FormArray) {
      return control.controls.flatMap((child, childIndex) =>
        this.collectInvalidControlPaths(child, `${path}[${childIndex}]`)
      );
    }

    return control.invalid ? [{ path, errors: control.errors }] : [];
  }

  private syncPaymentDateControlFromDom(): void {
    const input = document.getElementById('bonusPaymentDate') as HTMLInputElement | null;
    if (!input) {
      return;
    }

    const normalized = normalizeBonusPaymentDate(input.value);
    const control = this.form.controls.paymentDate;
    if (control.value !== normalized) {
      control.setValue(normalized, { emitEvent: false });
    }
  }

  onSaveRowPrepare(index: number): void {
    this.syncPaymentDateControlFromDom();
    this.syncRowBonusAmountFromDom(index);
  }

  private syncRowBonusAmountFromDom(index: number): void {
    const group = this.entries.at(index);
    const employeeId = group.controls.employeeId.value;
    const input = document.querySelector(
      `[data-bonus-employee-id="${employeeId}"] input[type="number"]`
    ) as HTMLInputElement | null;

    if (input) {
      group.controls.fixedWages.setValue(this.normalizeBonusAmount(input.value), {
        emitEvent: false,
      });
      return;
    }

    group.controls.fixedWages.setValue(this.normalizeBonusAmount(group.controls.fixedWages.value), {
      emitEvent: false,
    });
  }

  private updateSavedBonusRecord(
    entry: CompensationEntry,
    paymentDate: string,
    targetMonth: string
  ): void {
    this.savedBonusRecord.update((record) => {
      const entries = [...(record?.entries ?? [])];
      const index = entries.findIndex(
        (row) =>
          row.employeeId === entry.employeeId &&
          normalizeBonusPaymentDate(row.paymentDate) === normalizeBonusPaymentDate(paymentDate)
      );

      if (index >= 0) {
        entries[index] = entry;
      } else {
        entries.push(entry);
      }

      return {
        targetMonth,
        paymentDate,
        entries,
      };
    });
  }

  private async resolveFixedWagesAtPayment(
    employee: Employee,
    targetMonth: string
  ): Promise<number> {
    const payrollRecord = await this.compensationService.getPayrollRecord(targetMonth);
    const payrollEntry = payrollRecord?.entries.find((entry) => entry.employeeId === employee.id);

    if (payrollEntry) {
      return calculatePayrollEntryFixedWages(payrollEntry.baseSalary, payrollEntry.allowances);
    }

    const baseSalary = resolvePayrollBaseSalary(employee);
    const allowances = resolvePayrollAllowances(employee, [], null);
    return calculatePayrollEntryFixedWages(baseSalary, allowances);
  }

  private captureUnlockedRowInputs(): Map<string, number> {
    const inputs = new Map<string, number>();

    for (const group of this.entries.controls) {
      if (group.controls.locked.value || group.controls.blockedByRetirement.value) {
        continue;
      }

      const amount = this.normalizeBonusAmount(group.controls.fixedWages.value);
      if (amount > 0) {
        inputs.set(group.controls.employeeId.value, amount);
      }
    }

    return inputs;
  }

  private async rebuildForm(options: { preserveUnlockedInput?: boolean } = {}): Promise<void> {
    if (this.loading()) {
      return;
    }

    const version = ++this.rebuildVersion;
    const paymentDate = this.normalizedPaymentDate();
    const preserveUnlockedInput = options.preserveUnlockedInput ?? false;
    const preservedInputs = preserveUnlockedInput ? this.captureUnlockedRowInputs() : new Map();
    const targetMonth = this.derivedTargetMonth();
    const eligibleEmployees = filterEmployeesForTargetMonth(this.employees(), targetMonth);

    if (paymentDate) {
      try {
        const savedRecord = await this.compensationService.getRecord(
          this.compensationType(),
          targetMonth
        );

        if (version !== this.rebuildVersion) {
          return;
        }

        this.savedBonusRecord.set(savedRecord);
      } catch (error) {
        if (version !== this.rebuildVersion) {
          return;
        }

        this.loadError.set(
          error instanceof Error ? error.message : '保存データの取得に失敗しました'
        );
      }
    } else {
      this.savedBonusRecord.set(null);
    }

    if (version !== this.rebuildVersion) {
      return;
    }

    this.loadError.set('');
    this.entries.clear();

    for (const employee of eligibleEmployees) {
      const blockedByRetirement = this.isPaymentAfterEmployeeRetirement(employee, paymentDate);
      const isLocked =
        !blockedByRetirement && paymentDate
          ? this.isEmployeeSavedForPaymentDate(employee.id, paymentDate)
          : false;
      const savedBonusAmount =
        paymentDate && isLocked
          ? this.resolveSavedBonusAmount(employee.id, paymentDate)
          : blockedByRetirement
            ? 0
            : preservedInputs.get(employee.id) ?? 0;
      const group = this.fb.group({
        employeeId: employee.id,
        employeeNumber: this.fb.control({ value: employee.employeeNumber, disabled: true }),
        employeeName: this.fb.control({ value: employeeFullName(employee), disabled: true }),
        locked: this.fb.control(isLocked),
        blockedByRetirement: this.fb.control(blockedByRetirement),
        fixedWages: this.fb.control(savedBonusAmount, Validators.min(0)),
        nonFixedWages: this.fb.control(0, Validators.min(0)),
      });

      this.entries.push(group);
      this.applyRowStateForPaymentDate(group, paymentDate);
    }

    this.ensureLatestPaymentDateExpanded();
    this.lastAppliedPaymentDate = paymentDate;
    await this.refreshBonusMonthLock();
    this.entries.controls.forEach((group) => {
      const locked = group.controls.locked.value;
      const blockedByRetirement = group.controls.blockedByRetirement.value;
      this.syncRowControlState(
        group,
        locked || blockedByRetirement || this.isBonusMonthLocked()
      );
    });
    this.cdr.detectChanges();
  }

  private async refreshBonusMonthLock(): Promise<void> {
    const targetMonth = this.derivedTargetMonth();
    try {
      this.isBonusMonthLocked.set(await this.monthlyLockService.isMonthLocked(targetMonth));
    } catch {
      this.isBonusMonthLocked.set(false);
    }
  }

  private syncRowControlState(group: EntryFormGroup, inputDisabled: boolean): void {
    group.controls.employeeNumber.disable({ emitEvent: false });
    group.controls.employeeName.disable({ emitEvent: false });
    group.controls.nonFixedWages.disable({ emitEvent: false });

    if (inputDisabled) {
      group.controls.fixedWages.disable({ emitEvent: false });
      return;
    }

    group.controls.fixedWages.enable({ emitEvent: false });
  }
}
