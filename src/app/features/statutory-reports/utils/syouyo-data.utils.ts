import { Employee } from '@features/employees/models/employee.model';
import { BonusHistoryEntry } from '@features/payroll/models/bonus-history.model';
import {
  findBonusHistoryForPaymentDate,
  normalizeBonusPaymentDate,
} from '@features/payroll/utils/bonus-history.utils';
import { SyouyoData } from '@features/statutory-reports/models/egov-export.model';

function parsePaymentDateLocal(paymentDate: string): Date {
  const normalized = normalizeBonusPaymentDate(paymentDate);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) {
    throw new Error(`賞与支払日の形式が不正です: ${paymentDate}`);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** 賞与支払届のデフォルト支給日（従業員の最新賞与履歴、なければ当日） */
export function resolveDefaultSyouyoPaymentDate(
  employees: Employee[],
  referenceDate = new Date()
): string {
  let latest = '';

  for (const employee of employees) {
    for (const entry of employee.bonusHistory ?? []) {
      const paymentDate = normalizeBonusPaymentDate(entry.paymentDate);
      if (paymentDate && paymentDate > latest) {
        latest = paymentDate;
      }
    }
  }

  if (latest) {
    return latest;
  }

  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildSyouyoDataFromBonusEntry(entry: BonusHistoryEntry): SyouyoData {
  const currencyAmount = Math.max(0, Math.round(entry.bonusAmount));
  const kindAmount = 0;
  const totalAmount = currencyAmount + kindAmount;

  return {
    paymentDate: parsePaymentDateLocal(entry.paymentDate),
    currencyAmount,
    kindAmount,
    totalAmount,
  };
}

export function buildSyouyoDataFromEmployeeBonusHistory(
  employee: Employee,
  paymentDate: string
): SyouyoData | null {
  const entry = findBonusHistoryForPaymentDate(employee.bonusHistory, paymentDate);
  if (!entry) {
    return null;
  }

  return buildSyouyoDataFromBonusEntry(entry);
}

export function hasEmployeeBonusForPaymentDate(employee: Employee, paymentDate: string): boolean {
  return findBonusHistoryForPaymentDate(employee.bonusHistory, paymentDate) != null;
}
