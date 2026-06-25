import { isValidIsoDate } from './text-normalize.utils';

/** YYYY-MM-DD 文字列をローカル日付としてパースする */
export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** 基準日時点の満年齢を算出する */
export function calculateAgeAtDate(birthDate: string, referenceDate: string): number {
  const birth = parseIsoDate(birthDate);
  const reference = parseIsoDate(referenceDate);

  let age = reference.getFullYear() - birth.getFullYear();
  const monthDiff = reference.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
}

export const MINIMUM_HIRE_AGE = 15;

export function isBirthDateOnOrBeforeHireDate(birthDate: string, hireDate: string): boolean {
  return parseIsoDate(birthDate) <= parseIsoDate(hireDate);
}

export function isEligibleHireAge(birthDate: string, hireDate: string): boolean {
  return calculateAgeAtDate(birthDate, hireDate) >= MINIMUM_HIRE_AGE;
}

export function canValidateEmployeeDates(birthDate: string, hireDate: string): boolean {
  return isValidIsoDate(birthDate) && isValidIsoDate(hireDate);
}
