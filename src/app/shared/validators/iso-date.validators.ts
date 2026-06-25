import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isValidIsoDate } from '@core/utils/text-normalize.utils';

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isoDateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;

    if (!value) {
      return null;
    }

    return isValidIsoDate(String(value)) ? null : { isoDate: true };
  };
}
