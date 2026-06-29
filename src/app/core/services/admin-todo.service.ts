import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import {
  AdminTodo,
  AdminTodoTargetTab,
  CreateAdminTodoInput,
} from '@features/workflow/models/admin-todo.model';
import { catchError, map, Observable, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminTodoService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);

  /** targetTab ごとの未完了 TODO 有無（UI バッジ用） */
  readonly incompleteByTargetTab = signal<Partial<Record<AdminTodoTargetTab, boolean>>>({});

  private watchStarted = false;

  resetState(): void {
    this.incompleteByTargetTab.set({});
    this.watchStarted = false;
  }

  hasCachedState(): boolean {
    return this.watchStarted || Object.keys(this.incompleteByTargetTab()).length > 0;
  }

  watchAdminTodos(companyOwnerUid: string): Observable<AdminTodo[]> {
    return collectionData(this.adminTodosCollectionRef(companyOwnerUid), { idField: 'id' }).pipe(
      map((rows) =>
        rows
          .map((row) => this.toAdminTodo(row))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      ),
      catchError((error) =>
        throwError(() =>
          new Error(toFirestoreErrorMessage(error, '管理者TODO一覧の取得に失敗しました'))
        )
      )
    );
  }

  watchIncompleteTodos(companyOwnerUid: string): Observable<AdminTodo[]> {
    return this.watchAdminTodos(companyOwnerUid).pipe(
      map((todos) => todos.filter((todo) => !todo.isCompleted))
    );
  }

  hasIncompleteTodosForTab(
    companyOwnerUid: string,
    targetTab: AdminTodoTargetTab
  ): Observable<boolean> {
    return this.watchIncompleteTodos(companyOwnerUid).pipe(
      map((todos) => todos.some((todo) => todo.targetTab === targetTab))
    );
  }

  /** 監視を開始し incompleteByTargetTab シグナルを更新する */
  ensureWatching(companyOwnerUid: string): void {
    if (this.watchStarted) {
      return;
    }

    this.watchStarted = true;

    this.watchIncompleteTodos(companyOwnerUid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (todos) => {
          const nextState: Partial<Record<AdminTodoTargetTab, boolean>> = {};
          for (const todo of todos) {
            nextState[todo.targetTab] = true;
          }
          this.incompleteByTargetTab.set(nextState);
        },
        error: () => this.incompleteByTargetTab.set({}),
      });
  }

  hasBadgeForTab(targetTab: AdminTodoTargetTab | undefined): boolean {
    if (!targetTab) {
      return false;
    }

    return Boolean(this.incompleteByTargetTab()[targetTab]);
  }

  async createAdminTodo(companyOwnerUid: string, input: CreateAdminTodoInput): Promise<AdminTodo> {
    await requireAuthenticatedUser(this.auth);

    try {
      const created = await addDoc(this.adminTodosCollectionRef(companyOwnerUid), {
        relatedRequestId: input.relatedRequestId.trim(),
        title: input.title.trim(),
        targetTab: input.targetTab,
        isCompleted: input.isCompleted ?? false,
        createdAt: serverTimestamp(),
      });

      return {
        id: created.id,
        relatedRequestId: input.relatedRequestId.trim(),
        title: input.title.trim(),
        targetTab: input.targetTab,
        isCompleted: input.isCompleted ?? false,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '管理者TODOの作成に失敗しました'));
    }
  }

  async markTodoCompleted(companyOwnerUid: string, todoId: string): Promise<void> {
    await requireAuthenticatedUser(this.auth);

    try {
      await updateDoc(doc(this.adminTodosCollectionRef(companyOwnerUid), todoId), {
        isCompleted: true,
      });
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '管理者TODOの更新に失敗しました'));
    }
  }

  private adminTodosCollectionRef(companyOwnerUid: string) {
    return collection(
      this.firestore,
      FirestoreCollections.companies,
      companyOwnerUid,
      FirestoreCompanySubcollections.adminTodos
    );
  }

  private toAdminTodo(row: Record<string, unknown>): AdminTodo {
    return {
      id: String(row['id'] ?? ''),
      relatedRequestId: String(row['relatedRequestId'] ?? ''),
      title: String(row['title'] ?? ''),
      targetTab: this.normalizeTargetTab(row['targetTab']),
      isCompleted: Boolean(row['isCompleted']),
      createdAt: this.toIsoString(row['createdAt']),
    };
  }

  private normalizeTargetTab(value: unknown): AdminTodoTargetTab {
    const allowed: AdminTodoTargetTab[] = [
      'legal-forms',
      'employees',
      'dependents',
      'leave',
      'retirement',
      'payroll',
      'revision',
    ];

    return allowed.includes(value as AdminTodoTargetTab)
      ? (value as AdminTodoTargetTab)
      : 'employees';
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
