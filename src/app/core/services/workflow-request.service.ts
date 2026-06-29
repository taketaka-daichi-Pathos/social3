import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  collectionData,
  doc,
  Firestore,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from '@angular/fire/firestore';
import {
  FirestoreCollections,
  FirestoreCompanySubcollections,
} from '@core/models/firestore-collections';
import { EmployeeService } from '@core/services/employee.service';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import {
  CreateWorkflowRequestInput,
  UpdateWorkflowRequestInput,
  WorkflowRequest,
  WorkflowRequestStatus,
  WorkflowRequestType,
} from '@features/workflow/models/workflow-request.model';
import { validateWorkflowRequestCreate } from '@features/workflow/utils/workflow-request.validation.utils';
import { catchError, firstValueFrom, map, Observable, take, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WorkflowRequestService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly employeeService = inject(EmployeeService);

  watchRequests(companyOwnerUid: string): Observable<WorkflowRequest[]> {
    return collectionData(this.requestsCollectionRef(companyOwnerUid), { idField: 'id' }).pipe(
      map((rows) =>
        rows
          .map((row) => this.toWorkflowRequest(row))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      ),
      catchError((error) =>
        throwError(() =>
          new Error(toFirestoreErrorMessage(error, '申請・依頼一覧の取得に失敗しました'))
        )
      )
    );
  }

  watchRequestsForEmployee(
    companyOwnerUid: string,
    employeeId: string
  ): Observable<WorkflowRequest[]> {
    return this.watchRequests(companyOwnerUid).pipe(
      map((requests) =>
        requests.filter(
          (request) =>
            request.targetEmployeeId === employeeId || request.requesterId === employeeId
        )
      )
    );
  }

  watchOpenRequestsForEmployee(
    companyOwnerUid: string,
    employeeId: string
  ): Observable<WorkflowRequest[]> {
    return this.watchRequestsForEmployee(companyOwnerUid, employeeId).pipe(
      map((requests) => requests.filter((request) => request.status === 'pending'))
    );
  }

  watchPendingRequestsForAdmin(companyOwnerUid: string): Observable<WorkflowRequest[]> {
    return this.watchRequests(companyOwnerUid).pipe(
      map((requests) => requests.filter((request) => request.status === 'pending'))
    );
  }

  async createRequest(
    companyOwnerUid: string,
    input: CreateWorkflowRequestInput
  ): Promise<WorkflowRequest> {
    await requireAuthenticatedUser(this.auth);

    const employees = await firstValueFrom(this.employeeService.watchEmployees().pipe(take(1)));
    validateWorkflowRequestCreate(employees, input);

    try {
      const created = await addDoc(this.requestsCollectionRef(companyOwnerUid), {
        type: input.type,
        requesterId: input.requesterId.trim(),
        targetEmployeeId: input.targetEmployeeId.trim(),
        status: (input.status ?? 'pending') satisfies WorkflowRequestStatus,
        payload: input.payload ?? {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        id: created.id,
        type: input.type,
        requesterId: input.requesterId.trim(),
        targetEmployeeId: input.targetEmployeeId.trim(),
        status: input.status ?? 'pending',
        payload: input.payload ?? {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '申請・依頼の作成に失敗しました'));
    }
  }

  async updateRequest(
    companyOwnerUid: string,
    requestId: string,
    input: UpdateWorkflowRequestInput
  ): Promise<void> {
    await requireAuthenticatedUser(this.auth);

    const status = input.status;
    const payload = input.payload;

    try {
      await updateDoc(doc(this.requestsCollectionRef(companyOwnerUid), requestId), {
        ...(status != null ? { status } : {}),
        ...(payload != null ? { payload } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '申請・依頼の更新に失敗しました'));
    }
  }

  private requestsCollectionRef(companyOwnerUid: string) {
    return collection(
      this.firestore,
      FirestoreCollections.companies,
      companyOwnerUid,
      FirestoreCompanySubcollections.requests
    );
  }

  private toWorkflowRequest(row: Record<string, unknown>): WorkflowRequest {
    return {
      id: String(row['id'] ?? ''),
      type: this.normalizeRequestType(row['type']),
      requesterId: String(row['requesterId'] ?? ''),
      targetEmployeeId: String(row['targetEmployeeId'] ?? ''),
      status: this.normalizeRequestStatus(row['status']),
      payload: this.normalizePayload(row['payload']),
      createdAt: this.toIsoString(row['createdAt']),
      updatedAt: this.toIsoString(row['updatedAt']),
    };
  }

  private normalizeRequestType(value: unknown): WorkflowRequestType {
    const allowed: WorkflowRequestType[] = [
      'childcare_leave',
      'maternity_leave',
      'add_dependent',
      'onboarding',
      'retirement',
      'dependent_info',
    ];

    return allowed.includes(value as WorkflowRequestType)
      ? (value as WorkflowRequestType)
      : 'onboarding';
  }

  private normalizeRequestStatus(value: unknown): WorkflowRequestStatus {
    const allowed: WorkflowRequestStatus[] = ['pending', 'approved', 'rejected', 'completed'];

    return allowed.includes(value as WorkflowRequestStatus)
      ? (value as WorkflowRequestStatus)
      : 'pending';
  }

  private normalizePayload(value: unknown): Record<string, unknown> {
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private toIsoString(value: unknown): string {
    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string' && value) {
      return value;
    }

    return new Date(0).toISOString();
  }
}
