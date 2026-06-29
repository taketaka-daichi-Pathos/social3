import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { AdminTodoService } from '@core/services/admin-todo.service';
import { EmployeeSessionService } from '@core/services/employee-session.service';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { WorkflowBellNotification } from '@features/workflow/models/workflow-notification.model';
import {
  buildWorkflowRequestBellMessage,
  resolveAdminTodoRoute,
  resolveWorkflowRequestRoute,
  workflowRequestTypeLabel,
} from '@features/workflow/utils/workflow-navigation.utils';
import { combineLatest } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WorkflowNotificationService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly sessionService = inject(EmployeeSessionService);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly adminTodoService = inject(AdminTodoService);

  readonly workflowNotifications = signal<WorkflowBellNotification[]>([]);
  readonly unreadWorkflowCount = signal(0);

  private watchStarted = false;

  resetState(): void {
    this.workflowNotifications.set([]);
    this.unreadWorkflowCount.set(0);
    this.watchStarted = false;
  }

  hasCachedState(): boolean {
    return (
      this.watchStarted ||
      this.workflowNotifications().length > 0 ||
      this.unreadWorkflowCount() > 0
    );
  }

  ensureWatching(): void {
    if (this.watchStarted) {
      return;
    }

    this.watchStarted = true;
    void this.startWatching();
  }

  navigateToNotification(notification: WorkflowBellNotification): void {
    void this.router.navigateByUrl(notification.route);
  }

  private async startWatching(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return;
    }

    const isAdmin = await this.sessionService.isCompanyAdmin(user.uid);
    if (isAdmin) {
      this.adminTodoService.ensureWatching(user.uid);

      combineLatest([
        this.requestService.watchPendingRequestsForAdmin(user.uid),
        this.adminTodoService.watchIncompleteTodos(user.uid),
      ])
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ([requests, todos]) => {
            const requestNotifications: WorkflowBellNotification[] = requests.map((request) => ({
              id: `request:${request.id}`,
              source: 'request',
              title: workflowRequestTypeLabel(request.type),
              message: buildWorkflowRequestBellMessage(request),
              route: resolveWorkflowRequestRoute(request),
              createdAt: request.createdAt,
              request,
            }));

            const todoNotifications: WorkflowBellNotification[] = todos.map((todo) => ({
              id: `admin_todo:${todo.id}`,
              source: 'admin_todo',
              title: todo.title,
              message: '管理者TODOが未完了です',
              route: resolveAdminTodoRoute(todo),
              createdAt: todo.createdAt,
            }));

            this.mergeNotifications([...requestNotifications, ...todoNotifications]);
          },
          error: () => {
            this.workflowNotifications.set([]);
            this.unreadWorkflowCount.set(0);
          },
        });

      return;
    }

    const session = await this.sessionService.resolveCurrentSession();
    if (!session) {
      return;
    }

    this.requestService
      .watchOpenRequestsForEmployee(session.companyOwnerUid, session.employee.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (requests) => {
          const notifications: WorkflowBellNotification[] = requests.map((request) => ({
            id: `request:${request.id}`,
            source: 'request',
            title: workflowRequestTypeLabel(request.type),
            message: buildWorkflowRequestBellMessage(request),
            route: '/employee/dashboard',
            createdAt: request.createdAt,
          }));

          this.mergeNotifications(notifications);
        },
        error: () => {
          this.workflowNotifications.set([]);
          this.unreadWorkflowCount.set(0);
        },
      });
  }

  private mergeNotifications(notifications: WorkflowBellNotification[]): void {
    const sorted = [...notifications].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
    this.workflowNotifications.set(sorted);
    this.unreadWorkflowCount.set(sorted.length);
  }
}
