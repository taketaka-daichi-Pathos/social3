import { inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';
import { isLeaveWorkflowRequestType } from '@features/workflow/utils/workflow-navigation.utils';

@Injectable({ providedIn: 'root' })
export class LeaveWorkflowInboxService {
  private readonly auth = inject(Auth);
  private readonly requestService = inject(WorkflowRequestService);

  readonly modalOpen = signal(false);
  readonly selectedRequest = signal<WorkflowRequest | null>(null);
  readonly completing = signal(false);
  readonly errorMessage = signal<string | null>(null);

  open(request: WorkflowRequest): void {
    if (request.status !== 'pending' || !isLeaveWorkflowRequestType(request.type)) {
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

  /** 申請を処理済みにする（マスターへの自動登録は行わない） */
  async completeSelectedRequest(): Promise<void> {
    const request = this.selectedRequest();
    if (!request || this.completing()) {
      return;
    }

    this.completing.set(true);
    this.errorMessage.set(null);

    try {
      const user = await requireAuthenticatedUser(this.auth);
      await this.requestService.updateRequest(user.uid, request.id, { status: 'completed' });
      this.close();
    } catch (error) {
      this.errorMessage.set(
        toFirestoreErrorMessage(error, '申請の完了処理に失敗しました')
      );
    } finally {
      this.completing.set(false);
    }
  }
}
