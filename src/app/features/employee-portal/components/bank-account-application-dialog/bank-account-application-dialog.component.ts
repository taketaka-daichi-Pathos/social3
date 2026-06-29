import { Component, effect, inject, input, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { EmployeeSession } from '@core/services/employee-session.service';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { EmployeeApplicationDialogShellComponent } from '@features/employee-portal/components/employee-application-dialog-shell/employee-application-dialog-shell.component';
import { ToastService } from '@shared/services/toast.service';

type BankAccountType = 'ordinary' | 'checking' | 'savings';

type BankAccountFormGroup = FormGroup<{
  bankName: FormControl<string>;
  bankBranchName: FormControl<string>;
  bankAccountType: FormControl<BankAccountType>;
  bankAccountNumber: FormControl<string>;
}>;

const BANK_ACCOUNT_TYPE_OPTIONS: ReadonlyArray<{ value: BankAccountType; label: string }> = [
  { value: 'ordinary', label: '普通' },
  { value: 'checking', label: '当座' },
  { value: 'savings', label: '貯蓄' },
];

function accountNumberValidator(control: AbstractControl<string>): ValidationErrors | null {
  const digits = control.value.replace(/\D/g, '');
  return digits.length >= 4 && digits.length <= 14 ? null : { accountNumber: true };
}

@Component({
  selector: 'app-bank-account-application-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, EmployeeApplicationDialogShellComponent],
  templateUrl: './bank-account-application-dialog.component.html',
  styleUrl: './bank-account-application-dialog.component.scss',
})
export class BankAccountApplicationDialogComponent {
  readonly open = input(false);
  readonly session = input.required<EmployeeSession>();

  readonly closed = output<void>();
  readonly submitted = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly toast = inject(ToastService);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly accountTypeOptions = BANK_ACCOUNT_TYPE_OPTIONS;

  readonly bankAccountForm: BankAccountFormGroup = this.fb.group({
    bankName: this.fb.control('', Validators.required),
    bankBranchName: this.fb.control('', Validators.required),
    bankAccountType: this.fb.control<BankAccountType>('ordinary', Validators.required),
    bankAccountNumber: this.fb.control('', [Validators.required, accountNumberValidator]),
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.formError.set(null);
        this.prefillFromEmployee();
      } else {
        this.bankAccountForm.reset({
          bankName: '',
          bankBranchName: '',
          bankAccountType: 'ordinary',
          bankAccountNumber: '',
        });
      }
    });
  }

  close(): void {
    this.closed.emit();
  }

  async submit(): Promise<void> {
    if (this.bankAccountForm.invalid) {
      this.bankAccountForm.markAllAsTouched();
      return;
    }

    const raw = this.bankAccountForm.getRawValue();
    const currentSession = this.session();
    const employee = currentSession.employee;
    const bankName = raw.bankName.trim();
    const bankBranchName = raw.bankBranchName.trim();
    const bankAccountType = raw.bankAccountType;
    const bankAccountNumber = raw.bankAccountNumber.replace(/\D/g, '');

    if (
      bankName === (employee.bankName ?? '').trim() &&
      bankBranchName === (employee.bankBranchName ?? '').trim() &&
      bankAccountType === ((employee.bankAccountType as BankAccountType | undefined) ?? '') &&
      bankAccountNumber === (employee.bankAccountNumber ?? '').replace(/\D/g, '')
    ) {
      this.formError.set('現在の登録情報と同じ内容です。変更後の情報を入力してください。');
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    try {
      await this.requestService.createRequest(currentSession.companyOwnerUid, {
        type: 'bank_account',
        requesterId: currentSession.employee.id,
        targetEmployeeId: currentSession.employee.id,
        status: 'pending',
        payload: {
          bankName,
          bankBranchName,
          bankAccountType,
          bankAccountNumber,
        },
      });

      this.bankAccountForm.reset({
        bankName: '',
        bankBranchName: '',
        bankAccountType: 'ordinary',
        bankAccountNumber: '',
      });
      this.toast.show('給与振込口座の申請を送信しました。労務担当者の確認をお待ちください。');
      this.submitted.emit();
      this.closed.emit();
    } catch (error) {
      this.formError.set(toFirestoreErrorMessage(error, '申請の送信に失敗しました'));
    } finally {
      this.submitting.set(false);
    }
  }

  private prefillFromEmployee(): void {
    const employee = this.session().employee;
    const accountType = employee.bankAccountType;
    const normalizedType: BankAccountType =
      accountType === 'checking' || accountType === 'savings' ? accountType : 'ordinary';

    this.bankAccountForm.reset({
      bankName: employee.bankName ?? '',
      bankBranchName: employee.bankBranchName ?? '',
      bankAccountType: employee.bankAccountType ? normalizedType : 'ordinary',
      bankAccountNumber: employee.bankAccountNumber ?? '',
    });
  }
}
