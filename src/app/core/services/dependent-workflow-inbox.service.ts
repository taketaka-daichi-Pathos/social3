import { inject, Injectable, signal } from '@angular/core';
import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';

@Injectable({ providedIn: 'root' })
export class DependentWorkflowInboxService {
  readonly selectedRequest = signal<WorkflowRequest | null>(null);

  select(request: WorkflowRequest): void {
    if (request.status !== 'pending' || request.type !== 'add_dependent') {
      return;
    }

    this.selectedRequest.set(request);
  }

  clearSelection(): void {
    this.selectedRequest.set(null);
  }
}
