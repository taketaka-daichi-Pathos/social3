import {
  EmployeeRegistrationType,
  PayrollHistoryRow,
} from '@features/onboarding/models/employee-registration.model';
import { isValidIsoDate } from '@core/utils/text-normalize.utils';
import {
  compareYearMonths,
  formatTargetMonthLabel,
  getPreviousYearMonthKey,
  toYearMonthKey,
} from '@features/payroll/utils/compensation.utils';

/** 既存社員登録時に参照する直近履歴の最大月数 */
export const EXISTING_EMPLOYEE_HISTORY_MONTH_COUNT = 6;

export const REGISTRATION_TYPE_MISMATCH_EXISTING_ERROR = 'registrationTypeMismatchExisting';
export const REGISTRATION_TYPE_MISMATCH_NEW_ERROR = 'registrationTypeMismatchNew';

const MIN_HIRE_YEAR = 1900;

/** 入社日として分岐処理に使える有効な日付か（入力途中の不正値を除外） */
export function isResolvableHireDateForRegistration(hireDate: string): boolean {
  const normalized = hireDate.trim();
  if (!isValidIsoDate(normalized)) {
    return false;
  }

  const year = Number(normalized.slice(0, 4));
  return Number.isFinite(year) && year >= MIN_HIRE_YEAR;
}

/** 登録種別と入社日・利用開始日の整合性チェック */
export function resolveRegistrationTypeMismatchError(
  registrationType: EmployeeRegistrationType,
  hireDate: string,
  systemStartDate: string
): typeof REGISTRATION_TYPE_MISMATCH_EXISTING_ERROR | typeof REGISTRATION_TYPE_MISMATCH_NEW_ERROR | null {
  if (!isResolvableHireDateForRegistration(hireDate)) {
    return null;
  }

  const hireMonth = toYearMonthKey(hireDate);
  const systemStartMonth = systemStartDate.trim();

  if (!hireMonth || !/^\d{4}-\d{2}$/.test(systemStartMonth)) {
    return null;
  }

  const isHireOnOrAfterSystemStart = compareYearMonths(hireMonth, systemStartMonth) >= 0;

  if (registrationType === 'existing' && isHireOnOrAfterSystemStart) {
    return REGISTRATION_TYPE_MISMATCH_EXISTING_ERROR;
  }

  if (registrationType === 'new' && !isHireOnOrAfterSystemStart) {
    return REGISTRATION_TYPE_MISMATCH_NEW_ERROR;
  }

  return null;
}

/** 既存社員の給与履歴入力終了月（利用開始月の前月） */
export function resolveExistingEmployeeHistoryEndMonth(systemStartDate: string): string | null {
  const systemStartMonth = systemStartDate.trim();
  if (!/^\d{4}-\d{2}$/.test(systemStartMonth)) {
    return null;
  }

  return getPreviousYearMonthKey(systemStartMonth);
}

/**
 * システム利用開始月の直前6ヶ月（利用開始月は含まない）。
 * 入社日は使用しない。
 */
export function buildExistingEmployeeRecentHistoryMonths(systemStartDate: string): string[] {
  const systemStartMonth = systemStartDate.trim();
  if (!/^\d{4}-\d{2}$/.test(systemStartMonth)) {
    return [];
  }

  const months: string[] = [];
  let cursor = getPreviousYearMonthKey(systemStartMonth);

  for (let index = 0; index < EXISTING_EMPLOYEE_HISTORY_MONTH_COUNT; index += 1) {
    months.unshift(cursor);
    cursor = getPreviousYearMonthKey(cursor);
  }

  return months;
}

/**
 * 既存社員の入力対象月。
 * 直近6ヶ月のうち、入社月以降の月のみ（入社が6ヶ月以内の場合は行数が減る）。
 */
export function buildExistingEmployeeHistoryMonths(
  hireDate: string,
  systemStartDate: string
): string[] {
  const recentMonths = buildExistingEmployeeRecentHistoryMonths(systemStartDate);
  if (recentMonths.length === 0 || !isResolvableHireDateForRegistration(hireDate)) {
    return [];
  }

  const hireMonth = toYearMonthKey(hireDate);
  if (!hireMonth) {
    return [];
  }

  return recentMonths.filter((month) => compareYearMonths(month, hireMonth) >= 0);
}

/** 既存社員の入力対象期間ラベル */
export function formatExistingEmployeeHistoryPeriodLabel(
  hireDate: string,
  systemStartDate: string
): string {
  const months = buildExistingEmployeeHistoryMonths(hireDate, systemStartDate);
  if (months.length === 0) {
    return '';
  }

  const startLabel = formatTargetMonthLabel(months[0]);
  const endLabel = formatTargetMonthLabel(months[months.length - 1]);
  return `${startLabel} 〜 ${endLabel}`;
}

/** 送信データが期待される月次履歴と一致するか */
export function isExistingEmployeeHistoryComplete(
  hireDate: string,
  systemStartDate: string,
  rows: PayrollHistoryRow[]
): boolean {
  const expectedMonths = buildExistingEmployeeHistoryMonths(hireDate, systemStartDate);
  if (expectedMonths.length === 0 || rows.length !== expectedMonths.length) {
    return false;
  }

  const rowMonths = rows.map((row) => row.targetMonth.trim());
  return expectedMonths.every((month) => rowMonths.includes(month));
}

/** 厚生年金等級の最大値 */
export const PENSION_GRADE_MAX = 32;

/** 健康保険等級から厚生年金等級を導出（マイナス3の原則） */
export function derivePensionGradeFromHealthGrade(healthGrade: number): number {
  return Math.max(1, Math.min(PENSION_GRADE_MAX, healthGrade - 3));
}
