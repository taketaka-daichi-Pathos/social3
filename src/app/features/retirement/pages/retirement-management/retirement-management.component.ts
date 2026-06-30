import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { EmployeeService } from '@core/services/employee.service';
import { EmployeeTaskService } from '@core/services/employee-task.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee } from '@features/employees/models/employee.model';
import {
  isLastDayOfMonth,
  retirementReasonLabel,
} from '@features/employees/utils/retirement.utils';
import { createLockedMonthAsyncValidator } from '@features/payroll/validators/monthly-lock.validators';
import {
  LOCKED_MONTH_ERROR,
  RETIREMENT_DATE_LOCKED_MONTH_MESSAGE,
} from '@features/payroll/utils/monthly-lock.utils';
import {
  RETIREMENT_BEFORE_HIRE_DATE_ERROR,
  RETIREMENT_BEFORE_HIRE_DATE_MESSAGE,
  retirementDateNotBeforeHireValidator,
} from '@features/retirement/validators/retirement-management.validators';

@Component({
  selector: 'app-retirement-management',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './retirement-management.component.html',
  styleUrl: './retirement-management.component.scss',
})
export class RetirementManagementComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly employeeService = inject(EmployeeService);
  private readonly employeeTaskService = inject(EmployeeTaskService);
  private readonly monthlyLockService = inject(MonthlyLockService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly saveSuccess = signal<string | null>(null);
  readonly saving = signal(false);
  readonly cardSavingId = signal<string | null>(null);
  readonly employees = signal<Employee[]>([]);
  submitted = false;

  readonly form = this.fb.group({
    employeeId: this.fb.control('', Validators.required),
    retirementDate: this.fb.control('', [
      Validators.required,
      Validators.pattern(/^\d{4}-\d{2}-\d{2}$/),
    ]),
    retirementReason: this.fb.control('', Validators.required),
  });

  readonly activeEmployees = computed(() =>
    this.employees()
      .filter((employee) => employee.status === 'active')
      .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber))
  );

  readonly retiredEmployees = computed(() =>
    this.employees()
      .filter((employee) => employee.status === 'retired')
      .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber))
  );

  ngOnInit(): void {
    const getHireDate = () => this.selectedEmployeeHireDate();

    this.form.controls.retirementDate.addValidators(retirementDateNotBeforeHireValidator(getHireDate));
    this.form.controls.retirementDate.addAsyncValidators(
      createLockedMonthAsyncValidator(this.monthlyLockService)
    );

    this.form.controls.employeeId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.form.controls.retirementDate.updateValueAndValidity({ emitEvent: false });
      });

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => {
          this.employees.set(employees);
          this.loadError.set(null);
          this.loading.set(false);
        },
        error: (error) => {
          this.loadError.set(toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました'));
          this.loading.set(false);
        },
      });
  }

  employeeLabel(employee: Employee): string {
    return `${employee.employeeNumber} ${employee.lastName}${employee.firstName}`;
  }

  selectedEmployee(): Employee | undefined {
    const employeeId = this.form.controls.employeeId.value;
    return this.employees().find((employee) => employee.id === employeeId);
  }

  selectedEmployeeHireDate(): string {
    return this.selectedEmployee()?.hireDate?.trim() ?? '';
  }

  retirementDateMin(): string {
    return this.selectedEmployeeHireDate();
  }

  monthEndRuleHint(date: string): string {
    if (!date) {
      return '';
    }

    return isLastDayOfMonth(date)
      ? '月末退職：退職月の社会保険料（健保・介護・厚年）を徴収します'
      : '月中退職：退職月の社会保険料（健保・介護・厚年）は免除（0円）となります';
  }

  reasonLabel(reason: string | null | undefined): string {
    return retirementReasonLabel(reason);
  }

  showError(controlName: 'employeeId' | 'retirementDate' | 'retirementReason'): boolean {
    const control = this.form.controls[controlName];

    if (controlName === 'retirementDate' && control.errors?.[LOCKED_MONTH_ERROR]) {
      return true;
    }

    if (controlName === 'retirementDate' && control.errors?.[RETIREMENT_BEFORE_HIRE_DATE_ERROR]) {
      return true;
    }

    return (control.touched || this.submitted) && control.invalid;
  }

  errorMessage(controlName: 'employeeId' | 'retirementDate' | 'retirementReason'): string {
    const control = this.form.controls[controlName];
    if (control.hasError('required')) {
      if (controlName === 'employeeId') {
        return '従業員を選択してください';
      }
      if (controlName === 'retirementDate') {
        return '退職日を入力してください';
      }
      return '退職理由を入力してください';
    }

    if (controlName === 'retirementDate' && control.hasError(LOCKED_MONTH_ERROR)) {
      return RETIREMENT_DATE_LOCKED_MONTH_MESSAGE;
    }

    if (controlName === 'retirementDate' && control.hasError(RETIREMENT_BEFORE_HIRE_DATE_ERROR)) {
      return RETIREMENT_BEFORE_HIRE_DATE_MESSAGE;
    }

    if (controlName === 'retirementDate' && control.hasError('pattern')) {
      return '退職日の形式が正しくありません';
    }

    return '';
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.saveError.set(null);
    this.saveSuccess.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const companyOwnerUid = this.auth.currentUser?.uid;
    if (!companyOwnerUid) {
      this.saveError.set('ログイン情報を取得できませんでした');
      return;
    }

    const { employeeId, retirementDate, retirementReason } = this.form.getRawValue();
    this.saving.set(true);

    try {
      await this.employeeService.processRetirement(companyOwnerUid, employeeId, {
        retirementDate,
        retirementReason,
      });

      try {
        await this.employeeTaskService.createRetirementProcedureRequest(
          companyOwnerUid,
          employeeId
        );
      } catch (taskError) {
        console.warn('[RetirementManagement] 退職タスクの自動発行に失敗しました', taskError);
      }

      this.form.reset({ employeeId: '', retirementDate: '', retirementReason: '' });
      this.submitted = false;
      this.saveSuccess.set('退職手続きを保存しました。従業員へ手続き依頼タスクを送信しました。');
    } catch (error) {
      this.saveError.set(
        error instanceof Error ? error.message : '退職手続きの保存に失敗しました'
      );
    } finally {
      this.saving.set(false);
    }
  }

  async onInsuranceCardReturnedToggle(employee: Employee): Promise<void> {
    const nextValue = employee.insuranceCardReturned !== true;
    await this.onInsuranceCardReturnedChange(employee, nextValue);
  }

  async onInsuranceCardReturnedChange(employee: Employee, checked: boolean): Promise<void> {
    const companyOwnerUid = this.auth.currentUser?.uid;
    if (!companyOwnerUid) {
      this.saveError.set('ログイン情報を取得できませんでした');
      return;
    }

    this.cardSavingId.set(employee.id);
    this.saveError.set(null);

    try {
      await this.employeeService.updateInsuranceCardReturned(
        companyOwnerUid,
        employee.id,
        checked
      );
      this.saveSuccess.set(
        `${employee.lastName}${employee.firstName} さんの保険証回収状態を更新しました`
      );
    } catch (error) {
      this.saveError.set(
        error instanceof Error ? error.message : '保険証回収状態の保存に失敗しました'
      );
    } finally {
      this.cardSavingId.set(null);
    }
  }
}
