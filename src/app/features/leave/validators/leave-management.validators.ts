import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Employee } from '@features/employees/models/employee.model';
import { LeaveType } from '@features/employees/models/leave-record.model';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const LEAVE_GENDER_MISMATCH_ERROR = 'genderMismatch';
export const LEAVE_END_BEFORE_START_ERROR = 'endBeforeStartMonth';
export const LEAVE_BEFORE_HIRE_DATE_ERROR = 'beforeHireDate';
export const EXCEEDS_PATERNITY_LEAVE_LIMIT_ERROR = 'exceedsPaternityLeaveLimit';
export const CHILDCARE_BIRTH_AFTER_START_ERROR = 'birthAfterLeaveStart';

export const MAX_PATERNITY_LEAVE_DAYS = 28;

/** 産休は女性従業員のみ */
export function maternityGenderValidator(
  getEmployee: () => Employee | null | undefined
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const type = control.value as LeaveType;
    if (type !== 'maternity') {
      return null;
    }

    const employee = getEmployee();
    if (!employee || employee.gender !== 'male') {
      return null;
    }

    return { [LEAVE_GENDER_MISMATCH_ERROR]: true };
  };
}

/** 終了予定日は開始日以降 */
export function leaveEndDateValidator(getStartDate: () => string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const endDate = String(control.value ?? '').trim();
    if (!ISO_DATE_PATTERN.test(endDate)) {
      return null;
    }

    const startDate = getStartDate().trim();
    if (!ISO_DATE_PATTERN.test(startDate)) {
      return null;
    }

    if (endDate < startDate) {
      return { [LEAVE_END_BEFORE_START_ERROR]: true };
    }

    return null;
  };
}

function parseIsoLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/** 開始日・終了日を含む日数 */
export function inclusiveDaysBetween(startDate: string, endDate: string): number | null {
  const start = parseIsoLocalDate(startDate);
  const end = parseIsoLocalDate(endDate);

  if (!start || !end || end.getTime() < start.getTime()) {
    return null;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;
}

/** 開始日・終了日は入社日以降 */
export function leaveDateNotBeforeHireValidator(
  getHireDate: () => string
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!ISO_DATE_PATTERN.test(value)) {
      return null;
    }

    const hireDate = getHireDate().trim();
    if (!ISO_DATE_PATTERN.test(hireDate)) {
      return null;
    }

    if (value < hireDate) {
      return { [LEAVE_BEFORE_HIRE_DATE_ERROR]: true };
    }

    return null;
  };
}

/** 男性の育休（産後パパ育休）は最大28日間 */
export function paternityLeaveDurationValidator(
  getLeaveType: () => LeaveType | '',
  getEmployee: () => Employee | null | undefined,
  getStartDate: () => string
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (getLeaveType() !== 'childcare') {
      return null;
    }

    const employee = getEmployee();
    if (!employee || employee.gender !== 'male') {
      return null;
    }

    const endDate = String(control.value ?? '').trim();
    const startDate = getStartDate().trim();

    if (!ISO_DATE_PATTERN.test(endDate) || !ISO_DATE_PATTERN.test(startDate)) {
      return null;
    }

    const days = inclusiveDaysBetween(startDate, endDate);
    if (days == null || days <= MAX_PATERNITY_LEAVE_DAYS) {
      return null;
    }

    return { [EXCEEDS_PATERNITY_LEAVE_LIMIT_ERROR]: true };
  };
}

/** 育休の場合、子の生年月日は休業開始日以前である必要がある */
export function childcareChildBirthDateValidator(
  getLeaveType: () => LeaveType | '',
  getStartDate: () => string
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (getLeaveType() !== 'childcare') {
      return null;
    }

    const birthDate = String(control.value ?? '').trim();
    if (!birthDate) {
      return null;
    }

    const startDate = getStartDate().trim();
    if (!ISO_DATE_PATTERN.test(birthDate) || !ISO_DATE_PATTERN.test(startDate)) {
      return null;
    }

    if (birthDate > startDate) {
      return { [CHILDCARE_BIRTH_AFTER_START_ERROR]: true };
    }

    return null;
  };
}
