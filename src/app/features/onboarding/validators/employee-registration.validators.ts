import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { compareYearMonths, getCurrentYearMonthKey } from '@features/payroll/utils/compensation.utils';
import {
  canValidateEmployeeDates,
  isBirthDateOnOrBeforeHireDate,
  isEligibleHireAge,
} from '@core/utils/date.utils';

/** 社員番号: 半角数字（1〜20桁） */
export const EMPLOYEE_NUMBER_PATTERN = /^\d{1,20}$/;
/** 社員番号重複 */
export const EMPLOYEE_NUMBER_DUPLICATE_ERROR = 'employeeNumberDuplicate';
/** マイナンバー: 12桁 */
export const MY_NUMBER_PATTERN = /^\d{12}$/;

/** フリガナ（カタカナ） */
export const KANA_PATTERN = /^[ァ-ヶー・\s]+$/;

export const MY_NUMBER_DIGIT_COUNT = 12;

export const BIRTH_AFTER_HIRE_ERROR = 'birthAfterHire';
export const UNDER_MINIMUM_HIRE_AGE_ERROR = 'underMinimumHireAge';
export const INVALID_TARGET_MONTH_ERROR = 'invalidTargetMonth';
export const NOT_AFTER_PREVIOUS_HISTORY_ERROR = 'notAfterPreviousHistory';
export const FUTURE_MONTH_NOT_ALLOWED_ERROR = 'futureMonthNotAllowed';

/** YYYY-MM 形式か */
const YEAR_MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

/** YYYY-MM-DD / YYYY-MM から YYYY-MM を抽出する（Date 型は使わない） */
export function extractYearMonthFromIsoDate(value: string): string {
  const trimmed = value.trim();

  const fullDateMatch = /^(\d{4})-(\d{2})-\d{2}/.exec(trimmed);
  if (fullDateMatch) {
    const month = Number(fullDateMatch[2]);
    if (month >= 1 && month <= 12) {
      return `${fullDateMatch[1]}-${fullDateMatch[2]}`;
    }
    return '';
  }

  const yearMonthMatch = YEAR_MONTH_KEY_PATTERN.exec(trimmed);
  if (yearMonthMatch) {
    const month = Number(yearMonthMatch[2]);
    if (month >= 1 && month <= 12) {
      return `${yearMonthMatch[1]}-${yearMonthMatch[2]}`;
    }
  }

  return '';
}

/** input[type=month] の min 属性用。入社年月日から YYYY-MM を返す */
export function getMinMonth(hireDate: string): string {
  return extractYearMonthFromIsoDate(hireDate);
}

/** input[type=month] の max 属性用。現在月（YYYY-MM）を返す */
export function getMaxMonth(referenceDate = new Date()): string {
  return getCurrentYearMonthKey(referenceDate);
}

/** 対象年月が現在月以前か（YYYY-MM 同士で比較） */
export function isTargetMonthNotInFuture(
  targetMonth: string,
  referenceDate = new Date()
): boolean {
  const normalizedTarget = normalizeYearMonthKey(targetMonth);
  const maxMonth = getMaxMonth(referenceDate);

  if (!normalizedTarget || !maxMonth) {
    return true;
  }

  return compareYearMonths(normalizedTarget, maxMonth) <= 0;
}

/** 対象年月を YYYY-MM に正規化する */
export function normalizeYearMonthKey(value: string): string {
  const trimmed = value.trim();
  if (YEAR_MONTH_KEY_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return extractYearMonthFromIsoDate(trimmed);
}

/**
 * 対象年月が入社年月と同月または未来か（YYYY-MM 同士で比較）
 * 入社日が 2024-04-15、対象年月が 2024-04 の場合は true
 */
export function isTargetMonthOnOrAfterHireMonth(targetMonth: string, hireDate: string): boolean {
  const normalizedTarget = normalizeYearMonthKey(targetMonth);
  const hireYearMonth = extractYearMonthFromIsoDate(hireDate);

  if (!normalizedTarget || !hireYearMonth) {
    return true;
  }

  return normalizedTarget >= hireYearMonth;
}

/** 対象年月が直前履歴の対象年月より1ヶ月以上未来か */
export function isTargetMonthStrictlyAfterPrevious(
  targetMonth: string,
  previousMonth: string
): boolean {
  const current = normalizeYearMonthKey(targetMonth);
  const previous = normalizeYearMonthKey(previousMonth);

  if (!current || !previous) {
    return true;
  }

  return compareYearMonths(current, previous) > 0;
}

/** 給与履歴の対象年月が入社年月以降か（同月を含む） */
export function payrollHistoryTargetMonthValidator(getHireDate: () => string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const targetMonth = String(control.value ?? '').trim();
    if (!YEAR_MONTH_KEY_PATTERN.test(targetMonth)) {
      return null;
    }

    const hireDate = getHireDate();
    if (!extractYearMonthFromIsoDate(hireDate)) {
      return null;
    }

    if (!isTargetMonthOnOrAfterHireMonth(targetMonth, hireDate)) {
      return { [INVALID_TARGET_MONTH_ERROR]: true };
    }

    return null;
  };
}

/** 給与履歴の対象年月が未来でないか（現在月まで） */
export function payrollHistoryFutureMonthValidator(
  getReferenceDate: () => Date = () => new Date()
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const targetMonth = String(control.value ?? '').trim();
    if (!YEAR_MONTH_KEY_PATTERN.test(targetMonth)) {
      return null;
    }

    if (!isTargetMonthNotInFuture(targetMonth, getReferenceDate())) {
      return { [FUTURE_MONTH_NOT_ALLOWED_ERROR]: true };
    }

    return null;
  };
}

/** 生年月日・入社年月日の整合性（入社時15歳以上、生年月日≦入社日） */
export function employeeDateRulesValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const birthDate = String(group.get('birthDate')?.value ?? '');
    const hireDate = String(group.get('hireDate')?.value ?? '');
    const birthControl = group.get('birthDate');
    const hireControl = group.get('hireDate');

    removeCrossFieldDateErrors(birthControl);
    removeCrossFieldDateErrors(hireControl);

    if (!canValidateEmployeeDates(birthDate, hireDate)) {
      return null;
    }

    let groupError: ValidationErrors | null = null;

    if (!isBirthDateOnOrBeforeHireDate(birthDate, hireDate)) {
      setCrossFieldDateError(birthControl, BIRTH_AFTER_HIRE_ERROR);
      setCrossFieldDateError(hireControl, BIRTH_AFTER_HIRE_ERROR);
      groupError = { [BIRTH_AFTER_HIRE_ERROR]: true };
    }

    if (!isEligibleHireAge(birthDate, hireDate)) {
      setCrossFieldDateError(birthControl, UNDER_MINIMUM_HIRE_AGE_ERROR);
      setCrossFieldDateError(hireControl, UNDER_MINIMUM_HIRE_AGE_ERROR);
      groupError = { ...groupError, [UNDER_MINIMUM_HIRE_AGE_ERROR]: true };
    }

    return groupError;
  };
}

function setCrossFieldDateError(control: AbstractControl | null, key: string): void {
  if (!control) {
    return;
  }

  control.setErrors({ ...(control.errors ?? {}), [key]: true });
}

function removeCrossFieldDateError(control: AbstractControl | null, key: string): void {
  if (!control?.errors?.[key]) {
    return;
  }

  const { [key]: _, ...rest } = control.errors;
  control.setErrors(Object.keys(rest).length > 0 ? rest : null);
}

function removeCrossFieldDateErrors(control: AbstractControl | null): void {
  removeCrossFieldDateError(control, BIRTH_AFTER_HIRE_ERROR);
  removeCrossFieldDateError(control, UNDER_MINIMUM_HIRE_AGE_ERROR);
}
