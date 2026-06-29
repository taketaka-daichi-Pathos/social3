import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth, authState } from '@angular/fire/auth';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DependentWorkflowInboxService } from '@core/services/dependent-workflow-inbox.service';
import { EmployeeService } from '@core/services/employee.service';
import { EmployeeTaskService } from '@core/services/employee-task.service';
import { WorkflowApprovalService } from '@core/services/workflow-approval.service';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { AddDependentModalComponent } from '@features/dependents/components/add-dependent-modal/add-dependent-modal.component';
import { DependentWorkflowRequestPanelComponent } from '@features/dependents/components/dependent-workflow-request-panel/dependent-workflow-request-panel.component';
import { Dependent } from '@features/dependents/models/dependent.model';
import { DEPENDENT_INFO_REQUEST_FIELDS } from '@features/dependents/utils/dependent-task.utils';
import {
  dependentFullName,
  dependentLivingArrangementLabel,
  dependentOccupationLabel,
  dependentRelationshipLabel,
  dependentSituationLabel,
  dependentStatusLabel,
  listDependentRowsForEmployee,
} from '@features/dependents/utils/dependent-display.utils';
import { EmployeeTask } from '@features/employee-portal/models/employee-task.model';
import { Employee } from '@features/employees/models/employee.model';
import { sortEmployeesByNumber } from '@features/employees/utils/employee-list.utils';
import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';
import { parseAddDependentWorkflowPayload } from '@features/workflow/utils/workflow-payload.utils';
import { isAddDependentWorkflowRequestType } from '@features/workflow/utils/workflow-navigation.utils';
import { filter, map, switchMap } from 'rxjs';

@Component({
  selector: 'app-dependent-page',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    AddDependentModalComponent,
    DependentWorkflowRequestPanelComponent,
  ],
  templateUrl: './dependent-page.component.html',
  styleUrl: './dependent-page.component.scss',
})
export class DependentPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly employeeService = inject(EmployeeService);
  private readonly employeeTaskService = inject(EmployeeTaskService);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly workflowApproval = inject(WorkflowApprovalService);
  private readonly dependentInbox = inject(DependentWorkflowInboxService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly saveSuccess = signal<string | null>(null);
  readonly saving = signal(false);
  readonly employees = signal<Employee[]>([]);
  readonly addModalOpen = signal(false);
  readonly modalDraftDependent = signal<Dependent | null>(null);
  readonly employeeTasks = signal<EmployeeTask[]>([]);
  readonly requestingSubmission = signal(false);
  readonly requestSuccess = signal<string | null>(null);
  readonly pendingDependentRequests = signal<WorkflowRequest[]>([]);
  readonly requestsLoading = signal(true);
  readonly requestsError = signal<string | null>(null);
  readonly trayApproving = signal(false);
  readonly trayError = signal<string | null>(null);
  readonly approveSuccess = signal<string | null>(null);

  readonly selectedTrayRequest = this.dependentInbox.selectedRequest;

  readonly employeeIdControl = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });

  readonly selectedEmployeeId = signal('');

  readonly employeeOptions = computed(() => sortEmployeesByNumber(this.employees()));

  readonly selectedEmployee = computed(() => {
    const employeeId = this.selectedEmployeeId();
    return this.employees().find((employee) => employee.id === employeeId);
  });

  readonly dependentRows = computed(() => {
    const employee = this.selectedEmployee();
    if (!employee) {
      return [];
    }

    return listDependentRowsForEmployee(
      employee.id,
      employee.employeeNumber,
      `${employee.lastName} ${employee.firstName}`,
      employee.dependents
    );
  });

  readonly dependentTrayItems = computed(() => {
    const employees = this.employees();

    return this.pendingDependentRequests().map((request) => {
      const employee = employees.find((row) => row.id === request.targetEmployeeId);
      const parsed = parseAddDependentWorkflowPayload(request.payload);
      const dependentName =
        parsed.lastName || parsed.firstName
          ? `${parsed.lastName} ${parsed.firstName}`.trim()
          : '—';

      return {
        request,
        employeeNumber: employee?.employeeNumber ?? '—',
        employeeName: employee ? `${employee.lastName} ${employee.firstName}` : '—',
        dependentName,
        dependencyStartDate: parsed.dependencyStartDate || '—',
      };
    });
  });

  readonly hasPendingDependentSubmission = computed(() => {
    const employee = this.selectedEmployee();
    return employee?.pendingDependentSubmission != null;
  });

  readonly hasPendingDependentInfoRequest = computed(() => {
    const employeeId = this.selectedEmployeeId();
    if (!employeeId) {
      return false;
    }

    return this.employeeTaskService.hasPendingTaskForEmployee(
      this.employeeTasks(),
      employeeId,
      'DEPENDENT_INFO_REQUEST'
    );
  });

  readonly canRequestDependentSubmission = computed(() => {
    const employee = this.selectedEmployee();
    return Boolean(employee?.authUid) && !this.hasPendingDependentInfoRequest();
  });

  ngOnInit(): void {
    this.selectedEmployeeId.set(this.employeeIdControl.value);

    this.employeeIdControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((employeeId) => {
        this.selectedEmployeeId.set(employeeId);
        this.saveError.set(null);
        this.saveSuccess.set(null);
        this.requestSuccess.set(null);
        this.approveSuccess.set(null);
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
          this.employees.set([]);
          this.loading.set(false);
        },
      });

    const companyOwnerUid = this.auth.currentUser?.uid;
    if (companyOwnerUid) {
      this.employeeTaskService
        .watchCompanyTasks(companyOwnerUid)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (tasks) => this.employeeTasks.set(tasks),
          error: () => this.employeeTasks.set([]),
        });
    }

    authState(this.auth)
      .pipe(
        filter((user) => user != null),
        switchMap((user) => this.requestService.watchPendingRequestsForAdmin(user!.uid)),
        map((requests) =>
          requests.filter((request) => isAddDependentWorkflowRequestType(request.type))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (requests) => {
          this.pendingDependentRequests.set(requests);
          this.requestsError.set(null);
          this.requestsLoading.set(false);

          const selected = this.selectedTrayRequest();
          if (selected && !requests.some((request) => request.id === selected.id)) {
            this.dependentInbox.clearSelection();
          }
        },
        error: (error) => {
          this.requestsError.set(toFirestoreErrorMessage(error, '扶養申請トレイの取得に失敗しました'));
          this.pendingDependentRequests.set([]);
          this.requestsLoading.set(false);
        },
      });
  }

  employeeLabel(employee: Employee): string {
    return `${employee.employeeNumber} ${employee.lastName} ${employee.firstName}`;
  }

  selectTrayRequest(request: WorkflowRequest): void {
    this.trayError.set(null);
    this.approveSuccess.set(null);
    this.dependentInbox.select(request);
  }

  clearTraySelection(): void {
    this.trayError.set(null);
    this.dependentInbox.clearSelection();
  }

  isTrayItemSelected(request: WorkflowRequest): boolean {
    return this.selectedTrayRequest()?.id === request.id;
  }

  async approveSelectedTrayRequest(): Promise<void> {
    const request = this.selectedTrayRequest();
    if (!request || this.trayApproving()) {
      return;
    }

    this.trayApproving.set(true);
    this.trayError.set(null);
    this.approveSuccess.set(null);
    this.saveError.set(null);

    try {
      await this.workflowApproval.approveRequest(request);

      this.employeeIdControl.setValue(request.targetEmployeeId);
      this.selectedEmployeeId.set(request.targetEmployeeId);

      const parsed = parseAddDependentWorkflowPayload(request.payload);
      const dependentName = `${parsed.lastName} ${parsed.firstName}`.trim();
      const employee = this.employees().find((row) => row.id === request.targetEmployeeId);
      const employeeName = employee ? `${employee.lastName} ${employee.firstName}` : '従業員';

      this.approveSuccess.set(
        `${employeeName} さんの扶養家族「${dependentName}」を登録し、申請を承認しました`
      );
      this.dependentInbox.clearSelection();
    } catch (error) {
      this.trayError.set(toFirestoreErrorMessage(error, '承認処理に失敗しました'));
    } finally {
      this.trayApproving.set(false);
    }
  }

  openAddModal(draft: Dependent | null = null): void {
    if (!this.selectedEmployee()) {
      this.saveError.set('扶養家族を登録する従業員を選択してください');
      return;
    }

    this.saveError.set(null);
    this.modalDraftDependent.set(draft);
    this.addModalOpen.set(true);
  }

  openAddModalFromEmployeeSubmission(): void {
    const draft = this.selectedEmployee()?.pendingDependentSubmission ?? null;
    this.openAddModal(draft);
  }

  closeAddModal(): void {
    this.addModalOpen.set(false);
    this.modalDraftDependent.set(null);
  }

  async onDependentSaved(dependent: Dependent): Promise<void> {
    const employee = this.selectedEmployee();
    if (!employee) {
      this.saveError.set('従業員が見つかりません');
      return;
    }

    const dependents = [...(employee.dependents ?? []), dependent];

    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);

    try {
      await this.employeeService.updateEmployeeDependents(employee.id, dependents);
      this.employees.update((list) =>
        list.map((row) =>
          row.id === employee.id
            ? {
                ...row,
                dependents,
                hasDependents: dependents.length > 0,
                pendingDependentSubmission: null,
              }
            : row
        )
      );
      this.saveSuccess.set(
        `${employee.lastName} ${employee.firstName} の扶養家族を登録しました`
      );
      this.closeAddModal();
    } catch (error) {
      this.saveError.set(toFirestoreErrorMessage(error, '扶養家族の保存に失敗しました'));
    } finally {
      this.saving.set(false);
    }
  }

  async requestDependentSubmission(): Promise<void> {
    const employee = this.selectedEmployee();
    const companyOwnerUid = this.auth.currentUser?.uid;

    if (!employee || !companyOwnerUid) {
      this.saveError.set('従業員または会社情報が見つかりません');
      return;
    }

    if (!employee.authUid) {
      this.saveError.set('この従業員は従業員ポータルのログインが未設定のため、依頼を送信できません');
      return;
    }

    if (this.hasPendingDependentInfoRequest()) {
      this.saveError.set('この従業員には未対応の扶養情報提出依頼が既に存在します');
      return;
    }

    this.requestingSubmission.set(true);
    this.saveError.set(null);
    this.requestSuccess.set(null);

    try {
      await this.employeeTaskService.createDependentInfoRequest(
        companyOwnerUid,
        employee.id,
        [...DEPENDENT_INFO_REQUEST_FIELDS]
      );
      this.requestSuccess.set(
        `${employee.lastName} ${employee.firstName} さんに扶養情報の入力・提出依頼を送信しました`
      );
    } catch (error) {
      this.saveError.set(toFirestoreErrorMessage(error, '提出依頼の送信に失敗しました'));
    } finally {
      this.requestingSubmission.set(false);
    }
  }

  fullName = dependentFullName;
  relationshipLabel = dependentRelationshipLabel;
  livingArrangementLabel = dependentLivingArrangementLabel;
  occupationLabel = dependentOccupationLabel;
  situationLabel = dependentSituationLabel;
  statusLabel = dependentStatusLabel;
}
