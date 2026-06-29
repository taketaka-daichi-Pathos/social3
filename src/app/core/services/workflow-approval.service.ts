import { inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { AdminTodoService } from '@core/services/admin-todo.service';
import { EmployeeService } from '@core/services/employee.service';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';
import { buildAdminTodoTitleForRequest } from '@features/workflow/utils/workflow-payload.utils';
import { buildDependentFromAddDependentWorkflowPayload } from '@features/workflow/utils/workflow-dependent.utils';
import { isAddDependentWorkflowRequestType, isLeaveWorkflowRequestType } from '@features/workflow/utils/workflow-navigation.utils';
import { employeeFullName } from '@features/payroll/utils/compensation.utils';
import { firstValueFrom, take } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WorkflowApprovalService {
  private readonly auth = inject(Auth);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly adminTodoService = inject(AdminTodoService);
  private readonly employeeService = inject(EmployeeService);

  readonly modalOpen = signal(false);
  readonly selectedRequest = signal<WorkflowRequest | null>(null);
  readonly approving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  resetState(): void {
    this.close();
    this.approving.set(false);
  }

  hasCachedState(): boolean {
    return this.modalOpen() || this.selectedRequest() != null || this.approving();
  }

  open(request: WorkflowRequest): void {
    if (
      request.status !== 'pending' ||
      isLeaveWorkflowRequestType(request.type) ||
      isAddDependentWorkflowRequestType(request.type)
    ) {
      return;
    }

    this.selectedRequest.set(request);
    this.modalOpen.set(true);
    this.errorMessage.set(null);
  }

  close(): void {
    this.modalOpen.set(false);
    this.selectedRequest.set(null);
    this.errorMessage.set(null);
  }

  async approveRequest(request: WorkflowRequest): Promise<void> {
    await this.executeApproval(request);
  }

  async approveSelectedRequest(): Promise<void> {
    const request = this.selectedRequest();
    if (!request || this.approving()) {
      return;
    }

    this.approving.set(true);
    this.errorMessage.set(null);

    try {
      await this.executeApproval(request);
      this.close();
    } catch (error) {
      this.errorMessage.set(
        toFirestoreErrorMessage(error, '承認処理に失敗しました')
      );
    } finally {
      this.approving.set(false);
    }
  }

  private async executeApproval(request: WorkflowRequest): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);
    const employees = await firstValueFrom(this.employeeService.watchEmployees().pipe(take(1)));
    const employee = employees.find((row) => row.id === request.targetEmployeeId);

    if (!employee) {
      throw new Error('対象従業員が見つかりません');
    }

    if (request.type === 'add_dependent') {
      const dependent = buildDependentFromAddDependentWorkflowPayload(request.payload);
      if (!dependent) {
        throw new Error('扶養家族の申請内容が不足しているため登録できません');
      }

      const dependents = [...(employee.dependents ?? []), dependent];
      await this.employeeService.updateEmployeeDependents(request.targetEmployeeId, dependents);
    }

    const employeeName = employeeFullName(employee);
    const todoTitle = buildAdminTodoTitleForRequest(employeeName, request.type);

    await Promise.all([
      this.requestService.updateRequest(user.uid, request.id, { status: 'approved' }),
      this.adminTodoService.createAdminTodo(user.uid, {
        relatedRequestId: request.id,
        title: todoTitle,
        targetTab: 'legal-forms',
      }),
    ]);
  }
}
