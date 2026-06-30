import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isRetirementDateBeforeHireDate } from '@features/employees/utils/retirement.utils';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const RETIREMENT_BEFORE_HIRE_DATE_ERROR = 'beforeHireDate';

export const RETIREMENT_BEFORE_HIRE_DATE_MESSAGE =
  '退職日は入社日以降の日付を指定してください';

/** 退職日は入社日以降 */
export function retirementDateNotBeforeHireValidator(
  getHireDate: () => string
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const retirementDate = String(control.value ?? '').trim();
    if (!ISO_DATE_PATTERN.test(retirementDate)) {
      return null;
    }

    const hireDate = getHireDate().trim();
    if (!ISO_DATE_PATTERN.test(hireDate)) {
      return null;
    }

    return isRetirementDateBeforeHireDate(retirementDate, hireDate)
      ? { [RETIREMENT_BEFORE_HIRE_DATE_ERROR]: true }
      : null;
  };
}
