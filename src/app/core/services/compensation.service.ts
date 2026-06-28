import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { doc, Firestore, getDoc, serverTimestamp, setDoc, writeBatch } from '@angular/fire/firestore';
import { FirestoreCollections } from '@core/models/firestore-collections';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import {
  CompensationEntry,
  CompensationRecord,
  CompensationType,
  PayrollEntry,
  PayrollRecord,
} from '@features/payroll/models/compensation.model';
import { normalizePayrollAdjustmentType } from '@features/payroll/models/payroll-adjustment.model';
import {
  calculatePayrollEntryTotalPayment,
  calculatePayrollDisplayTotal,
} from '@features/payroll/utils/compensation.utils';
import {
  calculateBonusEntryAmount,
  calculateStandardBonusAmount,
  findBonusEntryIndex,
} from '@features/payroll/utils/bonus-insurance.utils';
import {
  isMonthlyLockDocumentLocked,
  MONTHLY_LOCK_ERROR_MESSAGE,
} from '@features/payroll/utils/monthly-lock.utils';

interface PayrollDocument {
  targetMonth: string;
  entries: PayrollEntry[];
  updatedAt?: unknown;
}

interface CompensationDocument {
  targetMonth: string;
  paymentDate?: string;
  entries: CompensationEntry[];
  updatedAt?: unknown;
}

@Injectable({ providedIn: 'root' })
export class CompensationService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);

  async getPayrollRecordsForMonths(targetMonths: string[]): Promise<PayrollRecord[]> {
    const uniqueMonths = [...new Set(targetMonths)];
    const records = await Promise.all(uniqueMonths.map((month) => this.getPayrollRecord(month)));
    return records.filter((record): record is PayrollRecord => record != null);
  }

  async getPayrollRecord(targetMonth: string): Promise<PayrollRecord | null> {
    const user = await requireAuthenticatedUser(this.auth);
    const snapshot = await getDoc(this.payrollRef(user.uid, targetMonth));

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data() as PayrollDocument;

    return {
      targetMonth: data.targetMonth,
      entries: (data.entries ?? []).map((entry) => this.normalizePayrollEntry(entry)),
    };
  }

  async upsertPayrollEntry(targetMonth: string, entry: PayrollEntry): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);
    await this.assertMonthUnlocked(user.uid, targetMonth);

    if (entry.registrationLocked) {
      throw new Error('初期登録データは編集できません');
    }

    try {
      const existing = await this.getPayrollRecord(targetMonth);
      const entries = existing?.entries ?? [];
      const savedEntry = this.normalizePayrollEntry({ ...entry, locked: true });
      const index = entries.findIndex((row) => row.employeeId === entry.employeeId);

      if (index >= 0) {
        if (entries[index].registrationLocked) {
          throw new Error('初期登録データは編集できません');
        }
        entries[index] = savedEntry;
      } else {
        entries.push(savedEntry);
      }

      await setDoc(this.payrollRef(user.uid, targetMonth), {
        targetMonth,
        entries,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '保存に失敗しました'));
    }
  }

  /** 複数月の給与エントリを locked で一括保存（Batch Write） */
  async importLockedPayrollEntries(entriesByMonth: ReadonlyMap<string, PayrollEntry>): Promise<void> {
    if (entriesByMonth.size === 0) {
      return;
    }

    const user = await requireAuthenticatedUser(this.auth);
    const months = [...entriesByMonth.keys()].sort((left, right) => left.localeCompare(right));

    try {
      const existingRecords = await this.getPayrollRecordsForMonths(months);
      const existingByMonth = new Map(existingRecords.map((record) => [record.targetMonth, record]));

      const batches: ReturnType<typeof writeBatch>[] = [];
      let batch = writeBatch(this.firestore);
      let operationCount = 0;

      for (const month of months) {
        const entry = entriesByMonth.get(month);
        if (!entry) {
          continue;
        }

        const savedEntry = this.normalizePayrollEntry({ ...entry, locked: true });
        const existing = existingByMonth.get(month);
        const entries = [...(existing?.entries ?? [])];
        const index = entries.findIndex((row) => row.employeeId === savedEntry.employeeId);

        if (index >= 0) {
          entries[index] = savedEntry;
        } else {
          entries.push(savedEntry);
        }

        batch.set(this.payrollRef(user.uid, month), {
          targetMonth: month,
          entries,
          updatedAt: serverTimestamp(),
        });
        operationCount += 1;

        if (operationCount >= 500) {
          batches.push(batch);
          batch = writeBatch(this.firestore);
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        batches.push(batch);
      }

      await Promise.all(batches.map((currentBatch) => currentBatch.commit()));
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '給与履歴の一括保存に失敗しました'));
    }
  }

  async getBonusRecordsForMonths(targetMonths: string[]): Promise<CompensationRecord[]> {
    const uniqueMonths = [...new Set(targetMonths)];
    const records = await Promise.all(uniqueMonths.map((month) => this.getRecord('bonus', month)));
    return records.filter((record): record is CompensationRecord => record != null);
  }

  async getRecord(
    type: CompensationType,
    targetMonth: string
  ): Promise<CompensationRecord | null> {
    if (type === 'payroll') {
      return null;
    }

    const user = await requireAuthenticatedUser(this.auth);
    const snapshot = await getDoc(this.bonusRef(user.uid, targetMonth));

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data() as CompensationDocument;

    return {
      targetMonth: data.targetMonth,
      paymentDate: this.normalizePaymentDate(data.paymentDate),
      entries: (data.entries ?? []).map((entry) => this.normalizeCompensationEntry(entry)),
    };
  }

  async upsertBonusEntry(
    targetMonth: string,
    entry: CompensationEntry,
    paymentDate: string
  ): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);
    await this.assertMonthUnlocked(user.uid, targetMonth);

    try {
      const existing = await this.getRecord('bonus', targetMonth);
      const entries = existing?.entries ?? [];
      const normalizedPaymentDate = this.normalizePaymentDate(paymentDate);
      const savedEntry = this.normalizeCompensationEntry({
        ...entry,
        locked: true,
        paymentDate: normalizedPaymentDate,
      });
      const index = findBonusEntryIndex(entries, entry.employeeId, normalizedPaymentDate);

      if (index >= 0) {
        entries[index] = savedEntry;
      } else {
        entries.push(savedEntry);
      }

      await setDoc(this.bonusRef(user.uid, targetMonth), {
        targetMonth,
        paymentDate: normalizedPaymentDate,
        entries,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '保存に失敗しました'));
    }
  }

  /** @deprecated upsertBonusEntry を使用してください */
  async saveRecord(type: CompensationType, record: CompensationRecord): Promise<void> {
    if (type === 'payroll') {
      return;
    }

    const user = await requireAuthenticatedUser(this.auth);

    try {
      await setDoc(this.bonusRef(user.uid, record.targetMonth), {
        targetMonth: record.targetMonth,
        paymentDate: this.normalizePaymentDate(record.paymentDate),
        entries: record.entries.map((entry) => this.normalizeCompensationEntry(entry)),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '保存に失敗しました'));
    }
  }

  private normalizeCompensationEntry(entry: CompensationEntry): CompensationEntry {
    const fixedWages = Number(entry.fixedWages ?? 0);
    const nonFixedWages = Number(entry.nonFixedWages ?? 0);
    const bonusAmount = entry.bonusAmount ?? calculateBonusEntryAmount(fixedWages, nonFixedWages);
    const standardBonusAmount =
      entry.standardBonusAmount ?? calculateStandardBonusAmount(bonusAmount);

    return {
      employeeId: String(entry.employeeId ?? ''),
      employeeNumber: String(entry.employeeNumber ?? ''),
      employeeName: String(entry.employeeName ?? ''),
      fixedWages,
      nonFixedWages,
      locked: Boolean(entry.locked),
      bonusAmount,
      standardBonusAmount,
      fixedWagesAtPayment: Number(entry.fixedWagesAtPayment ?? 0),
      paymentDate: this.normalizePaymentDate(entry.paymentDate),
      savedAt: entry.savedAt ?? new Date().toISOString(),
    };
  }

  private normalizePaymentDate(value: unknown): string {
    const trimmed = String(value ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
  }

  private normalizePayrollEntry(entry: PayrollEntry): PayrollEntry {
    const adjustmentAmount = Number(entry.adjustmentAmount ?? 0);
    const adjustmentType =
      adjustmentAmount !== 0 ? normalizePayrollAdjustmentType(entry.adjustmentType) : null;
    const adjustmentTargetMonth = String(entry.adjustmentTargetMonth ?? '').trim();
    const totalPayment =
      entry.totalPayment ??
      calculatePayrollDisplayTotal(
        entry.baseSalary,
        entry.allowances ?? [],
        entry.nonFixedWages ?? 0,
        adjustmentAmount
      );

    return {
      employeeId: String(entry.employeeId ?? ''),
      employeeNumber: String(entry.employeeNumber ?? ''),
      employeeName: String(entry.employeeName ?? ''),
      baseSalary: Number(entry.baseSalary ?? 0),
      allowances: (entry.allowances ?? []).map((row) => ({
        name: String(row.name ?? ''),
        amount: Number(row.amount ?? 0),
      })),
      nonFixedWages: Number(entry.nonFixedWages ?? 0),
      baseDays: Number(entry.baseDays ?? 0),
      adjustmentAmount,
      adjustmentType,
      adjustmentTargetMonth,
      totalPayment,
      locked: Boolean(entry.locked),
      registrationLocked: Boolean(entry.registrationLocked),
    };
  }

  private payrollRef(ownerUid: string, targetMonth: string) {
    return doc(
      this.firestore,
      FirestoreCollections.companies,
      ownerUid,
      FirestoreCollections.payrolls,
      targetMonth
    );
  }

  private bonusRef(ownerUid: string, targetMonth: string) {
    return doc(
      this.firestore,
      FirestoreCollections.companies,
      ownerUid,
      FirestoreCollections.bonuses,
      targetMonth
    );
  }

  private async assertMonthUnlocked(ownerUid: string, targetMonth: string): Promise<void> {
    const snapshot = await getDoc(
      doc(
        this.firestore,
        FirestoreCollections.companies,
        ownerUid,
        FirestoreCollections.monthlyLocks,
        targetMonth
      )
    );

    if (snapshot.exists() && isMonthlyLockDocumentLocked(snapshot.data())) {
      throw new Error(MONTHLY_LOCK_ERROR_MESSAGE);
    }
  }
}
