import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
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
import { LeaveType } from '@features/employees/models/leave-record.model';
import { EmployeeGender } from '@features/onboarding/models/employee-registration.model';
import { LeaveWorkflowRequestKind } from '@features/workflow/models/workflow-request-payload.model';
import { WorkflowRequestType } from '@features/workflow/models/workflow-request.model';
import { leaveWorkflowRequestKindLabel } from '@features/workflow/utils/workflow-payload.utils';
import { WORKFLOW_MATERNITY_GENDER_MISMATCH_ERROR } from '@features/workflow/utils/workflow-request.validation.utils';
import { ToastService } from '@shared/services/toast.service';

type LeaveFormGroup = FormGroup<{
  leaveKind: FormControl<LeaveType>;
  plannedStartDate: FormControl<string>;
  plannedEndDate: FormControl<string>;
}>;

@Component({
  selector: 'app-leave-application-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, EmployeeApplicationDialogShellComponent],
  templateUrl: './leave-application-dialog.component.html',
  styleUrl: './leave-application-dialog.component.scss',
})
export class LeaveApplicationDialogComponent {
  readonly open = input(false);
  readonly session = input.required<EmployeeSession>();

  readonly closed = output<void>();
  readonly submitted = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly toast = inject(ToastService);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly leaveForm: LeaveFormGroup = this.fb.group({
    leaveKind: this.fb.control<LeaveType>('childcare', Validators.required),
    plannedStartDate: this.fb.control('', Validators.required),
    plannedEndDate: this.fb.control('', Validators.required),
  });

  readonly employeeGender = computed<EmployeeGender>(() => this.session().employee.gender);
  readonly isMaleEmployee = computed(() => this.employeeGender() === 'male');
  readonly showLeaveKindSelector = computed(() => !this.isMaleEmployee());
  readonly fixedLeaveKindLabel = computed(() =>
    leaveWorkflowRequestKindLabel(this.resolveDefaultLeaveKind())
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        this.formError.set(null);
      } else {
        this.resetForm();
      }

      this.configureLeaveFormByGender(this.employeeGender());
    });
  }

  close(): void {
    this.closed.emit();
  }

  async submit(): Promise<void> {
    if (this.leaveForm.invalid) {
      this.leaveForm.markAllAsTouched();
      return;
    }

    const raw = this.leaveForm.getRawValue();
    const leaveKind = raw.leaveKind as LeaveWorkflowRequestKind;

    if (this.isMaleEmployee() && leaveKind === 'maternity') {
      this.formError.set(WORKFLOW_MATERNITY_GENDER_MISMATCH_ERROR);
      return;
    }

    const requestType: WorkflowRequestType =
      leaveKind === 'maternity' ? 'maternity_leave' : 'childcare_leave';

    const currentSession = this.session();
    this.submitting.set(true);
    this.formError.set(null);

    try {
      await this.requestService.createRequest(currentSession.companyOwnerUid, {
        type: requestType,
        requesterId: currentSession.employee.id,
        targetEmployeeId: currentSession.employee.id,
        status: 'pending',
        payload: {
          leaveKind,
          plannedStartDate: raw.plannedStartDate,
          plannedEndDate: raw.plannedEndDate,
        },
      });

      this.resetForm();
      this.toast.show('申請を送信しました。労務担当者の確認をお待ちください。');
      this.submitted.emit();
      this.closed.emit();
    } catch (error) {
      this.formError.set(toFirestoreErrorMessage(error, '申請の送信に失敗しました'));
    } finally {
      this.submitting.set(false);
    }
  }

  private configureLeaveFormByGender(gender: EmployeeGender): void {
    const leaveKindControl = this.leaveForm.controls.leaveKind;

    if (gender === 'male') {
      leaveKindControl.setValue('childcare', { emitEvent: false });
      leaveKindControl.disable({ emitEvent: false });
      return;
    }

    leaveKindControl.enable({ emitEvent: false });
    if (leaveKindControl.value !== 'maternity' && leaveKindControl.value !== 'childcare') {
      leaveKindControl.setValue('maternity', { emitEvent: false });
    }
  }

  private resolveDefaultLeaveKind(): LeaveType {
    return this.isMaleEmployee() ? 'childcare' : 'maternity';
  }

  private resetForm(): void {
    this.leaveForm.reset({
      leaveKind: this.resolveDefaultLeaveKind(),
      plannedStartDate: '',
      plannedEndDate: '',
    });
    this.configureLeaveFormByGender(this.employeeGender());
  }
}
