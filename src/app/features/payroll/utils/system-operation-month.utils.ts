import {
  extractYearMonthKey,
  getCurrentYearMonthKey,
  getNextYearMonthKey,
  parseYearMonthKey,
} from '@features/payroll/utils/compensation.utils';

const YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/;
const YEAR_SLASH_MONTH_PATTERN = /^(\d{4})\/(\d{1,2})$/;

export interface SystemOperationMonthFallbackOptions {
  /** 会社のシステム利用開始月（YYYY-MM） */
  systemStartDate?: string | null;
  /** カレンダー上の当月（YYYY-MM）。省略時は実行日の年月 */
  calendarMonth?: string;
}

/** YYYY-MM / YYYY/MM / YYYY-MM-DD 等を YYYY-MM に正規化する */
export function normalizeYearMonthKey(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const slashMatch = YEAR_SLASH_MONTH_PATTERN.exec(trimmed);
  if (slashMatch) {
    const month = Number(slashMatch[2]);
    if (month >= 1 && month <= 12) {
      const normalized = `${slashMatch[1]}-${String(month).padStart(2, '0')}`;
      return isValidYearMonthKey(normalized) ? normalized : null;
    }
  }

  const extracted = extractYearMonthKey(trimmed);
  if (!extracted || !isValidYearMonthKey(extracted)) {
    return null;
  }

  return extracted;
}

export function isValidYearMonthKey(value: string | null | undefined): value is string {
  if (!value?.trim()) {
    return false;
  }

  const normalized = value.trim();
  if (!YEAR_MONTH_PATTERN.test(normalized)) {
    return false;
  }

  const { month } = parseYearMonthKey(normalized);
  return month >= 1 && month <= 12;
}

/** YYYY-MM を従業員一覧の在籍判定等に使う参照日（月初）へ変換 */
export function yearMonthKeyToReferenceDate(yearMonth: string): Date {
  const { year, month } = parseYearMonthKey(yearMonth);
  return new Date(year, month - 1, 1);
}

/**
 * 最新確定月の翌月をシステム運用月とする。
 * 確定済み月がない場合はフォールバック（利用開始月 → カレンダー当月）を返す。
 */
export function resolveSystemOperationMonthFromLatestLock(
  latestLockedMonth: string | null,
  fallback: SystemOperationMonthFallbackOptions = {}
): string {
  if (latestLockedMonth && isValidYearMonthKey(latestLockedMonth)) {
    return getNextYearMonthKey(latestLockedMonth.trim());
  }

  const systemStart = fallback.systemStartDate?.trim();
  if (isValidYearMonthKey(systemStart)) {
    return systemStart;
  }

  const calendarMonth = fallback.calendarMonth?.trim();
  if (isValidYearMonthKey(calendarMonth)) {
    return calendarMonth;
  }

  return getCurrentYearMonthKey();
}

/** 料率履歴が確定済み月以前に適用されているか（編集・削除ロック判定用） */
export function isInsuranceRateHistoryLocked(
  applicableMonth: string,
  latestLockedMonth: string | null
): boolean {
  if (!latestLockedMonth || !isValidYearMonthKey(latestLockedMonth)) {
    return false;
  }

  const normalizedApplicable = applicableMonth.trim();
  if (!isValidYearMonthKey(normalizedApplicable)) {
    return false;
  }

  return normalizedApplicable <= latestLockedMonth.trim();
}
