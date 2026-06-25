import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
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
import { EmployeeService } from '@core/services/employee.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee } from '@features/employees/models/employee.model';
import { CompensationType } from '@features/payroll/models/compensation.model';
import {
  employeeFullName,
  filterEmployeesForTargetMonth,
  formatTargetMonthLabel,
  getCurrentYearMonthKey,
  getNextYearMonthKey,
  getPreviousYearMonthKey,
  isBeforeHireMonth,
  parseYearMonthKey,
  toYearMonthKeyFromParts,
} from '@features/payroll/utils/compensation.utils';
import {
  loadStoredTargetMonth,
  PAYROLL_STORAGE_KEYS,
  saveStoredTargetMonth,
} from '@features/payroll/utils/payroll-storage.utils';
import { YearSelectComponent } from '@shared/components/year-select/year-select.component';

type EntryFormGroup = FormGroup<{
  employeeId: FormControl<string>;
  employeeNumber: FormControl<string>;
  employeeName: FormControl<string>;
  fixedWages: FormControl<number>;
  nonFixedWages: FormControl<number>;
}>;

@Component({
  selector: 'app-compensation-entry-table',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule, YearSelectComponent],
  templateUrl: './compensation-entry-table.component.html',
  styleUrl: './compensation-entry-table.component.scss',
})
export class CompensationEntryTableComponent implements OnInit {
  readonly compensationType = input.required<CompensationType>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly employeeService = inject(EmployeeService);
  private readonly compensationService = inject(CompensationService);

  readonly targetMonth = signal(getCurrentYearMonthKey());
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly locked = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');

  private readonly employees = signal<Employee[]>([]);
  private readonly employeeById = signal<Record<string, Employee>>({});
  private rebuildVersion = 0;

  readonly monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);

  readonly form = this.fb.group({
    entries: this.fb.array<EntryFormGroup>([]),
  });

  ngOnInit(): void {
    const storedMonth = loadStoredTargetMonth(
      PAYROLL_STORAGE_KEYS.bonus,
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
          this.loading.set(false);
        },
      });
  }

  get entries(): FormArray<EntryFormGroup> {
    return this.form.controls.entries;
  }

  get titleLabel(): string {
    return this.compensationType() === 'payroll' ? '月次給与' : '賞与';
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
    saveStoredTargetMonth(PAYROLL_STORAGE_KEYS.bonus, yearMonth);
    this.saveError.set('');
    void this.rebuildForm();
  }

  rowTotal(index: number): number {
    const row = this.entries.at(index).getRawValue();
    return row.fixedWages + row.nonFixedWages;
  }

  isRowBeforeHire(index: number): boolean {
    const employeeId = this.entries.at(index).controls.employeeId.value;
    const employee = this.employeeById()[employeeId];
    if (!employee) {
      return false;
    }

    return isBeforeHireMonth(employee, this.targetMonth());
  }

  hasEditableRows(): boolean {
    return this.entries.controls.some((_, index) => !this.isRowBeforeHire(index));
  }

  canSave(): boolean {
    return !this.locked() && this.hasEditableRows() && this.form.valid;
  }

  async onSave(): Promise<void> {
    if (!this.canSave() || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.saveError.set('');

    try {
      const entries = this.entries.controls
        .map((group, index) => ({ group, index }))
        .filter(({ index }) => !this.isRowBeforeHire(index))
        .map(({ group }) => group.getRawValue())
        .map((entry) => ({
          employeeId: entry.employeeId,
          employeeNumber: entry.employeeNumber,
          employeeName: entry.employeeName,
          fixedWages: entry.fixedWages,
          nonFixedWages: entry.nonFixedWages,
        }));

      await this.compensationService.saveRecord(this.compensationType(), {
        targetMonth: this.targetMonth(),
        locked: true,
        entries,
      });

      this.locked.set(true);
      this.form.disable();
    } catch (error) {
      this.saveError.set(error instanceof Error ? error.message : '保存に失敗しました');
    } finally {
      this.saving.set(false);
    }
  }

  private async rebuildForm(): Promise<void> {
    if (this.loading()) {
      return;
    }

    const version = ++this.rebuildVersion;
    const eligibleEmployees = filterEmployeesForTargetMonth(
      this.employees(),
      this.targetMonth()
    );

    let savedRecord = null;

    try {
      savedRecord = await this.compensationService.getRecord(
        this.compensationType(),
        this.targetMonth()
      );
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

    this.entries.clear();
    this.locked.set(savedRecord?.locked ?? false);

    for (const employee of eligibleEmployees) {
      const savedEntry = savedRecord?.entries.find((entry) => entry.employeeId === employee.id);
      const group = this.fb.group({
        employeeId: employee.id,
        employeeNumber: this.fb.control({ value: employee.employeeNumber, disabled: true }),
        employeeName: this.fb.control({ value: employeeFullName(employee), disabled: true }),
        fixedWages: this.fb.control(savedEntry?.fixedWages ?? 0, Validators.min(0)),
        nonFixedWages: this.fb.control(savedEntry?.nonFixedWages ?? 0, Validators.min(0)),
      });

      this.entries.push(group);

      if (isBeforeHireMonth(employee, this.targetMonth())) {
        group.disable();
      }
    }

    if (this.locked()) {
      this.form.disable();
      return;
    }

    this.form.enable();
    this.lockDisplayFields();
  }

  private lockDisplayFields(): void {
    for (const group of this.entries.controls) {
      const employeeId = group.controls.employeeId.value;
      const employee = this.employeeById()[employeeId];
      const beforeHire = employee ? isBeforeHireMonth(employee, this.targetMonth()) : false;

      group.controls.employeeNumber.disable({ emitEvent: false });
      group.controls.employeeName.disable({ emitEvent: false });

      if (beforeHire) {
        group.disable({ emitEvent: false });
        continue;
      }

      group.controls.fixedWages.enable({ emitEvent: false });
      group.controls.nonFixedWages.enable({ emitEvent: false });
    }
  }
}
