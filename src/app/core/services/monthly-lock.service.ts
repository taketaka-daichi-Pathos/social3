import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  collection,
  doc,
  docSnapshots,
  Firestore,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { FirestoreCollections } from '@core/models/firestore-collections';
import { CompanyService } from '@core/services/company.service';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee } from '@features/employees/models/employee.model';
import {
  MonthlyLock,
  MonthlyLockDocument,
} from '@features/payroll/models/monthly-lock.model';
import { PayrollRecord } from '@features/payroll/models/compensation.model';
import { getPreviousYearMonthKey } from '@features/payroll/utils/compensation.utils';
import {
  canLockPayrollMonthSequentially,
  isMonthlyLockDocumentLocked,
  listYearMonthsBetweenIsoDates,
  MONTHLY_LOCK_ERROR_MESSAGE,
  PREVIOUS_MONTH_NOT_LOCKED_MESSAGE,
  validatePayrollMonthReadyForLock,
} from '@features/payroll/utils/monthly-lock.utils';
import {
  isValidYearMonthKey,
  normalizeYearMonthKey,
  resolveSystemOperationMonthFromLatestLock,
  SystemOperationMonthFallbackOptions,
} from '@features/payroll/utils/system-operation-month.utils';
import { getCurrentYearMonthKey } from '@features/payroll/utils/compensation.utils';
import { catchError, defer, distinctUntilChanged, map, Observable, of, switchMap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MonthlyLockService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly companyService = inject(CompanyService);
  private readonly lockCache = new Map<string, boolean>();
  private latestLockedMonthCache: string | null | undefined;

  async getLatestLockedMonth(): Promise<string | null> {
    if (this.latestLockedMonthCache !== undefined) {
      return this.latestLockedMonthCache;
    }

    const user = await requireAuthenticatedUser(this.auth);
    const locksRef = collection(
      this.firestore,
      FirestoreCollections.companies,
      user.uid,
      FirestoreCollections.monthlyLocks
    );
    const snapshot = await getDocs(locksRef);

    let latest: string | null = null;

    for (const docSnap of snapshot.docs) {
      if (!isMonthlyLockDocumentLocked(docSnap.data())) {
        continue;
      }

      const data = docSnap.data() as MonthlyLockDocument;

      const month = normalizeYearMonthKey(data.targetMonth ?? docSnap.id);
      if (!month) {
        continue;
      }

      if (!latest || month > latest) {
        latest = month;
      }
    }

    this.latestLockedMonthCache = latest;
    return latest;
  }

  /** 最新確定月の翌月をシステム運用月として返す */
  async resolveSystemOperationMonth(
    fallback: SystemOperationMonthFallbackOptions = {}
  ): Promise<string> {
    const latestLockedMonth = await this.getLatestLockedMonth();
    return resolveSystemOperationMonthFromLatestLock(latestLockedMonth, {
      calendarMonth: getCurrentYearMonthKey(),
      ...fallback,
    });
  }

  async getMonthlyLock(targetMonth: string): Promise<MonthlyLock | null> {
    const monthKey = this.resolveLockMonthKey(targetMonth);
    const user = await requireAuthenticatedUser(this.auth);
    const snapshot = await getDoc(this.monthlyLockRef(user.uid, monthKey));

    if (!snapshot.exists() || !isMonthlyLockDocumentLocked(snapshot.data())) {
      return null;
    }

    return this.toMonthlyLock(snapshot.data() as MonthlyLockDocument, monthKey);
  }

  async isMonthLocked(targetMonth: string): Promise<boolean> {
    const monthKey = this.resolveLockMonthKey(targetMonth);
    if (!isValidYearMonthKey(monthKey)) {
      return false;
    }

    const cached = this.lockCache.get(monthKey);
    if (cached !== undefined) {
      return cached;
    }

    const lock = await this.getMonthlyLock(monthKey);
    const locked = lock?.isLocked === true;
    this.lockCache.set(monthKey, locked);
    return locked;
  }

  /** Firestore の monthlyLocks をリアルタイム監視する */
  watchMonthLocked(targetMonth: string): Observable<boolean> {
    const monthKey = this.resolveLockMonthKey(targetMonth);
    this.invalidateMonthLockCache(monthKey);

    return defer(() => requireAuthenticatedUser(this.auth)).pipe(
      switchMap((user) =>
        docSnapshots(this.monthlyLockRef(user.uid, monthKey)).pipe(
          map((snapshot) => {
            const locked =
              snapshot.exists() && isMonthlyLockDocumentLocked(snapshot.data());
            this.lockCache.set(monthKey, locked);
            return locked;
          }),
          distinctUntilChanged(),
          catchError(() => {
            this.lockCache.set(monthKey, false);
            return of(false);
          })
        )
      )
    );
  }

  invalidateMonthLockCache(targetMonth: string): void {
    this.lockCache.delete(this.resolveLockMonthKey(targetMonth));
  }

  rememberMonthLocked(targetMonth: string, locked: boolean): void {
    const monthKey = this.resolveLockMonthKey(targetMonth);
    this.lockCache.set(monthKey, locked);

    if (locked) {
      this.latestLockedMonthCache =
        !this.latestLockedMonthCache || monthKey > this.latestLockedMonthCache
          ? monthKey
          : this.latestLockedMonthCache;
      return;
    }

    this.latestLockedMonthCache = undefined;
  }

  /** 期間内（両端含む）に確定済み月が1つでもあれば true */
  async hasLockedMonthInDateRange(startDate: string, endDate: string): Promise<boolean> {
    const months = listYearMonthsBetweenIsoDates(startDate, endDate);
    if (months.length === 0) {
      return false;
    }

    const results = await Promise.all(months.map((month) => this.isMonthLocked(month)));
    return results.some(Boolean);
  }

  clearLockCache(): void {
    this.lockCache.clear();
    this.latestLockedMonthCache = undefined;
  }

  resetState(): void {
    this.clearLockCache();
  }

  async assertMonthEditable(targetMonth: string): Promise<void> {
    if (await this.isMonthLocked(targetMonth)) {
      throw new Error(MONTHLY_LOCK_ERROR_MESSAGE);
    }
  }

  async lockPayrollMonth(
    targetMonth: string,
    employees: Employee[],
    payrollRecord: PayrollRecord | null
  ): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);
    const normalizedTargetMonth = this.resolveLockMonthKey(targetMonth);
    const existing = await this.getMonthlyLock(normalizedTargetMonth);

    if (existing?.isLocked) {
      throw new Error('この月はすでに確定済みです');
    }

    const validation = validatePayrollMonthReadyForLock(
      employees,
      normalizedTargetMonth,
      payrollRecord
    );
    if (!validation.ok) {
      const numbers = validation.unsavedEmployeeNumbers.join(', ');
      throw new Error(
        `未保存の従業員がいます（社員番号: ${numbers}）。全員分を保存してから確定してください。`
      );
    }

    const company = await this.companyService.getCompanyForCurrentUser();
    const previousMonth = getPreviousYearMonthKey(normalizedTargetMonth);
    const [previousMonthLocked, latestLockedMonth] = await Promise.all([
      this.isMonthLocked(previousMonth),
      this.getLatestLockedMonth(),
    ]);

    if (
      !canLockPayrollMonthSequentially({
        targetMonth: normalizedTargetMonth,
        previousMonthLocked,
        systemStartDate: normalizeYearMonthKey(company?.systemStartDate),
        latestLockedMonth: normalizeYearMonthKey(latestLockedMonth),
      })
    ) {
      throw new Error(PREVIOUS_MONTH_NOT_LOCKED_MESSAGE.replace(/^※/, ''));
    }

    try {
      await setDoc(
        this.monthlyLockRef(user.uid, normalizedTargetMonth),
        {
          isLocked: true,
          lockedAt: serverTimestamp(),
        },
        { merge: true }
      );
      this.rememberMonthLocked(normalizedTargetMonth, true);
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '月次確定に失敗しました'));
    }
  }

  private resolveLockMonthKey(targetMonth: string): string {
    return normalizeYearMonthKey(targetMonth) ?? targetMonth.trim();
  }

  private monthlyLockRef(ownerUid: string, targetMonth: string) {
    return doc(
      this.firestore,
      FirestoreCollections.companies,
      ownerUid,
      FirestoreCollections.monthlyLocks,
      targetMonth
    );
  }

  private toMonthlyLock(data: MonthlyLockDocument, targetMonth: string): MonthlyLock {
    if (!isMonthlyLockDocumentLocked(data)) {
      return {
        targetMonth,
        isLocked: false,
        lockedAt: null,
        lockedBy: '',
      };
    }

    const lockedAtRaw = data.lockedAt;
    let lockedAt: string | null = null;

    if (typeof lockedAtRaw === 'string') {
      lockedAt = lockedAtRaw;
    } else if (
      lockedAtRaw &&
      typeof lockedAtRaw === 'object' &&
      'toDate' in lockedAtRaw &&
      typeof (lockedAtRaw as { toDate: () => Date }).toDate === 'function'
    ) {
      lockedAt = (lockedAtRaw as { toDate: () => Date }).toDate().toISOString();
    }

    return {
      targetMonth: data.targetMonth ?? targetMonth,
      isLocked: data.isLocked === true,
      lockedAt,
      lockedBy: data.lockedBy ?? '',
    };
  }
}
