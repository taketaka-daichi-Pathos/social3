import { Employee } from '@features/employees/models/employee.model';
import {
  compareYearMonths,
  toYearMonthKey,
} from '@features/payroll/utils/compensation.utils';

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 退職日（resignationDate） */
export function resolveRetirementDate(employee: Employee): string | null {
  return employee.resignationDate?.trim() || null;
}

export function isRetiredEmployee(employee: Employee): boolean {
  return employee.status === 'retired' || Boolean(resolveRetirementDate(employee));
}

export function isLastDayOfMonth(dateStr: string): boolean {
  const date = parseLocalDate(dateStr);
  if (!date) {
    return false;
  }

  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() === lastDay;
}

/** 退職月の健保・介護・厚年を免除するか（月中退職のみ） */
export function isSocialInsuranceExemptForRetirementMonth(
  employee: Employee,
  targetYearMonth: string
): boolean {
  const retirementDate = resolveRetirementDate(employee);
  if (!retirementDate) {
    return false;
  }

  const retirementMonth = toYearMonthKey(retirementDate);
  if (!retirementMonth || compareYearMonths(targetYearMonth, retirementMonth) !== 0) {
    return false;
  }

  return !isLastDayOfMonth(retirementDate);
}

/** 対象日が退職日より後か（YYYY-MM-DD 同士の辞書順比較） */
export function isAfterRetirementDate(employee: Employee, dateStr: string): boolean {
  const retirementDate = resolveRetirementDate(employee);
  const normalizedDate = dateStr.trim();

  if (!retirementDate || !normalizedDate) {
    return false;
  }

  return normalizedDate > retirementDate;
}

/** 対象月が退職月より後か */
export function isAfterRetirementMonth(employee: Employee, targetYearMonth: string): boolean {
  const retirementDate = resolveRetirementDate(employee);
  if (!retirementDate) {
    return false;
  }

  const retirementMonth = toYearMonthKey(retirementDate);
  if (!retirementMonth) {
    return false;
  }

  return compareYearMonths(targetYearMonth, retirementMonth) > 0;
}

export function retirementReasonLabel(reason: string | null | undefined): string {
  const trimmed = reason?.trim();
  return trimmed || '—';
}

export function isRetiredExportCandidate(employee: Employee): boolean {
  return employee.status === 'retired' && Boolean(employee.resignationDate?.trim());
}

/** DatePipe 用に YYYY-MM-DD 退職日をローカル日付へ変換する */
export function toRetirementDisplayDate(value: string | null | undefined): Date | null {
  const trimmed = value?.trim() ?? '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}
