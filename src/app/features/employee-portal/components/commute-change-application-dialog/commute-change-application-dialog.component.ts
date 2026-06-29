import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { EmployeeSession } from '@core/services/employee-session.service';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { EmployeeApplicationDialogShellComponent } from '@features/employee-portal/components/employee-application-dialog-shell/employee-application-dialog-shell.component';
import { ToastService } from '@shared/services/toast.service';

@Component({
  selector: 'app-commute-change-application-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, EmployeeApplicationDialogShellComponent],
  templateUrl: './commute-change-application-dialog.component.html',
  styleUrl: './commute-change-application-dialog.component.scss',
})
export class CommuteChangeApplicationDialogComponent {
  readonly open = input(false);
  readonly session = input.required<EmployeeSession>();

  readonly closed = output<void>();
  readonly submitted = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly toast = inject(ToastService);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly commuteForm = this.fb.group({
    commuteRoute: this.fb.nonNullable.control('', Validators.required),
    commutePassAmount: new FormControl<number | null>(null, Validators.required),
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.formError.set(null);
        this.prefillFromEmployee();
      } else {
        this.commuteForm.reset({ commuteRoute: '', commutePassAmount: null });
      }
    });
  }

  close(): void {
    this.closed.emit();
  }

  async submit(): Promise<void> {
    if (this.commuteForm.invalid) {
      this.commuteForm.markAllAsTouched();
      return;
    }

    const raw = this.commuteForm.getRawValue();
    const currentSession = this.session();
    const employee = currentSession.employee;
    const commuteRoute = raw.commuteRoute.trim();
    const commutePassAmount = raw.commutePassAmount ?? null;

    if (
      commuteRoute === (employee.commuteRoute ?? '').trim() &&
      commutePassAmount === (employee.commutePassAmount ?? null)
    ) {
      this.formError.set('現在の登録情報と同じ内容です。変更後の情報を入力してください。');
      return;
    }

    if (commutePassAmount == null || commutePassAmount < 0 || Number.isNaN(commutePassAmount)) {
      this.formError.set('定期代は0円以上の数値を入力してください。');
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    try {
      await this.requestService.createRequest(currentSession.companyOwnerUid, {
        type: 'commute_change',
        requesterId: currentSession.employee.id,
        targetEmployeeId: currentSession.employee.id,
        status: 'pending',
        payload: { commuteRoute, commutePassAmount },
      });

      this.commuteForm.reset({ commuteRoute: '', commutePassAmount: null });
      this.toast.show('通勤交通費の変更申請を送信しました。労務担当者の確認をお待ちください。');
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
    this.commuteForm.reset({
      commuteRoute: employee.commuteRoute ?? '',
      commutePassAmount: employee.commutePassAmount ?? null,
    });
  }
}
