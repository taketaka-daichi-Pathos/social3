import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { doc, Firestore, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
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
import {
  calculatePayrollEntryTotalPayment,
} from '@features/payroll/utils/compensation.utils';

interface PayrollDocument {
  targetMonth: string;
  entries: PayrollEntry[];
  updatedAt?: unknown;
}

interface CompensationDocument {
  targetMonth: string;
  locked: boolean;
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

    try {
      const existing = await this.getPayrollRecord(targetMonth);
      const entries = existing?.entries ?? [];
      const savedEntry: PayrollEntry = { ...entry, locked: true };
      const index = entries.findIndex((row) => row.employeeId === entry.employeeId);

      if (index >= 0) {
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
      locked: Boolean(data.locked),
      entries: (data.entries ?? []).map((entry) => ({
        employeeId: String(entry.employeeId ?? ''),
        employeeNumber: String(entry.employeeNumber ?? ''),
        employeeName: String(entry.employeeName ?? ''),
        fixedWages: Number(entry.fixedWages ?? 0),
        nonFixedWages: Number(entry.nonFixedWages ?? 0),
        locked: Boolean(entry.locked),
      })),
    };
  }

  async saveRecord(type: CompensationType, record: CompensationRecord): Promise<void> {
    if (type === 'payroll') {
      return;
    }

    const user = await requireAuthenticatedUser(this.auth);

    try {
      await setDoc(this.bonusRef(user.uid, record.targetMonth), {
        targetMonth: record.targetMonth,
        locked: true,
        entries: record.entries,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '保存に失敗しました'));
    }
  }

  private normalizePayrollEntry(entry: PayrollEntry): PayrollEntry {
    const totalPayment =
      entry.totalPayment ??
      calculatePayrollEntryTotalPayment(
        entry.baseSalary,
        entry.allowances ?? [],
        entry.nonFixedWages ?? 0
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
      totalPayment,
      locked: Boolean(entry.locked),
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
}
