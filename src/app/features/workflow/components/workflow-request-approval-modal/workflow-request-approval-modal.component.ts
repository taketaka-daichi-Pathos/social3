import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { WorkflowApprovalService } from '@core/services/workflow-approval.service';
import { buildWorkflowPayloadDisplayRows } from '@features/workflow/utils/workflow-payload.utils';
import {
  extractAddDependentDocumentUrls,
  isImageDocumentUrl,
  isPdfDocumentUrl,
} from '@features/workflow/utils/workflow-dependent.utils';
import {
  workflowRequestStatusLabel,
  workflowRequestTypeLabel,
} from '@features/workflow/utils/workflow-navigation.utils';

@Component({
  selector: 'app-workflow-request-approval-modal',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './workflow-request-approval-modal.component.html',
  styleUrl: './workflow-request-approval-modal.component.scss',
})
export class WorkflowRequestApprovalModalComponent {
  private readonly approval = inject(WorkflowApprovalService);

  readonly open = this.approval.modalOpen;
  readonly request = this.approval.selectedRequest;
  readonly approving = this.approval.approving;
  readonly errorMessage = this.approval.errorMessage;

  readonly payloadRows = computed(() => {
    const current = this.request();
    if (!current) {
      return [];
    }

    return buildWorkflowPayloadDisplayRows(current.type, current.payload);
  });

  readonly documentUrls = computed(() => {
    const current = this.request();
    if (!current || current.type !== 'add_dependent') {
      return [];
    }

    return extractAddDependentDocumentUrls(current.payload);
  });

  readonly isAddDependentRequest = computed(() => this.request()?.type === 'add_dependent');

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
    this.approval.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  async approve(): Promise<void> {
    await this.approval.approveSelectedRequest();
  }
}
