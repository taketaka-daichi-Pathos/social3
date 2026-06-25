import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import {
  canValidateEmployeeDates,
  isBirthDateOnOrBeforeHireDate,
  isEligibleHireAge,
} from '@core/utils/date.utils';

/** 社員番号: 半角数字（1〜20桁） */
export const EMPLOYEE_NUMBER_PATTERN = /^\d{1,20}$/;
/** マイナンバー: 12桁 */
export const MY_NUMBER_PATTERN = /^\d{12}$/;

/** フリガナ（カタカナ） */
export const KANA_PATTERN = /^[ァ-ヶー・\s]+$/;

export const MY_NUMBER_DIGIT_COUNT = 12;

export const BIRTH_AFTER_HIRE_ERROR = 'birthAfterHire';
export const UNDER_MINIMUM_HIRE_AGE_ERROR = 'underMinimumHireAge';

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
