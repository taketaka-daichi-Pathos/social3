import { Injectable, signal } from '@angular/core';
import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';
import { isChangeApplicationWorkflowRequestType } from '@features/workflow/utils/workflow-navigation.utils';

@Injectable({ providedIn: 'root' })
export class ApplicationWorkflowInboxService {
  readonly selectedRequest = signal<WorkflowRequest | null>(null);

  select(request: WorkflowRequest): void {
    if (request.status !== 'pending' || !isChangeApplicationWorkflowRequestType(request.type)) {
      return;
    }

    this.selectedRequest.set(request);
  }

  clearSelection(): void {
    this.selectedRequest.set(null);
  }

  open(request: WorkflowRequest): void {
    this.select(request);
  }
}
