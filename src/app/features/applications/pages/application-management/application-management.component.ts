import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth, authState } from '@angular/fire/auth';
import { ApplicationApprovalService } from '@core/services/application-approval.service';
import { ApplicationWorkflowInboxService } from '@core/services/application-workflow-inbox.service';
import { EmployeeService } from '@core/services/employee.service';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { ApplicationRequestDetailPanelComponent } from '@features/applications/components/application-request-detail-panel/application-request-detail-panel.component';
import { Employee } from '@features/employees/models/employee.model';
import { employeeFullName } from '@features/payroll/utils/compensation.utils';
import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';
import {
  isChangeApplicationWorkflowRequestType,
  isCommuteChangeWorkflowRequestType,
  workflowRequestTypeLabel,
} from '@features/workflow/utils/workflow-navigation.utils';
import { filter, map, switchMap } from 'rxjs';

interface ApplicationInboxItem {
  request: WorkflowRequest;
  employee: Employee;
}

@Component({
  selector: 'app-application-management',
  standalone: true,
  imports: [DatePipe, ApplicationRequestDetailPanelComponent],
  templateUrl: './application-management.component.html',
  styleUrl: './application-management.component.scss',
})
export class ApplicationManagementComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly employeeService = inject(EmployeeService);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly applicationInbox = inject(ApplicationWorkflowInboxService);
  private readonly applicationApproval = inject(ApplicationApprovalService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly employees = signal<Employee[]>([]);
  readonly pendingRequests = signal<WorkflowRequest[]>([]);
  readonly approving = signal(false);
  readonly approveError = signal<string | null>(null);
  readonly approveSuccess = signal<string | null>(null);

  readonly selectedRequest = this.applicationInbox.selectedRequest;

  readonly inboxItems = computed<ApplicationInboxItem[]>(() => {
    const employeeMap = new Map(this.employees().map((employee) => [employee.id, employee]));

    return this.pendingRequests()
      .filter((request) => isChangeApplicationWorkflowRequestType(request.type))
      .map((request) => {
        const employee = employeeMap.get(request.targetEmployeeId);
        if (!employee) {
          return null;
        }

        return { request, employee };
      })
      .filter((item): item is ApplicationInboxItem => item != null);
  });

  readonly selectedInboxItem = computed(() => {
    const selected = this.selectedRequest();
    if (!selected) {
      return null;
    }

    return this.inboxItems().find((item) => item.request.id === selected.id) ?? null;
  });

  ngOnInit(): void {
    authState(this.auth)
      .pipe(
        filter((user) => user != null),
        switchMap((user) => this.employeeService.watchEmployees().pipe(map((employees) => ({ user, employees })))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ employees }) => {
          this.employees.set(employees);
        },
        error: (error) => {
          this.loadError.set(toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました'));
          this.loading.set(false);
        },
      });

    authState(this.auth)
      .pipe(
        filter((user) => user != null),
        switchMap((user) => this.requestService.watchPendingRequestsForAdmin(user.uid)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (requests) => {
          this.pendingRequests.set(requests);
          this.loading.set(false);

          const selected = this.selectedRequest();
          if (selected && !requests.some((request) => request.id === selected.id)) {
            this.applicationInbox.clearSelection();
          }
        },
        error: (error) => {
          this.loadError.set(toFirestoreErrorMessage(error, '申請一覧の取得に失敗しました'));
          this.loading.set(false);
        },
      });
  }

  requestTypeLabel(request: WorkflowRequest): string {
    return workflowRequestTypeLabel(request.type);
  }

  employeeLabel(employee: Employee): string {
    return `${employee.employeeNumber} ${employeeFullName(employee)}`;
  }

  isSelected(request: WorkflowRequest): boolean {
    return this.selectedRequest()?.id === request.id;
  }

  selectRequest(request: WorkflowRequest): void {
    this.approveError.set(null);
    this.approveSuccess.set(null);
    this.applicationInbox.select(request);
  }

  clearSelection(): void {
    this.applicationInbox.clearSelection();
    this.approveError.set(null);
  }

  async approveSelectedApplication(): Promise<void> {
    const selected = this.selectedRequest();
    if (!selected || this.approving()) {
      return;
    }

    this.approving.set(true);
    this.approveError.set(null);
    this.approveSuccess.set(null);

    try {
      await this.applicationApproval.approveApplication(selected);
      this.approveSuccess.set(
        isCommuteChangeWorkflowRequestType(selected.type)
          ? '手動更新済みとしてタスクを完了しました。'
          : '申請を承認し、従業員マスターを更新しました。'
      );
      this.applicationInbox.clearSelection();
    } catch (error) {
      this.approveError.set(toFirestoreErrorMessage(error, '申請の承認に失敗しました'));
    } finally {
      this.approving.set(false);
    }
  }
}
