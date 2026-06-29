import { AbstractControl } from '@angular/forms';

export const DEPENDENT_DATE_CONFLICT_ERROR = 'dateConflict';

export const DEPENDENT_DATE_CONFLICT_MESSAGE =
  '※生年月日は、扶養開始日以前の日付を指定してください。';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDependentDateConflict(birthDate: string, dependencyStartDate: string): boolean {
  const birth = birthDate.trim();
  const start = dependencyStartDate.trim();

  if (!ISO_DATE_PATTERN.test(birth) || !ISO_DATE_PATTERN.test(start)) {
    return false;
  }

  return birth > start;
}

export function applyDependentDateConflictErrors(
  birthControl: AbstractControl,
  dependencyStartControl: AbstractControl
): void {
  const conflict = isDependentDateConflict(
    String(birthControl.value ?? ''),
    String(dependencyStartControl.value ?? '')
  );

  patchControlError(birthControl, DEPENDENT_DATE_CONFLICT_ERROR, conflict);
  patchControlError(dependencyStartControl, DEPENDENT_DATE_CONFLICT_ERROR, conflict);
}

function patchControlError(control: AbstractControl, key: string, active: boolean): void {
  const current = control.errors ?? {};

  if (active) {
    if (current[key]) {
      return;
    }

    control.setErrors({ ...current, [key]: true });
    return;
  }

  if (!current[key]) {
    return;
  }

  const next = { ...current };
  delete next[key];
  control.setErrors(Object.keys(next).length > 0 ? next : null);
}
