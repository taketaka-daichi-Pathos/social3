import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Auth, authState } from '@angular/fire/auth';
import { EmployeeService } from '@core/services/employee.service';
import { LeaveWorkflowInboxService } from '@core/services/leave-workflow-inbox.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee } from '@features/employees/models/employee.model';
import { LeaveRecord, LeaveType, LeaveTableRow } from '@features/employees/models/leave-record.model';
import {
  getActiveLeaveTypesAtDate,
  leaveStatusLabel,
  leaveTypeLabel,
  listActiveOrScheduledLeaveRows,
} from '@features/employees/utils/leave-record.utils';
import { LeaveWorkflowRequestDetailModalComponent } from '@features/leave/components/leave-workflow-request-detail-modal/leave-workflow-request-detail-modal.component';
import {
  CHILDCARE_BIRTH_AFTER_START_ERROR,
  EXCEEDS_PATERNITY_LEAVE_LIMIT_ERROR,
  LEAVE_BEFORE_HIRE_DATE_ERROR,
  LEAVE_END_BEFORE_START_ERROR,
  LEAVE_GENDER_MISMATCH_ERROR,
  childcareChildBirthDateValidator,
  leaveDateNotBeforeHireValidator,
  leaveEndDateValidator,
  maternityGenderValidator,
  paternityLeaveDurationValidator,
} from '@features/leave/validators/leave-management.validators';
import { createLeavePeriodLockAsyncValidator } from '@features/payroll/validators/monthly-lock.validators';
import {
  LEAVE_PERIOD_HAS_LOCKED_MONTH_ERROR,
  LEAVE_PERIOD_LOCKED_MONTH_MESSAGE,
} from '@features/payroll/utils/monthly-lock.utils';
import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';
import { parseLeaveWorkflowPayload } from '@features/workflow/utils/workflow-payload.utils';
import {
  isLeaveWorkflowRequestType,
  workflowRequestTypeLabel,
} from '@features/workflow/utils/workflow-navigation.utils';
import { debounceTime, filter, map, merge, switchMap } from 'rxjs';

@Component({
  selector: 'app-leave-management',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, LeaveWorkflowRequestDetailModalComponent],
  templateUrl: './leave-management.component.html',
  styleUrl: './leave-management.component.scss',
})
export class LeaveManagementComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly employeeService = inject(EmployeeService);
  private readonly monthlyLockService = inject(MonthlyLockService);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly leaveInbox = inject(LeaveWorkflowInboxService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly saveSuccess = signal<string | null>(null);
  readonly saving = signal(false);
  readonly employees = signal<Employee[]>([]);
  readonly immutableLeaveRowKeys = signal(new Set<string>());
  readonly pendingLeaveRequests = signal<WorkflowRequest[]>([]);
  readonly requestsLoading = signal(true);
  readonly requestsError = signal<string | null>(null);
  submitted = false;

  readonly form = this.fb.group({
    employeeId: this.fb.control('', Validators.required),
    type: this.fb.control<LeaveType | ''>('', Validators.required),
    startDate: this.fb.control('', [
      Validators.required,
      Validators.pattern(/^\d{4}-\d{2}-\d{2}$/),
    ]),
    endDate: this.fb.control('', [
      Validators.required,
      Validators.pattern(/^\d{4}-\d{2}-\d{2}$/),
    ]),
    expectedDeliveryDate: this.fb.control(''),
    actualDeliveryDate: this.fb.control(''),
    deliveryType: this.fb.control<'1' | '2' | ''>(''),
    child1NameKana: this.fb.control(''),
    child1NameKanji: this.fb.control(''),
    child1BirthDate: this.fb.control(''),
    child2NameKana: this.fb.control(''),
    child2NameKanji: this.fb.control(''),
    child2BirthDate: this.fb.control(''),
    childcareApplicationType: this.fb.control<'new' | 'extension' | 'termination'>('new'),
    actualEndDate: this.fb.control(''),
  });

  readonly activeEmployees = computed(() =>
    this.employees()
      .filter((employee) => employee.status === 'active')
      .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber))
  );

  readonly leaveRows = computed(() => listActiveOrScheduledLeaveRows(this.employees()));

  readonly leaveTrayItems = computed(() => {
    const employees = this.employees();

    return this.pendingLeaveRequests().map((request) => {
      const employee = employees.find((row) => row.id === request.targetEmployeeId);
      const parsed = parseLeaveWorkflowPayload(request.payload);

      return {
        request,
        employeeNumber: employee?.employeeNumber ?? '—',
        employeeName: employee ? `${employee.lastName} ${employee.firstName}` : '—',
        requestTypeLabel: workflowRequestTypeLabel(request.type),
        plannedStartDate: parsed.plannedStartDate || '—',
        plannedEndDate: parsed.plannedEndDate || '—',
      };
    });
  });

  readonly leavePeriodLockedMonthMessage = LEAVE_PERIOD_LOCKED_MONTH_MESSAGE;

  ngOnInit(): void {
    this.form.addAsyncValidators(createLeavePeriodLockAsyncValidator(this.monthlyLockService));

    const getHireDate = () => this.selectedEmployeeHireDate();

    this.form.controls.type.addValidators(maternityGenderValidator(() => this.selectedEmployee()));
    this.form.controls.startDate.addValidators(leaveDateNotBeforeHireValidator(getHireDate));
    this.form.controls.endDate.addValidators(leaveDateNotBeforeHireValidator(getHireDate));
    this.form.controls.endDate.addValidators(
      leaveEndDateValidator(() => this.form.controls.startDate.value)
    );
    this.form.controls.endDate.addValidators(
      paternityLeaveDurationValidator(
        () => this.form.controls.type.value,
        () => this.selectedEmployee(),
        () => this.form.controls.startDate.value
      )
    );

    const getLeaveType = () => this.form.controls.type.value;
    const getStartDate = () => this.form.controls.startDate.value;
    this.form.controls.child1BirthDate.addValidators(
      childcareChildBirthDateValidator(getLeaveType, getStartDate)
    );
    this.form.controls.child2BirthDate.addValidators(
      childcareChildBirthDateValidator(getLeaveType, getStartDate)
    );

    this.syncLeaveTypeFieldValidators();

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => {
          this.employees.set(employees);
          this.loadError.set(null);
          this.loading.set(false);
          void this.refreshImmutableLeaveRows(employees);
        },
        error: (error) => {
          this.loadError.set(toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました'));
          this.employees.set([]);
          this.loading.set(false);
        },
      });

    merge(
      this.form.controls.employeeId.valueChanges,
      this.form.controls.type.valueChanges,
      this.form.controls.startDate.valueChanges,
      this.form.controls.childcareApplicationType.valueChanges
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncLeaveTypeFieldValidators();
        this.form.controls.type.updateValueAndValidity({ emitEvent: false });
        this.form.controls.startDate.updateValueAndValidity({ emitEvent: false });
        this.form.controls.endDate.updateValueAndValidity({ emitEvent: false });
        this.form.controls.expectedDeliveryDate.updateValueAndValidity({ emitEvent: false });
        this.form.controls.deliveryType.updateValueAndValidity({ emitEvent: false });
        this.form.controls.child1NameKana.updateValueAndValidity({ emitEvent: false });
        this.form.controls.child1NameKanji.updateValueAndValidity({ emitEvent: false });
        this.form.controls.child1BirthDate.updateValueAndValidity({ emitEvent: false });
        this.form.controls.child2BirthDate.updateValueAndValidity({ emitEvent: false });
        this.form.controls.actualEndDate.updateValueAndValidity({ emitEvent: false });
      });

    merge(this.form.controls.startDate.valueChanges, this.form.controls.endDate.valueChanges)
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.form.updateValueAndValidity({ emitEvent: false });
      });

    authState(this.auth)
      .pipe(
        filter((user) => user != null),
        switchMap((user) => this.requestService.watchPendingRequestsForAdmin(user!.uid)),
        map((requests) => requests.filter((request) => isLeaveWorkflowRequestType(request.type))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (requests) => {
          this.pendingLeaveRequests.set(requests);
          this.requestsError.set(null);
          this.requestsLoading.set(false);
        },
        error: (error) => {
          this.requestsError.set(toFirestoreErrorMessage(error, '申請トレイの取得に失敗しました'));
          this.pendingLeaveRequests.set([]);
          this.requestsLoading.set(false);
        },
      });
  }

  openLeaveRequest(request: WorkflowRequest): void {
    this.leaveInbox.open(request);
  }

  leaveRowKey(row: LeaveTableRow): string {
    return `${row.employeeId}:${row.record.startDate}:${row.record.type}`;
  }

  isLeaveRecordImmutable(row: LeaveTableRow): boolean {
    return this.immutableLeaveRowKeys().has(this.leaveRowKey(row));
  }

  showLeavePeriodLockError(): boolean {
    if (this.form.pending) {
      return false;
    }

    if (!this.form.errors?.[LEAVE_PERIOD_HAS_LOCKED_MONTH_ERROR]) {
      return false;
    }

    const startDate = this.form.controls.startDate.value.trim();
    const endDate = this.form.controls.endDate.value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);
  }

  isSaveButtonDisabled(): boolean {
    return (
      this.saving() ||
      this.form.pending ||
      this.form.invalid ||
      this.showLeavePeriodLockError()
    );
  }

  private async refreshImmutableLeaveRows(employees: Employee[]): Promise<void> {
    const rows = listActiveOrScheduledLeaveRows(employees);
    const immutableKeys = new Set<string>();

    await Promise.all(
      rows.map(async (row) => {
        const locked = await this.monthlyLockService.hasLockedMonthInDateRange(
          row.record.startDate,
          row.record.endDate
        );

        if (locked) {
          immutableKeys.add(this.leaveRowKey(row));
        }
      })
    );

    this.immutableLeaveRowKeys.set(immutableKeys);
  }

  isChildcareTerminationApplication(): boolean {
    return (
      this.isChildcareLeaveType() &&
      this.form.controls.childcareApplicationType.value === 'termination'
    );
  }

  isMaternityLeaveType(): boolean {
    return this.form.controls.type.value === 'maternity';
  }

  isChildcareLeaveType(): boolean {
    return this.form.controls.type.value === 'childcare';
  }

  isLeaveTypeSelected(): boolean {
    return this.isMaternityLeaveType() || this.isChildcareLeaveType();
  }

  private isMaternitySpecificField(
    controlName:
      | 'expectedDeliveryDate'
      | 'actualDeliveryDate'
      | 'deliveryType'
      | 'employeeId'
      | 'type'
      | 'startDate'
      | 'endDate'
      | 'child1NameKana'
      | 'child1NameKanji'
      | 'child1BirthDate'
      | 'child2NameKana'
      | 'child2NameKanji'
      | 'child2BirthDate'
      | 'actualEndDate'
  ): boolean {
    return (
      controlName === 'expectedDeliveryDate' ||
      controlName === 'actualDeliveryDate' ||
      controlName === 'deliveryType'
    );
  }

  private isChildcareSpecificField(
    controlName:
      | 'expectedDeliveryDate'
      | 'actualDeliveryDate'
      | 'deliveryType'
      | 'employeeId'
      | 'type'
      | 'startDate'
      | 'endDate'
      | 'child1NameKana'
      | 'child1NameKanji'
      | 'child1BirthDate'
      | 'child2NameKana'
      | 'child2NameKanji'
      | 'child2BirthDate'
      | 'actualEndDate'
  ): boolean {
    return (
      controlName === 'child1NameKana' ||
      controlName === 'child1NameKanji' ||
      controlName === 'child1BirthDate' ||
      controlName === 'child2BirthDate' ||
      controlName === 'actualEndDate'
    );
  }

  private syncLeaveTypeFieldValidators(): void {
    const isMaternity = this.isMaternityLeaveType();
    const isChildcare = this.isChildcareLeaveType();
    const expectedDeliveryDate = this.form.controls.expectedDeliveryDate;
    const deliveryType = this.form.controls.deliveryType;
    const child1NameKana = this.form.controls.child1NameKana;
    const child1NameKanji = this.form.controls.child1NameKanji;
    const child1BirthDate = this.form.controls.child1BirthDate;
    const actualEndDate = this.form.controls.actualEndDate;

    if (isMaternity) {
      expectedDeliveryDate.setValidators([
        Validators.required,
        Validators.pattern(/^\d{4}-\d{2}-\d{2}$/),
      ]);
      deliveryType.setValidators([Validators.required]);
      child1NameKana.clearValidators();
      child1NameKanji.clearValidators();
      child1BirthDate.clearValidators();
      actualEndDate.clearValidators();
      child1NameKana.setValue('', { emitEvent: false });
      child1NameKanji.setValue('', { emitEvent: false });
      child1BirthDate.setValue('', { emitEvent: false });
      this.form.controls.child2NameKana.setValue('', { emitEvent: false });
      this.form.controls.child2NameKanji.setValue('', { emitEvent: false });
      this.form.controls.child2BirthDate.setValue('', { emitEvent: false });
      this.form.controls.childcareApplicationType.setValue('new', { emitEvent: false });
      actualEndDate.setValue('', { emitEvent: false });
      return;
    }

    expectedDeliveryDate.clearValidators();
    deliveryType.clearValidators();
    expectedDeliveryDate.setValue('', { emitEvent: false });
    deliveryType.setValue('', { emitEvent: false });
    this.form.controls.actualDeliveryDate.setValue('', { emitEvent: false });

    if (isChildcare) {
      child1NameKana.setValidators([Validators.required]);
      child1NameKanji.setValidators([Validators.required]);
      child1BirthDate.setValidators([
        Validators.required,
        Validators.pattern(/^\d{4}-\d{2}-\d{2}$/),
      ]);

      if (this.form.controls.childcareApplicationType.value === 'termination') {
        actualEndDate.setValidators([
          Validators.required,
          Validators.pattern(/^\d{4}-\d{2}-\d{2}$/),
        ]);
      } else {
        actualEndDate.clearValidators();
        actualEndDate.setValue('', { emitEvent: false });
      }

      return;
    }

    child1NameKana.clearValidators();
    child1NameKanji.clearValidators();
    child1BirthDate.clearValidators();
    actualEndDate.clearValidators();
    child1NameKana.setValue('', { emitEvent: false });
    child1NameKanji.setValue('', { emitEvent: false });
    child1BirthDate.setValue('', { emitEvent: false });
    this.form.controls.child2NameKana.setValue('', { emitEvent: false });
    this.form.controls.child2NameKanji.setValue('', { emitEvent: false });
    this.form.controls.child2BirthDate.setValue('', { emitEvent: false });
    this.form.controls.childcareApplicationType.setValue('new', { emitEvent: false });
    actualEndDate.setValue('', { emitEvent: false });
  }

  selectedEmployee(): Employee | undefined {
    const employeeId = this.form.controls.employeeId.value;
    return this.employees().find((row) => row.id === employeeId);
  }

  selectedEmployeeHireDate(): string {
    return this.selectedEmployee()?.hireDate?.trim() ?? '';
  }

  leaveStartDateMin(): string {
    return this.selectedEmployeeHireDate();
  }

  leaveEndDateMin(): string {
    const hireDate = this.selectedEmployeeHireDate();
    const startDate = this.form.controls.startDate.value.trim();

    if (hireDate && startDate) {
      return hireDate > startDate ? hireDate : startDate;
    }

    return startDate || hireDate;
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const employeeId = this.form.controls.employeeId.value;
    const employee = this.employees().find((row) => row.id === employeeId);
    if (!employee) {
      this.saveError.set('従業員が見つかりません');
      return;
    }

    const newRecord: LeaveRecord = {
      type: this.form.controls.type.value as LeaveType,
      startDate: this.form.controls.startDate.value,
      endDate: this.form.controls.endDate.value,
      ...(this.isMaternityLeaveType()
        ? {
            expectedDeliveryDate: this.form.controls.expectedDeliveryDate.value,
            deliveryType: this.form.controls.deliveryType.value as '1' | '2',
            ...(this.form.controls.actualDeliveryDate.value.trim()
              ? { actualDeliveryDate: this.form.controls.actualDeliveryDate.value }
              : {}),
          }
        : {}),
      ...(this.isChildcareLeaveType()
        ? {
            children: this.buildChildcareChildrenFromForm(),
            ...this.buildChildcareApplicationFlagsFromForm(),
          }
        : {}),
    };

    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);

    try {
      const leaveRecords = [...(employee.leaveRecords ?? []), newRecord];
      await this.employeeService.updateEmployeeLeaveRecords(employeeId, leaveRecords);

      this.employees.update((list) =>
        list.map((row) => (row.id === employeeId ? { ...row, leaveRecords } : row))
      );

      void this.refreshImmutableLeaveRows(this.employees());

      this.saveSuccess.set(`${employee.lastName} ${employee.firstName} の休業履歴を登録しました`);
      this.submitted = false;
      this.form.patchValue({
        type: '',
        startDate: '',
        endDate: '',
        expectedDeliveryDate: '',
        actualDeliveryDate: '',
        deliveryType: '',
        child1NameKana: '',
        child1NameKanji: '',
        child1BirthDate: '',
        child2NameKana: '',
        child2NameKanji: '',
        child2BirthDate: '',
        childcareApplicationType: 'new',
        actualEndDate: '',
      });
      this.syncLeaveTypeFieldValidators();
    } catch (error) {
      this.saveError.set(toFirestoreErrorMessage(error, '休業履歴の保存に失敗しました'));
    } finally {
      this.saving.set(false);
    }
  }

  employeeLabel(employee: Employee): string {
    return `${employee.employeeNumber} ${employee.lastName} ${employee.firstName}`;
  }

  typeLabel(type: LeaveType): string {
    return leaveTypeLabel(type);
  }

  statusLabel(status: ReturnType<typeof listActiveOrScheduledLeaveRows>[number]['status']): string {
    return leaveStatusLabel(status);
  }

  activeLeaveTypes(employee: Employee) {
    return getActiveLeaveTypesAtDate(employee);
  }

  deliveryTypeLabel(type: LeaveRecord['deliveryType']): string {
    if (type === '2') {
      return '多胎';
    }

    if (type === '1') {
      return '単胎';
    }

    return '—';
  }

  childcareChildrenLabel(record: LeaveRecord): string {
    const children = record.children ?? [];
    if (children.length === 0) {
      return '—';
    }

    return children
      .map((child) => child.nameKanji?.trim() || child.nameKana?.trim() || '—')
      .join('、');
  }

  childcareApplicationLabel(record: LeaveRecord): string {
    if (record.type !== 'childcare') {
      return '—';
    }

    if (record.isTermination) {
      return '終了届';
    }

    if (record.isExtension) {
      return '延長';
    }

    return '新規';
  }

  private buildChildcareApplicationFlagsFromForm(): Pick<
    LeaveRecord,
    'isExtension' | 'isTermination' | 'actualEndDate'
  > {
    const applicationType = this.form.controls.childcareApplicationType.value;

    if (applicationType === 'extension') {
      return { isExtension: true };
    }

    if (applicationType === 'termination') {
      return {
        isTermination: true,
        actualEndDate: this.form.controls.actualEndDate.value.trim(),
      };
    }

    return {};
  }

  private buildChildcareChildrenFromForm(): LeaveRecord['children'] {
    const children: NonNullable<LeaveRecord['children']> = [
      {
        nameKana: this.form.controls.child1NameKana.value.trim(),
        nameKanji: this.form.controls.child1NameKanji.value.trim(),
        birthDate: this.form.controls.child1BirthDate.value.trim(),
      },
    ];

    const child2NameKana = this.form.controls.child2NameKana.value.trim();
    const child2NameKanji = this.form.controls.child2NameKanji.value.trim();
    const child2BirthDate = this.form.controls.child2BirthDate.value.trim();

    if (child2NameKana || child2NameKanji || child2BirthDate) {
      children.push({
        nameKana: child2NameKana,
        nameKanji: child2NameKanji,
        birthDate: child2BirthDate,
      });
    }

    return children.slice(0, 2);
  }

  showError(
    controlName:
      | 'employeeId'
      | 'type'
      | 'startDate'
      | 'endDate'
      | 'expectedDeliveryDate'
      | 'actualDeliveryDate'
      | 'deliveryType'
      | 'child1NameKana'
      | 'child1NameKanji'
      | 'child1BirthDate'
      | 'child2NameKana'
      | 'child2NameKanji'
      | 'child2BirthDate'
      | 'actualEndDate'
  ): boolean {
    if (
      controlName === 'endDate' &&
      this.showLeavePeriodLockError()
    ) {
      return true;
    }

    if (this.isMaternitySpecificField(controlName) && !this.isMaternityLeaveType()) {
      return false;
    }

    if (this.isChildcareSpecificField(controlName) && !this.isChildcareLeaveType()) {
      return false;
    }

    const control = this.form.get(controlName);
    return Boolean(control && control.invalid && (control.touched || this.submitted));
  }

  errorMessage(
    controlName:
      | 'employeeId'
      | 'type'
      | 'startDate'
      | 'endDate'
      | 'expectedDeliveryDate'
      | 'actualDeliveryDate'
      | 'deliveryType'
      | 'child1NameKana'
      | 'child1NameKanji'
      | 'child1BirthDate'
      | 'child2NameKana'
      | 'child2NameKanji'
      | 'child2BirthDate'
      | 'actualEndDate'
  ): string {
    const control = this.form.get(controlName);
    if (!control) {
      return '入力内容を確認してください';
    }

    if (control.errors?.['required']) {
      switch (controlName) {
        case 'employeeId':
          return '従業員を選択してください';
        case 'type':
          return '休業の種類を選択してください';
        case 'startDate':
          return '開始日を YYYY-MM-DD 形式で入力してください';
        case 'endDate':
          return '終了予定日を YYYY-MM-DD 形式で入力してください';
        case 'expectedDeliveryDate':
          return '出産予定日を入力してください';
        case 'deliveryType':
          return '出産種別を選択してください';
        case 'child1NameKana':
          return '養育する子（1人目）の氏名カナを入力してください';
        case 'child1NameKanji':
          return '養育する子（1人目）の氏名漢字を入力してください';
        case 'child1BirthDate':
          return '養育する子（1人目）の生年月日を入力してください';
        case 'child2BirthDate':
          return '養育する子（2人目）の生年月日を入力してください';
        case 'actualEndDate':
          return '休業終了年月日を入力してください';
        default:
          return '必須項目です';
      }
    }

    if (control.errors?.['pattern']) {
      if (controlName === 'startDate') {
        return '開始日を YYYY-MM-DD 形式で入力してください';
      }

      if (controlName === 'expectedDeliveryDate' || controlName === 'actualDeliveryDate' || controlName === 'actualEndDate') {
        return '日付を正しい形式で入力してください';
      }

      return '終了予定日を YYYY-MM-DD 形式で入力してください';
    }

    if (control.errors?.[LEAVE_GENDER_MISMATCH_ERROR]) {
      return '産前産後休業（産休）は女性従業員のみ登録可能です';
    }

    if (control.errors?.[LEAVE_BEFORE_HIRE_DATE_ERROR]) {
      return '開始日・終了予定日は入社日以降の日付を指定してください';
    }

    if (control.errors?.[LEAVE_END_BEFORE_START_ERROR]) {
      return '終了予定日は、開始日以降の日付を指定してください';
    }

    if (control.errors?.[EXCEEDS_PATERNITY_LEAVE_LIMIT_ERROR]) {
      return '男性の育休（産後パパ育休）の取得期間は最大4週間（28日）までです';
    }

    if (control.errors?.[CHILDCARE_BIRTH_AFTER_START_ERROR]) {
      return '※育休の場合、子の生年月日は休業開始日以前である必要があります';
    }

    if (controlName === 'endDate' && this.showLeavePeriodLockError()) {
      return LEAVE_PERIOD_LOCKED_MONTH_MESSAGE;
    }

    return '入力内容を確認してください';
  }
}
