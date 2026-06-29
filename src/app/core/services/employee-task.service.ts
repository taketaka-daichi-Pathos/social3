import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  collectionData,
  doc,
  Firestore,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import {
  FirestoreCollections,
  FirestoreCompanySubcollections,
} from '@core/models/firestore-collections';
import { EmployeeService } from '@core/services/employee.service';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import {
  CreateEmployeeTaskInput,
  EmployeeTask,
  EmployeeTaskFieldValues,
  EmployeeTaskRequestedField,
  EmployeeTaskStatus,
  EmployeeTaskType,
} from '@features/employee-portal/models/employee-task.model';
import { catchError, map, Observable, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EmployeeTaskService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly employeeService = inject(EmployeeService);

  watchTasksForEmployee(companyOwnerUid: string, employeeId: string): Observable<EmployeeTask[]> {
    const tasksRef = this.tasksCollectionRef(companyOwnerUid);

    return collectionData(query(tasksRef, where('employeeId', '==', employeeId)), {
      idField: 'id',
    }).pipe(
      map((rows) =>
        rows
          .map((row) => this.toEmployeeTask(row))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      ),
      catchError((error) =>
        throwError(() => new Error(toFirestoreErrorMessage(error, 'タスク一覧の取得に失敗しました')))
      )
    );
  }

  watchPendingTasksForEmployee(
    companyOwnerUid: string,
    employeeId: string
  ): Observable<EmployeeTask[]> {
    return this.watchTasksForEmployee(companyOwnerUid, employeeId).pipe(
      map((tasks) => tasks.filter((task) => task.status === 'PENDING'))
    );
  }

  async createTask(companyOwnerUid: string, input: CreateEmployeeTaskInput): Promise<EmployeeTask> {
    await requireAuthenticatedUser(this.auth);

    const hasPending = await this.hasPendingTask(
      companyOwnerUid,
      input.employeeId,
      input.taskType
    );
    if (hasPending) {
      throw new Error('同じ種類の未対応タスクが既に存在します');
    }

    const tasksRef = this.tasksCollectionRef(companyOwnerUid);
    const requestedFields =
      input.requestedFields.length > 0
        ? input.requestedFields
        : [];

    if (requestedFields.length === 0) {
      throw new Error('依頼する項目がありません');
    }

    try {
      const created = await addDoc(tasksRef, {
        employeeId: input.employeeId,
        taskType: input.taskType,
        status: 'PENDING' satisfies EmployeeTaskStatus,
        requestedFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        id: created.id,
        employeeId: input.employeeId,
        taskType: input.taskType,
        status: 'PENDING',
        requestedFields,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, 'タスクの作成に失敗しました'));
    }
  }

  async createRetirementInfoRequest(
    companyOwnerUid: string,
    employeeId: string,
    requestedFields: EmployeeTaskRequestedField[]
  ): Promise<EmployeeTask> {
    return this.createTask(companyOwnerUid, {
      employeeId,
      taskType: 'RETIREMENT_INFO',
      requestedFields,
    });
  }

  /** 退職手続き保存時に従業員へ送る手続き依頼タスク */
  async createRetirementProcedureRequest(
    companyOwnerUid: string,
    employeeId: string
  ): Promise<EmployeeTask> {
    return this.createTask(companyOwnerUid, {
      employeeId,
      taskType: 'RETIREMENT_INFO',
      requestedFields: [
        'postRetirementAddress',
        'postRetirementEmail',
        'insuranceCardReturnCommitment',
      ],
    });
  }

  async createShikakuShutokuInfoRequest(
    companyOwnerUid: string,
    employeeId: string,
    requestedFields: EmployeeTaskRequestedField[]
  ): Promise<EmployeeTask> {
    return this.createTask(companyOwnerUid, {
      employeeId,
      taskType: 'SHIKAKU_SHUTOKU_INFO',
      requestedFields,
    });
  }

  async createMaternityLeaveInfoRequest(
    companyOwnerUid: string,
    employeeId: string,
    requestedFields: EmployeeTaskRequestedField[]
  ): Promise<EmployeeTask> {
    return this.createTask(companyOwnerUid, {
      employeeId,
      taskType: 'MATERNITY_LEAVE_INFO_REQUEST',
      requestedFields,
    });
  }

  async createChildcareLeaveInfoRequest(
    companyOwnerUid: string,
    employeeId: string,
    requestedFields: EmployeeTaskRequestedField[]
  ): Promise<EmployeeTask> {
    return this.createTask(companyOwnerUid, {
      employeeId,
      taskType: 'CHILDCARE_LEAVE_INFO_REQUEST',
      requestedFields,
    });
  }

  async createDependentInfoRequest(
    companyOwnerUid: string,
    employeeId: string,
    requestedFields: EmployeeTaskRequestedField[]
  ): Promise<EmployeeTask> {
    return this.createTask(companyOwnerUid, {
      employeeId,
      taskType: 'DEPENDENT_INFO_REQUEST',
      requestedFields,
    });
  }

  watchCompanyTasks(companyOwnerUid: string): Observable<EmployeeTask[]> {
    const tasksRef = this.tasksCollectionRef(companyOwnerUid);

    return collectionData(tasksRef, { idField: 'id' }).pipe(
      map((rows) =>
        rows
          .map((row) => this.toEmployeeTask(row))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      ),
      catchError((error) =>
        throwError(() => new Error(toFirestoreErrorMessage(error, 'タスク一覧の取得に失敗しました')))
      )
    );
  }

  hasPendingTaskForEmployee(
    tasks: EmployeeTask[],
    employeeId: string,
    taskType: EmployeeTaskType
  ): boolean {
    return tasks.some(
      (task) =>
        task.employeeId === employeeId && task.taskType === taskType && task.status === 'PENDING'
    );
  }

  async completeTask(
    companyOwnerUid: string,
    task: EmployeeTask,
    values: EmployeeTaskFieldValues
  ): Promise<void> {
    await requireAuthenticatedUser(this.auth);

    if (task.status === 'COMPLETED') {
      throw new Error('このタスクは既に完了しています');
    }

    await this.employeeService.applyEmployeeTaskFieldValues(
      companyOwnerUid,
      task.employeeId,
      task.requestedFields,
      values
    );

    try {
      await updateDoc(doc(this.tasksCollectionRef(companyOwnerUid), task.id), {
        status: 'COMPLETED' satisfies EmployeeTaskStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, 'タスクの更新に失敗しました'));
    }
  }

  private async hasPendingTask(
    companyOwnerUid: string,
    employeeId: string,
    taskType: EmployeeTaskType
  ): Promise<boolean> {
    const snapshot = await getDocs(
      query(this.tasksCollectionRef(companyOwnerUid), where('employeeId', '==', employeeId))
    );

    return snapshot.docs.some((taskDoc) => {
      const data = taskDoc.data();
      return data['taskType'] === taskType && data['status'] === 'PENDING';
    });
  }

  private tasksCollectionRef(companyOwnerUid: string) {
    return collection(
      this.firestore,
      FirestoreCollections.companies,
      companyOwnerUid,
      FirestoreCompanySubcollections.employeeTasks
    );
  }

  private toEmployeeTask(row: Record<string, unknown>): EmployeeTask {
    return {
      id: String(row['id'] ?? ''),
      employeeId: String(row['employeeId'] ?? ''),
      taskType: row['taskType'] as EmployeeTask['taskType'],
      status: row['status'] === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
      requestedFields: Array.isArray(row['requestedFields'])
        ? (row['requestedFields'] as EmployeeTask['requestedFields'])
        : [],
      createdAt: this.toIsoString(row['createdAt']),
      updatedAt: this.toIsoString(row['updatedAt']),
    };
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
