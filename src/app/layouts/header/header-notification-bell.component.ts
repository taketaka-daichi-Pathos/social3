import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgeEventNotificationService } from '@core/services/age-event-notification.service';
import { DependentWorkflowInboxService } from '@core/services/dependent-workflow-inbox.service';
import { LeaveWorkflowInboxService } from '@core/services/leave-workflow-inbox.service';
import { WorkflowApprovalService } from '@core/services/workflow-approval.service';
import { WorkflowNotificationService } from '@core/services/workflow-notification.service';
import { WorkflowBellNotification } from '@features/workflow/models/workflow-notification.model';
import {
  isAddDependentWorkflowRequestType,
  isLeaveWorkflowRequestType,
} from '@features/workflow/utils/workflow-navigation.utils';

export interface HeaderBellItem {
  id: string;
  kind: 'age' | 'workflow';
  title: string;
  message: string;
  workflowNotification?: WorkflowBellNotification;
}

@Component({
  selector: 'app-header-notification-bell',
  standalone: true,
  templateUrl: './header-notification-bell.component.html',
  styleUrl: './header-notification-bell.component.scss',
})
export class HeaderNotificationBellComponent {
  private readonly router = inject(Router);
  private readonly ageEventNotifications = inject(AgeEventNotificationService);
  private readonly workflowNotifications = inject(WorkflowNotificationService);
  private readonly workflowApproval = inject(WorkflowApprovalService);
  private readonly leaveWorkflowInbox = inject(LeaveWorkflowInboxService);
  private readonly dependentWorkflowInbox = inject(DependentWorkflowInboxService);

  readonly panelOpen = signal(false);
  private readonly dismissedWorkflowIds = signal<Set<string>>(new Set());

  readonly items = computed<HeaderBellItem[]>(() => {
    const dismissed = this.dismissedWorkflowIds();

    const workflowItems: HeaderBellItem[] = this.workflowNotifications
      .workflowNotifications()
      .filter((notification) => !dismissed.has(notification.id))
      .map((notification) => ({
        id: notification.id,
        kind: 'workflow',
        title: notification.title,
        message: notification.message,
        workflowNotification: notification,
      }));

    const ageItems: HeaderBellItem[] = this.ageEventNotifications.bellNotifications().map(
      (notification) => ({
        id: notification.id,
        kind: 'age',
        title: '年齢到達',
        message: notification.message,
      })
    );

    return [...workflowItems, ...ageItems];
  });

  readonly unreadCount = computed(() => this.items().length);

  constructor() {
    this.ageEventNotifications.ensureWatching();
    this.workflowNotifications.ensureWatching();
  }

  togglePanel(): void {
    this.panelOpen.update((open) => !open);
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  onItemClick(item: HeaderBellItem): void {
    if (item.kind === 'workflow' && item.workflowNotification) {
      const notification = item.workflowNotification;

      if (
        notification.source === 'request' &&
        notification.request?.status === 'pending'
      ) {
        const request = notification.request;

        if (isLeaveWorkflowRequestType(request.type)) {
          void this.router.navigateByUrl('/leave').then(() => {
            this.leaveWorkflowInbox.open(request);
          });
          this.closePanel();
          return;
        }

        if (isAddDependentWorkflowRequestType(request.type)) {
          void this.router.navigateByUrl('/dependents').then(() => {
            this.dependentWorkflowInbox.select(request);
          });
          this.closePanel();
          return;
        }

        this.workflowApproval.open(request);
        this.closePanel();
        return;
      }

      this.workflowNotifications.navigateToNotification(notification);
      this.closePanel();
    }
  }

  dismissItem(item: HeaderBellItem, event: Event): void {
    event.stopPropagation();

    if (item.kind === 'age') {
      this.ageEventNotifications.removeNotification(item.id);
      return;
    }

    this.dismissedWorkflowIds.update((dismissed) => {
      const next = new Set(dismissed);
      next.add(item.id);
      return next;
    });
  }

  clearAllNotifications(event: Event): void {
    event.stopPropagation();
    this.ageEventNotifications.clearAllNotifications();
    this.dismissedWorkflowIds.set(
      new Set(this.workflowNotifications.workflowNotifications().map((notification) => notification.id))
    );
  }
}
