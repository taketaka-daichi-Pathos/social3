import { Component, inject, input, output, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { EmployeeSession } from '@core/services/employee-session.service';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { EmployeeApplicationDialogShellComponent } from '@features/employee-portal/components/employee-application-dialog-shell/employee-application-dialog-shell.component';
import { ToastService } from '@shared/services/toast.service';

type BasicInfoFormGroup = FormGroup<{
  currentAddress: FormControl<string>;
  bankName: FormControl<string>;
  accountNumber: FormControl<string>;
}>;

@Component({
  selector: 'app-basic-info-application-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, EmployeeApplicationDialogShellComponent],
  templateUrl: './basic-info-application-dialog.component.html',
  styleUrl: './basic-info-application-dialog.component.scss',
})
export class BasicInfoApplicationDialogComponent {
  readonly open = input(false);
  readonly session = input.required<EmployeeSession>();

  readonly closed = output<void>();
  readonly submitted = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly toast = inject(ToastService);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly basicInfoForm: BasicInfoFormGroup = this.fb.group({
    currentAddress: this.fb.control('', Validators.required),
    bankName: this.fb.control('', Validators.required),
    accountNumber: this.fb.control('', Validators.required),
  });

  close(): void {
    this.closed.emit();
  }

  async submit(): Promise<void> {
    if (this.basicInfoForm.invalid) {
      this.basicInfoForm.markAllAsTouched();
      return;
    }

    const raw = this.basicInfoForm.getRawValue();
    const currentSession = this.session();

    this.submitting.set(true);
    this.formError.set(null);

    try {
      await this.requestService.createRequest(currentSession.companyOwnerUid, {
        type: 'basic_info',
        requesterId: currentSession.employee.id,
        targetEmployeeId: currentSession.employee.id,
        status: 'pending',
        payload: {
          currentAddress: raw.currentAddress,
          bankName: raw.bankName,
          accountNumber: raw.accountNumber,
        },
      });

      this.basicInfoForm.reset();
      this.toast.show('申請を送信しました。労務担当者の確認をお待ちください。');
      this.submitted.emit();
      this.closed.emit();
    } catch (error) {
      this.formError.set(toFirestoreErrorMessage(error, '申請の送信に失敗しました'));
    } finally {
      this.submitting.set(false);
    }
  }
}
