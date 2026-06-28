import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { EmployeeSession } from '@core/services/employee-session.service';
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

type DependentFormGroup = FormGroup<{
  familyMemberName: FormControl<string>;
  birthDate: FormControl<string>;
  relationship: FormControl<string>;
  reason: FormControl<string>;
}>;

type BasicInfoFormGroup = FormGroup<{
  currentAddress: FormControl<string>;
  bankName: FormControl<string>;
  accountNumber: FormControl<string>;
}>;

@Component({
  selector: 'app-employee-workflow-request-forms',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './employee-workflow-request-forms.component.html',
  styleUrl: './employee-workflow-request-forms.component.scss',
})
export class EmployeeWorkflowRequestFormsComponent {
  readonly session = input.required<EmployeeSession>();

  readonly submitted = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly toast = inject(ToastService);

  readonly leaveOpen = signal(false);
  readonly dependentOpen = signal(false);
  readonly basicInfoOpen = signal(false);
  readonly submittingType = signal<'leave' | 'dependent' | 'basic_info' | null>(null);
  readonly formError = signal<string | null>(null);

  readonly employeeGender = computed<EmployeeGender>(() => this.session().employee.gender);
  readonly isMaleEmployee = computed(() => this.employeeGender() === 'male');
  readonly showLeaveKindSelector = computed(() => !this.isMaleEmployee());
  readonly fixedLeaveKindLabel = computed(() =>
    leaveWorkflowRequestKindLabel(this.resolveDefaultLeaveKind())
  );

  readonly leaveForm: LeaveFormGroup = this.fb.group({
    leaveKind: this.fb.control<LeaveType>('childcare', Validators.required),
    plannedStartDate: this.fb.control('', Validators.required),
    plannedEndDate: this.fb.control('', Validators.required),
  });

  readonly dependentForm: DependentFormGroup = this.fb.group({
    familyMemberName: this.fb.control('', Validators.required),
    birthDate: this.fb.control('', Validators.required),
    relationship: this.fb.control('', Validators.required),
    reason: this.fb.control('', Validators.required),
  });

  readonly basicInfoForm: BasicInfoFormGroup = this.fb.group({
    currentAddress: this.fb.control('', Validators.required),
    bankName: this.fb.control('', Validators.required),
    accountNumber: this.fb.control('', Validators.required),
  });

  constructor() {
    effect(() => {
      this.configureLeaveFormByGender(this.employeeGender());
    });
  }

  toggleLeave(): void {
    this.leaveOpen.update((open) => !open);
  }

  toggleDependent(): void {
    this.dependentOpen.update((open) => !open);
  }

  toggleBasicInfo(): void {
    this.basicInfoOpen.update((open) => !open);
  }

  async submitLeave(): Promise<void> {
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

    await this.submitRequest(
      requestType,
      {
        leaveKind,
        plannedStartDate: raw.plannedStartDate,
        plannedEndDate: raw.plannedEndDate,
      },
      'leave'
    );
  }

  async submitDependent(): Promise<void> {
    if (this.dependentForm.invalid) {
      this.dependentForm.markAllAsTouched();
      return;
    }

    const raw = this.dependentForm.getRawValue();
    await this.submitRequest(
      'add_dependent',
      {
        familyMemberName: raw.familyMemberName,
        birthDate: raw.birthDate,
        relationship: raw.relationship,
        reason: raw.reason,
      },
      'dependent'
    );
  }

  async submitBasicInfo(): Promise<void> {
    if (this.basicInfoForm.invalid) {
      this.basicInfoForm.markAllAsTouched();
      return;
    }

    const raw = this.basicInfoForm.getRawValue();
    await this.submitRequest(
      'basic_info',
      {
        currentAddress: raw.currentAddress,
        bankName: raw.bankName,
        accountNumber: raw.accountNumber,
      },
      'basic_info'
    );
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

  private resetLeaveForm(): void {
    this.leaveForm.reset({
      leaveKind: this.resolveDefaultLeaveKind(),
      plannedStartDate: '',
      plannedEndDate: '',
    });
    this.configureLeaveFormByGender(this.employeeGender());
  }

  private async submitRequest(
    type: WorkflowRequestType,
    payload: Record<string, unknown>,
    formKey: 'leave' | 'dependent' | 'basic_info'
  ): Promise<void> {
    const currentSession = this.session();
    this.submittingType.set(formKey);
    this.formError.set(null);

    try {
      await this.requestService.createRequest(currentSession.companyOwnerUid, {
        type,
        requesterId: currentSession.employee.id,
        targetEmployeeId: currentSession.employee.id,
        status: 'pending',
        payload,
      });

      if (formKey === 'leave') {
        this.resetLeaveForm();
        this.leaveOpen.set(false);
      } else if (formKey === 'dependent') {
        this.dependentForm.reset();
        this.dependentOpen.set(false);
      } else {
        this.basicInfoForm.reset();
        this.basicInfoOpen.set(false);
      }

      this.toast.show('申請を送信しました。労務担当者の確認をお待ちください。');
      this.submitted.emit();
    } catch (error) {
      this.formError.set(toFirestoreErrorMessage(error, '申請の送信に失敗しました'));
    } finally {
      this.submittingType.set(null);
    }
  }
}
