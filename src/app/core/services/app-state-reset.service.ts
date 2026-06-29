import { inject, Injectable } from '@angular/core';
import { AdminEmployeeLinkService } from '@core/services/admin-employee-link.service';
import { AdminTodoService } from '@core/services/admin-todo.service';
import { AgeEventContextService, AgeEventNotificationService } from '@core/services/age-event-notification.service';
import { ApplicationWorkflowInboxService } from '@core/services/application-workflow-inbox.service';
import { CompanyService } from '@core/services/company.service';
import { CompensationService } from '@core/services/compensation.service';
import { DependentWorkflowInboxService } from '@core/services/dependent-workflow-inbox.service';
import { EmployeeService } from '@core/services/employee.service';
import { LeaveWorkflowInboxService } from '@core/services/leave-workflow-inbox.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { WorkflowApprovalService } from '@core/services/workflow-approval.service';
import { WorkflowNotificationService } from '@core/services/workflow-notification.service';
import { ToastService } from '@shared/services/toast.service';

@Injectable({ providedIn: 'root' })
export class AppStateResetService {
  private readonly companyService = inject(CompanyService);
  private readonly employeeService = inject(EmployeeService);
  private readonly compensationService = inject(CompensationService);
  private readonly monthlyLockService = inject(MonthlyLockService);
  private readonly adminEmployeeLinkService = inject(AdminEmployeeLinkService);
  private readonly workflowNotificationService = inject(WorkflowNotificationService);
  private readonly workflowApprovalService = inject(WorkflowApprovalService);
  private readonly leaveWorkflowInboxService = inject(LeaveWorkflowInboxService);
  private readonly applicationWorkflowInboxService = inject(ApplicationWorkflowInboxService);
  private readonly dependentWorkflowInboxService = inject(DependentWorkflowInboxService);
  private readonly ageEventContextService = inject(AgeEventContextService);
  private readonly ageEventNotificationService = inject(AgeEventNotificationService);
  private readonly adminTodoService = inject(AdminTodoService);
  private readonly toastService = inject(ToastService);

  clearBrowserStorage(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  }

  resetAllServiceState(): void {
    this.companyService.resetState();
    this.employeeService.resetState();
    this.compensationService.resetState();
    this.monthlyLockService.resetState();
    this.adminEmployeeLinkService.resetState();
    this.workflowNotificationService.resetState();
    this.workflowApprovalService.resetState();
    this.leaveWorkflowInboxService.resetState();
    this.applicationWorkflowInboxService.resetState();
    this.dependentWorkflowInboxService.resetState();
    this.ageEventContextService.resetState();
    this.ageEventNotificationService.resetState();
    this.adminTodoService.resetState();
    this.toastService.resetState();
  }

  /** ログアウト後や新規登録前に、前セッションのデータが残っていないか */
  hasResidualApplicationState(): boolean {
    return (
      this.adminEmployeeLinkService.hasCachedState() ||
      this.workflowNotificationService.hasCachedState() ||
      this.workflowApprovalService.hasCachedState() ||
      this.leaveWorkflowInboxService.hasCachedState() ||
      this.applicationWorkflowInboxService.hasCachedState() ||
      this.dependentWorkflowInboxService.hasCachedState() ||
      this.ageEventNotificationService.hasCachedState() ||
      this.adminTodoService.hasCachedState()
    );
  }
}
