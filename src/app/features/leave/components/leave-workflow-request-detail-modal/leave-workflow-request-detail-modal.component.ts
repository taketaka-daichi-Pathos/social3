import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { LeaveWorkflowInboxService } from '@core/services/leave-workflow-inbox.service';
import { EmployeeService } from '@core/services/employee.service';
import { employeeFullName } from '@features/payroll/utils/compensation.utils';
import {
  buildWorkflowPayloadDisplayRows,
  extractLeaveDocumentUrls,
} from '@features/workflow/utils/workflow-payload.utils';
import {
  isImageDocumentUrl,
  isPdfDocumentUrl,
} from '@features/workflow/utils/workflow-dependent.utils';
import {
  workflowRequestStatusLabel,
  workflowRequestTypeLabel,
} from '@features/workflow/utils/workflow-navigation.utils';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-leave-workflow-request-detail-modal',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './leave-workflow-request-detail-modal.component.html',
  styleUrl: './leave-workflow-request-detail-modal.component.scss',
})
export class LeaveWorkflowRequestDetailModalComponent {
  private readonly inbox = inject(LeaveWorkflowInboxService);
  private readonly employeeService = inject(EmployeeService);

  readonly open = this.inbox.modalOpen;
  readonly request = this.inbox.selectedRequest;
  readonly completing = this.inbox.completing;
  readonly errorMessage = this.inbox.errorMessage;

  private readonly employees = toSignal(this.employeeService.watchEmployees(), {
    initialValue: [],
  });

  readonly payloadRows = computed(() => {
    const current = this.request();
    if (!current) {
      return [];
    }

    return buildWorkflowPayloadDisplayRows(current.type, current.payload);
  });

  readonly documentUrls = computed(() => {
    const current = this.request();
    if (!current) {
      return [];
    }

    return extractLeaveDocumentUrls(current.payload);
  });

  readonly employeeLabel = computed(() => {
    const current = this.request();
    if (!current) {
      return '';
    }

    const employee = this.employees().find((row) => row.id === current.targetEmployeeId);
    if (!employee) {
      return '従業員情報を取得できません';
    }

    return `${employee.employeeNumber} ${employeeFullName(employee)}`;
  });

  requestTypeLabel(): string {
    const current = this.request();
    return current ? workflowRequestTypeLabel(current.type) : '';
  }

  requestStatusLabel(): string {
    const current = this.request();
    return current ? workflowRequestStatusLabel(current.status) : '';
  }

  isPdfDocument(url: string): boolean {
    return isPdfDocumentUrl(url);
  }

  isImageDocument(url: string): boolean {
    return isImageDocumentUrl(url);
  }

  openDocumentInNewTab(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  close(): void {
    this.inbox.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  async complete(): Promise<void> {
    await this.inbox.completeSelectedRequest();
  }
}
