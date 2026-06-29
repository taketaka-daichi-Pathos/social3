import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { isValidIsoDate, toHalfWidthDigits } from '@core/utils/text-normalize.utils';
import { normalizeBonusPaymentDate } from '@features/payroll/utils/bonus-history.utils';

export const BONUS_PAYMENT_YEAR_MIN = 1900;

/** 賞与支払日の年として許容する上限（当年から5年先まで） */
export function getBonusPaymentYearMax(referenceDate = new Date()): number {
  return referenceDate.getFullYear() + 5;
}

export interface BonusPaymentDateParts {
  year: string;
  month: string;
  day: string;
}

export function composeBonusPaymentDate(parts: BonusPaymentDateParts): string {
  const year = String(parts.year ?? '').trim();
  const month = String(parts.month ?? '').trim();
  const day = String(parts.day ?? '').trim();

  if (!/^\d{4}$/.test(year) || !month || !day) {
    return '';
  }

  const monthNumber = Number(month);
  const dayNumber = Number(day);

  if (
    !Number.isInteger(monthNumber) ||
    !Number.isInteger(dayNumber) ||
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > 31
  ) {
    return '';
  }

  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
}

export function parseBonusPaymentDateParts(value: unknown): BonusPaymentDateParts {
  const normalized = normalizeBonusPaymentDate(value);
  if (!normalized) {
    return { year: '', month: '', day: '' };
  }

  const [year, month, day] = normalized.split('-');
  return {
    year,
    month: String(Number(month)),
    day: String(Number(day)),
  };
}

export function createBonusPaymentYearValidators(referenceDate = new Date()): ValidatorFn[] {
  const maxYear = getBonusPaymentYearMax(referenceDate);

  return [
    Validators.required,
    Validators.pattern(/^\d{4}$/),
    Validators.min(BONUS_PAYMENT_YEAR_MIN),
    Validators.max(maxYear),
  ];
}

export const bonusPaymentDatePartsValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  if (!(control instanceof AbstractControl)) {
    return null;
  }

  const year = String(control.get('year')?.value ?? '').trim();
  const month = String(control.get('month')?.value ?? '').trim();
  const day = String(control.get('day')?.value ?? '').trim();

  if (!year && !month && !day) {
    return { paymentDate: true };
  }

  const composed = composeBonusPaymentDate({ year, month, day });
  if (!composed || !isValidIsoDate(composed)) {
    return { paymentDate: true };
  }

  return null;
};

export function normalizeBonusPaymentYearInput(value: string): string {
  return toHalfWidthDigits(value).slice(0, 4);
}

export function normalizeBonusPaymentDayInput(value: string): string {
  return toHalfWidthDigits(value).slice(0, 2);
}
