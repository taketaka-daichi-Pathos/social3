import { Employee } from '@features/employees/models/employee.model';
import { PayrollRecord } from '@features/payroll/models/compensation.model';
import {
  compareYearMonths,
  filterEmployeesForTargetMonth,
  getNextYearMonthKey,
  getPreviousYearMonthKey,
  resolvePayrollEntryForMonth,
  toYearMonthKey,
} from '@features/payroll/utils/compensation.utils';
import {
  isValidYearMonthKey,
  normalizeYearMonthKey,
  resolveSystemOperationMonthFromLatestLock,
} from '@features/payroll/utils/system-operation-month.utils';

export interface PayrollMonthLockValidation {
  ok: boolean;
  unsavedEmployeeNumbers: string[];
}

/** 対象月の全表示従業員が給与保存済み（locked）か検証する */
export function validatePayrollMonthReadyForLock(
  employees: Employee[],
  targetMonth: string,
  payrollRecord: PayrollRecord | null
): PayrollMonthLockValidation {
  const visibleEmployees = filterEmployeesForTargetMonth(employees, targetMonth);
  const unsavedEmployeeNumbers: string[] = [];

  for (const employee of visibleEmployees) {
    const entry = resolvePayrollEntryForMonth(employee, targetMonth, payrollRecord);
    if (!entry?.locked) {
      unsavedEmployeeNumbers.push(employee.employeeNumber);
    }
  }

  return {
    ok: unsavedEmployeeNumbers.length === 0,
    unsavedEmployeeNumbers,
  };
}

/** monthlyLocks ドキュメントが確定済みか（給与詳細フィールドの有無は無視） */
export function isMonthlyLockDocumentLocked(data: unknown): boolean {
  if (data == null || typeof data !== 'object') {
    return false;
  }

  return (data as Record<string, unknown>)['isLocked'] === true;
}

export const MONTHLY_LOCK_ERROR_MESSAGE = 'この月は確定済みのため編集できません';

export const PREVIOUS_MONTH_NOT_LOCKED_MESSAGE =
  '※前月の給与計算が確定されていないため、この月を確定できません';

/** 前月未確定時に給与・賞与の保存を禁止するUIメッセージ */
export const PREVIOUS_MONTH_NOT_LOCKED_COMPENSATION_SAVE_MESSAGE =
  '※前月の作業が確定されていないため、この月の給与・賞与データの入力および保存はできません。先に前月の確定処理を行ってください。';

/** システム利用開始月より前の月次給与タブ向けアラートメッセージ */
export const PRE_SYSTEM_START_HISTORY_COMPENSATION_MESSAGE =
  '※この月はシステム利用開始前のため、過去履歴データとして表示されています。給与データの編集および確定処理はできません。';

/** 保存ガード発火時のトースト等に表示する短文 */
export const PREVIOUS_MONTH_NOT_LOCKED_COMPENSATION_SAVE_GUARD_MESSAGE =
  '前月の作業を確定させてから保存してください';

export interface CompensationSaveLockOptions {
  targetMonth: string;
  previousMonthLocked: boolean | null;
  systemStartDate?: string | null;
  companySettingsLoaded?: boolean;
}

/** 対象月の給与・賞与を保存できるか（前月の月次確定を考慮） */
export function canSaveCompensationForTargetMonth(
  options: CompensationSaveLockOptions
): boolean {
  if (options.companySettingsLoaded === false) {
    return false;
  }

  const normalizedTarget =
    normalizeYearMonthKey(options.targetMonth) ?? options.targetMonth.trim();
  if (!normalizedTarget) {
    return false;
  }

  if (isSystemStartMonth(normalizedTarget, options.systemStartDate)) {
    return true;
  }

  if (options.previousMonthLocked === null) {
    return false;
  }

  return options.previousMonthLocked;
}

/** 前月未確定による保存禁止警告を表示するか */
export function shouldShowPreviousMonthNotLockedCompensationSaveWarning(
  options: CompensationSaveLockOptions
): boolean {
  if (options.companySettingsLoaded === false || options.previousMonthLocked === null) {
    return false;
  }

  return !canSaveCompensationForTargetMonth(options);
}

export interface PayrollMonthSequentialLockOptions {
  targetMonth: string;
  previousMonthLocked: boolean;
  systemStartDate?: string | null;
  latestLockedMonth?: string | null;
}

/** 対象月がシステム利用開始月か（正規化済み YYYY-MM で比較） */
export function isSystemStartMonth(
  targetMonth: string,
  systemStartDate?: string | null
): boolean {
  const normalizedTarget = normalizeYearMonthKey(targetMonth);
  const normalizedStart = normalizeYearMonthKey(systemStartDate);
  return (
    normalizedTarget != null &&
    normalizedStart != null &&
    normalizedTarget === normalizedStart
  );
}

/** 対象月がシステム利用開始月より前か（正規化済み YYYY-MM で比較） */
export function isBeforeSystemStartMonth(
  targetMonth: string,
  systemStartDate?: string | null
): boolean {
  const normalizedTarget = normalizeYearMonthKey(targetMonth);
  const normalizedStart = normalizeYearMonthKey(systemStartDate);

  if (!normalizedTarget || !normalizedStart) {
    return false;
  }

  return compareYearMonths(normalizedTarget, normalizedStart) < 0;
}

/** 前月確定チェックを省略してよい月か（利用開始月・初回確定月など） */
export function isExemptFromPreviousMonthLockRequirement(
  targetMonth: string,
  systemStartDate?: string | null,
  latestLockedMonth?: string | null
): boolean {
  const normalizedTarget = normalizeYearMonthKey(targetMonth);
  if (!normalizedTarget) {
    return false;
  }

  const normalizedStart = normalizeYearMonthKey(systemStartDate);
  if (normalizedStart && normalizedTarget === normalizedStart) {
    return true;
  }

  if (normalizedStart) {
    const previousMonth = getPreviousYearMonthKey(normalizedTarget);
    if (compareYearMonths(previousMonth, normalizedStart) < 0) {
      return true;
    }
  }

  const normalizedLatestLocked = normalizeYearMonthKey(latestLockedMonth);
  const firstLockMonth = resolveSystemOperationMonthFromLatestLock(normalizedLatestLocked, {
    systemStartDate: normalizedStart,
  });

  if (
    !normalizedLatestLocked &&
    isValidYearMonthKey(firstLockMonth) &&
    normalizedTarget === firstLockMonth
  ) {
    return true;
  }

  return false;
}

/** 対象月を月次確定できるか（前月の確定順序を考慮） */
export function canLockPayrollMonthSequentially(
  options: PayrollMonthSequentialLockOptions
): boolean {
  const normalizedTarget = normalizeYearMonthKey(options.targetMonth) ?? options.targetMonth.trim();
  const normalizedStart = normalizeYearMonthKey(options.systemStartDate);

  if (normalizedStart && normalizedTarget === normalizedStart) {
    return true;
  }

  if (
    isExemptFromPreviousMonthLockRequirement(
      normalizedTarget,
      normalizedStart,
      normalizeYearMonthKey(options.latestLockedMonth)
    )
  ) {
    return true;
  }

  return options.previousMonthLocked;
}

export const LOCKED_MONTH_ERROR = 'lockedMonth';
export const LEAVE_PERIOD_HAS_LOCKED_MONTH_ERROR = 'leavePeriodHasLockedMonth';

export const HIRE_DATE_LOCKED_MONTH_MESSAGE =
  '※この月は月次処理が確定済みのため、入社処理を行えません。';
export const RETIREMENT_DATE_LOCKED_MONTH_MESSAGE =
  '※この月は確定済みのため、退職日として設定できません。';
export const LEAVE_PERIOD_LOCKED_MONTH_MESSAGE =
  '※指定された期間に『月次処理が確定済みの月』が含まれているため、新しく休業を登録（または変更）することはできません。';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD の開始日〜終了日（両端含む）に属する YYYY-MM 一覧を返す */
export function listYearMonthsBetweenIsoDates(startDate: string, endDate: string): string[] {
  const start = startDate.trim();
  const end = endDate.trim();

  if (!ISO_DATE_PATTERN.test(start) || !ISO_DATE_PATTERN.test(end) || start > end) {
    return [];
  }

  const startMonth = toYearMonthKey(start);
  const endMonth = toYearMonthKey(end);

  if (!startMonth || !endMonth || startMonth > endMonth) {
    return [];
  }

  const months: string[] = [];
  let current = startMonth;

  while (current <= endMonth) {
    months.push(current);
    current = getNextYearMonthKey(current);
  }

  return months;
}
