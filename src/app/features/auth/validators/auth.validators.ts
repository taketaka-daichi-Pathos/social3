import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function passwordMatchValidator(
  passwordField: string,
  confirmField: string
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const password = control.get(passwordField)?.value;
    const confirm = control.get(confirmField)?.value;

    if (!password || !confirm) {
      return null;
    }

    return password === confirm ? null : { passwordMismatch: true };
  };
}
