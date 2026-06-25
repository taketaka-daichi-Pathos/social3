import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CompensationService } from '@core/services/compensation.service';
import { CompanyService } from '@core/services/company.service';
import { EmployeeService } from '@core/services/employee.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee } from '@features/employees/models/employee.model';
import {
  PayrollBreakdownModalComponent,
  PayrollBreakdownValue,
} from '@features/payroll/components/payroll-breakdown-modal/payroll-breakdown-modal.component';
import { PayrollEntry, PayrollRecord } from '@features/payroll/models/compensation.model';
import {
  calculateFixedWagesTotal,
  calculatePayrollRowTotal,
  employeeFullName,
  filterEmployeesForTargetMonth,
  formatTargetMonthLabel,
  getCurrentYearMonthKey,
  getNextYearMonthKey,
  getPreviousYearMonthKey,
  isFirstPayrollMonth,
  isBeforeHireMonth,
  parseYearMonthKey,
  resolvePayrollAllowances,
  resolvePayrollBaseDays,
  resolvePayrollBaseSalary,
  toEmployeeAllowances,
  toYearMonthKeyFromParts,
} from '@features/payroll/utils/compensation.utils';
import {
  loadStoredTargetMonth,
  PAYROLL_STORAGE_KEYS,
  saveStoredTargetMonth,
} from '@features/payroll/utils/payroll-storage.utils';
import { CompanyAllowance } from '@features/settings/models/company-settings.model';
import { YearSelectComponent } from '@shared/components/year-select/year-select.component';
import { merge, startWith } from 'rxjs';

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
  baseDays: FormControl<number>;
}>;

@Component({
  selector: 'app-monthly-payroll-table',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule, PayrollBreakdownModalComponent, YearSelectComponent],
  templateUrl: './monthly-payroll-table.component.html',
  styleUrl: './monthly-payroll-table.component.scss',
})
export class MonthlyPayrollTableComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly employeeService = inject(EmployeeService);
  private readonly companyService = inject(CompanyService);
  private readonly compensationService = inject(CompensationService);

  readonly targetMonth = signal(getCurrentYearMonthKey());
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly rowTotals = signal<number[]>([]);
  readonly rowFixedTotals = signal<number[]>([]);
  readonly savingRowIds = signal<Set<string>>(new Set());
  readonly rowErrors = signal<Record<string, string>>({});

  readonly breakdownModalOpen = signal(false);
  readonly breakdownRowIndex = signal<number | null>(null);
  readonly breakdownValue = signal<PayrollBreakdownValue | null>(null);
  readonly breakdownSaving = signal(false);
  readonly breakdownError = signal('');

  readonly monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);

  private readonly employees = signal<Employee[]>([]);
  private readonly companyAllowances = signal<CompanyAllowance[]>([]);
  private readonly allowancesLoaded = signal(false);
  private readonly previousMonthRecord = signal<PayrollRecord | null>(null);
  private readonly employeeById = signal<Record<string, Employee>>({});
  private rebuildVersion = 0;

  readonly form = this.fb.group({
    entries: this.fb.array<PayrollRowFormGroup>([]),
  });

  ngOnInit(): void {
    const storedMonth = loadStoredTargetMonth(
      PAYROLL_STORAGE_KEYS.monthly,
      getCurrentYearMonthKey()
    );
    this.targetMonth.set(storedMonth);

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

  get entries(): FormArray<PayrollRowFormGroup> {
    return this.form.controls.entries;
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
    this.targetMonth.set(yearMonth);
    saveStoredTargetMonth(PAYROLL_STORAGE_KEYS.monthly, yearMonth);
    this.rowErrors.set({});
    void this.rebuildForm();
  }

  isRowLocked(index: number): boolean {
    return this.entries.at(index).controls.locked.value;
  }

  isRowBeforeHire(index: number): boolean {
    const employeeId = this.entries.at(index).controls.employeeId.value;
    const employee = this.employeeById()[employeeId];
    if (!employee) {
      return false;
    }

    return isBeforeHireMonth(employee, this.targetMonth());
  }

  isRowDisabled(index: number): boolean {
    return this.isRowLocked(index) || this.isRowBeforeHire(index);
  }

  rowTotal(index: number): number {
    return this.rowTotals()[index] ?? 0;
  }

  rowFixedTotal(index: number): number {
    return this.rowFixedTotals()[index] ?? 0;
  }

  canSaveRow(index: number): boolean {
    if (this.isRowDisabled(index)) {
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

    const previousEntry = this.previousMonthRecord()?.entries.find(
      (entry) => entry.employeeId === employeeId
    );

    return Boolean(previousEntry?.locked);
  }

  isRowSaving(employeeId: string): boolean {
    return this.savingRowIds().has(employeeId);
  }

  rowError(employeeId: string): string {
    return this.rowErrors()[employeeId] ?? '';
  }

  needsPreviousMonthSave(index: number): boolean {
    return !this.isRowDisabled(index) && !this.canSaveRow(index);
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
    if (index == null || this.breakdownSaving()) {
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

      await this.employeeService.updateEmployeePayrollData(employeeId, {
        baseSalary: value.baseSalary,
        allowances: employeeAllowances,
      });

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
    const employeeId = group.controls.employeeId.value;

    if (group.controls.locked.value || this.isRowSaving(employeeId) || !this.canSaveRow(index)) {
      return;
    }

    if (group.invalid) {
      group.markAllAsTouched();
      return;
    }

    this.savingRowIds.update((ids) => new Set(ids).add(employeeId));
    this.rowErrors.update((errors) => {
      const next = { ...errors };
      delete next[employeeId];
      return next;
    });

    const entry = this.buildPayrollEntry(group);

    try {
      await this.compensationService.upsertPayrollEntry(this.targetMonth(), entry);
      await this.employeeService.updateEmployeePayrollData(employeeId, {
        baseSalary: entry.baseSalary,
        allowances: toEmployeeAllowances(entry.allowances),
      });

      group.controls.locked.setValue(true);
      group.disable();
    } catch (error) {
      this.rowErrors.update((errors) => ({
        ...errors,
        [employeeId]: error instanceof Error ? error.message : '保存に失敗しました',
      }));
    } finally {
      this.savingRowIds.update((ids) => {
        const next = new Set(ids);
        next.delete(employeeId);
        return next;
      });
    }
  }

  private async loadCompanyAllowances(): Promise<void> {
    try {
      const company = await this.companyService.getCompanyForCurrentUser();
      this.companyAllowances.set(company?.allowances ?? []);
    } catch {
      this.companyAllowances.set([]);
    } finally {
      this.allowancesLoaded.set(true);
      if (!this.loading()) {
        void this.rebuildForm();
      }
    }
  }

  private async rebuildForm(): Promise<void> {
    if (this.loading() || !this.allowancesLoaded()) {
      return;
    }

    const version = ++this.rebuildVersion;
    const eligibleEmployees = filterEmployeesForTargetMonth(
      this.employees(),
      this.targetMonth()
    );
    const previousMonth = getPreviousYearMonthKey(this.targetMonth());

    let savedRecord: PayrollRecord | null = null;
    let previousRecord: PayrollRecord | null = null;

    try {
      [savedRecord, previousRecord] = await Promise.all([
        this.compensationService.getPayrollRecord(this.targetMonth()),
        this.compensationService.getPayrollRecord(previousMonth),
      ]);
    } catch (error) {
      if (version !== this.rebuildVersion) {
        return;
      }

      this.loadError.set(
        error instanceof Error ? error.message : '保存データの取得に失敗しました'
      );
    }

    if (version !== this.rebuildVersion) {
      return;
    }

    this.previousMonthRecord.set(previousRecord);
    this.entries.clear();
    this.rowTotals.set([]);
    this.rowFixedTotals.set([]);

    eligibleEmployees.forEach((employee, index) => {
      const savedEntry = savedRecord?.entries.find((entry) => entry.employeeId === employee.id);
      const beforeHire = isBeforeHireMonth(employee, this.targetMonth());
      const group = this.createRowGroup(employee, savedEntry ?? null, beforeHire);
      this.entries.push(group);
      this.attachRowTotalWatcher(index, group);

      if (savedEntry?.locked || beforeHire) {
        group.disable({ emitEvent: false });
      }
    });
  }

  private createRowGroup(
    employee: Employee,
    savedEntry: PayrollEntry | null,
    beforeHire = false
  ): PayrollRowFormGroup {
    const allowanceRows = resolvePayrollAllowances(
      employee,
      this.companyAllowances(),
      savedEntry
    );
    const baseDays = resolvePayrollBaseDays(savedEntry);

    return this.fb.group({
      employeeId: employee.id,
      employeeNumber: this.fb.control({ value: employee.employeeNumber, disabled: true }),
      employeeName: this.fb.control({ value: employeeFullName(employee), disabled: true }),
      locked: this.fb.control(Boolean(savedEntry?.locked)),
      baseSalary: this.fb.control(resolvePayrollBaseSalary(employee, savedEntry), Validators.min(0)),
      allowances: this.fb.array(
        allowanceRows.map((row) =>
          this.fb.group({
            name: row.name,
            amount: this.fb.control(row.amount, Validators.min(0)),
          })
        )
      ),
      nonFixedWages: this.fb.control(savedEntry?.nonFixedWages ?? 0, Validators.min(0)),
      baseDays: beforeHire
        ? this.fb.control(
            { value: baseDays, disabled: true },
            [Validators.required, Validators.min(0)]
          )
        : this.fb.control(baseDays, [Validators.required, Validators.min(0)]),
    });
  }

  private attachRowTotalWatcher(index: number, group: PayrollRowFormGroup): void {
    const recalculate = () => {
      const raw = group.getRawValue();
      const fixedTotal = calculateFixedWagesTotal(raw.baseSalary, raw.allowances);
      const total = calculatePayrollRowTotal(
        raw.baseSalary,
        raw.allowances,
        raw.nonFixedWages
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
      ...amountChanges
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => recalculate());

    recalculate();
  }

  private buildPayrollEntry(group: PayrollRowFormGroup): PayrollEntry {
    const raw = group.getRawValue();
    const allowances = raw.allowances.map((row) => ({
      name: row.name,
      amount: row.amount,
    }));
    const totalPayment = calculatePayrollRowTotal(raw.baseSalary, allowances, raw.nonFixedWages);

    return {
      employeeId: raw.employeeId,
      employeeNumber: raw.employeeNumber,
      employeeName: raw.employeeName,
      baseSalary: raw.baseSalary,
      allowances,
      nonFixedWages: raw.nonFixedWages,
      baseDays: raw.baseDays,
      totalPayment,
      locked: true,
    };
  }
}
