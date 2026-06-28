const STORAGE_PREFIX = 'social3.payroll.targetMonth';

/** 月次給与タブの対象月（ユーザー指定キー） */
export const SELECTED_PAYROLL_MONTH_KEY = 'selectedPayrollMonth';

/** 賞与タブの対象月（ユーザー指定キー） */
export const SELECTED_BONUS_MONTH_KEY = 'selectedBonusMonth';

/** 賞与タブの支払日（ユーザー指定キー） */
export const SELECTED_BONUS_PAYMENT_DATE_KEY = 'selectedBonusPaymentDate';

/** 月次保険料タブの対象月（ユーザー指定キー） */
export const SELECTED_INSURANCE_MONTH_KEY = 'selectedInsuranceMonth';

export const PAYROLL_STORAGE_KEYS = {
  monthly: SELECTED_PAYROLL_MONTH_KEY,
  bonus: SELECTED_BONUS_MONTH_KEY,
  insurance: SELECTED_INSURANCE_MONTH_KEY,
} as const;

export type PayrollStorageKey = (typeof PAYROLL_STORAGE_KEYS)[keyof typeof PAYROLL_STORAGE_KEYS];

const LEGACY_MONTHLY_KEY = `${STORAGE_PREFIX}.monthly`;
const LEGACY_BONUS_KEY = `${STORAGE_PREFIX}.bonus`;
const LEGACY_INSURANCE_KEY = `${STORAGE_PREFIX}.insurance`;

function readLegacyMonth(key: PayrollStorageKey): string | null {
  if (key === SELECTED_PAYROLL_MONTH_KEY) {
    return localStorage.getItem(LEGACY_MONTHLY_KEY);
  }
  if (key === SELECTED_BONUS_MONTH_KEY) {
    return localStorage.getItem(LEGACY_BONUS_KEY);
  }
  if (key === SELECTED_INSURANCE_MONTH_KEY) {
    return localStorage.getItem(LEGACY_INSURANCE_KEY);
  }
  return null;
}

export function loadStoredTargetMonth(key: PayrollStorageKey, fallback: string): string {
  if (typeof localStorage === 'undefined') {
    return fallback;
  }

  try {
    const stored = localStorage.getItem(key);
    if (stored && /^\d{4}-\d{2}$/.test(stored)) {
      return stored;
    }

    const legacy = readLegacyMonth(key);
    if (legacy && /^\d{4}-\d{2}$/.test(legacy)) {
      localStorage.setItem(key, legacy);
      return legacy;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredTargetMonth(key: PayrollStorageKey, yearMonth: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(key, yearMonth);
  } catch {
    // ignore quota errors
  }
}

export function loadStoredBonusPaymentDate(fallback = ''): string {
  if (typeof localStorage === 'undefined') {
    return fallback;
  }

  try {
    const stored = localStorage.getItem(SELECTED_BONUS_PAYMENT_DATE_KEY);
    return stored && /^\d{4}-\d{2}-\d{2}$/.test(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredBonusPaymentDate(paymentDate: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    if (paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      localStorage.setItem(SELECTED_BONUS_PAYMENT_DATE_KEY, paymentDate);
      return;
    }

    localStorage.removeItem(SELECTED_BONUS_PAYMENT_DATE_KEY);
  } catch {
    // ignore quota errors
  }
}

/** 随時改定・算定基礎画面の対象年 */
export const SELECTED_REVISION_YEAR_KEY = 'selectedRevisionYear';

export function loadStoredRevisionYear(fallbackYear: number): number {
  if (typeof localStorage === 'undefined') {
    return fallbackYear;
  }

  try {
    const stored = localStorage.getItem(SELECTED_REVISION_YEAR_KEY);
    if (!stored) {
      return fallbackYear;
    }

    const year = Number(stored);
    if (Number.isInteger(year) && year >= 1900 && year <= 2100) {
      return year;
    }

    return fallbackYear;
  } catch {
    return fallbackYear;
  }
}

export function saveStoredRevisionYear(year: number): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(SELECTED_REVISION_YEAR_KEY, String(year));
  } catch {
    // ignore quota errors
  }
}

/** 随時改定画面の起算月（YYYY-MM） */
export const SELECTED_REVISION_OCCASIONAL_MONTH_KEY = 'selectedRevisionOccasionalMonth';

export function loadStoredRevisionOccasionalMonth(fallbackYearMonth: string): string {
  if (typeof localStorage === 'undefined') {
    return fallbackYearMonth;
  }

  try {
    const stored = localStorage.getItem(SELECTED_REVISION_OCCASIONAL_MONTH_KEY);
    if (stored && /^\d{4}-\d{2}$/.test(stored)) {
      return stored;
    }

    return fallbackYearMonth;
  } catch {
    return fallbackYearMonth;
  }
}

export function saveStoredRevisionOccasionalMonth(yearMonth: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    if (/^\d{4}-\d{2}$/.test(yearMonth)) {
      localStorage.setItem(SELECTED_REVISION_OCCASIONAL_MONTH_KEY, yearMonth);
    }
  } catch {
    // ignore quota errors
  }
}
