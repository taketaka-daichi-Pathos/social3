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

type AddressChangeFormGroup = FormGroup<{
  postalCode: FormControl<string>;
  address: FormControl<string>;
}>;

function postalCodeValidator(control: AbstractControl<string>): ValidationErrors | null {
  const digits = control.value.replace(/\D/g, '');
  return digits.length === 7 ? null : { postalCode: true };
}

@Component({
  selector: 'app-address-change-application-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, EmployeeApplicationDialogShellComponent],
  templateUrl: './address-change-application-dialog.component.html',
  styleUrl: './address-change-application-dialog.component.scss',
})
export class AddressChangeApplicationDialogComponent {
  readonly open = input(false);
  readonly session = input.required<EmployeeSession>();

  readonly closed = output<void>();
  readonly submitted = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly toast = inject(ToastService);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly addressForm: AddressChangeFormGroup = this.fb.group({
    postalCode: this.fb.control('', [Validators.required, postalCodeValidator]),
    address: this.fb.control('', Validators.required),
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.formError.set(null);
        this.prefillFromEmployee();
      } else {
        this.addressForm.reset({ postalCode: '', address: '' });
      }
    });
  }

  close(): void {
    this.closed.emit();
  }

  async submit(): Promise<void> {
    if (this.addressForm.invalid) {
      this.addressForm.markAllAsTouched();
      return;
    }

    const raw = this.addressForm.getRawValue();
    const currentSession = this.session();
    const employee = currentSession.employee;
    const postalCode = raw.postalCode.replace(/\D/g, '').slice(0, 7);
    const address = raw.address.trim();

    if (
      postalCode === (employee.postalCode ?? '').replace(/\D/g, '') &&
      address === (employee.address ?? '').trim()
    ) {
      this.formError.set('現在の登録情報と同じ内容です。変更後の情報を入力してください。');
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    try {
      await this.requestService.createRequest(currentSession.companyOwnerUid, {
        type: 'address_change',
        requesterId: currentSession.employee.id,
        targetEmployeeId: currentSession.employee.id,
        status: 'pending',
        payload: { postalCode, address },
      });

      this.addressForm.reset({ postalCode: '', address: '' });
      this.toast.show('住所変更申請を送信しました。労務担当者の確認をお待ちください。');
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
    this.addressForm.reset({
      postalCode: employee.postalCode ?? '',
      address: employee.address ?? '',
    });
  }
}
