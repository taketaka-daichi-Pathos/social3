import { FormControl, Validators } from '@angular/forms';
import {
  applyDependentDateConflictErrors,
  DEPENDENT_DATE_CONFLICT_ERROR,
  isDependentDateConflict,
} from './dependent-date.validators';

describe('dependent-date.validators', () => {
  describe('isDependentDateConflict', () => {
    it('returns false when either date is empty', () => {
      expect(isDependentDateConflict('', '2024-01-01')).toBeFalse();
      expect(isDependentDateConflict('2024-01-01', '')).toBeFalse();
    });

    it('returns false when birth date is on or before dependency start date', () => {
      expect(isDependentDateConflict('1990-05-01', '2024-01-01')).toBeFalse();
      expect(isDependentDateConflict('2024-01-01', '2024-01-01')).toBeFalse();
    });

    it('returns true when birth date is after dependency start date', () => {
      expect(isDependentDateConflict('2024-06-01', '2024-01-01')).toBeTrue();
    });
  });

  describe('applyDependentDateConflictErrors', () => {
    it('sets dateConflict on both controls when dates conflict', () => {
      const birthControl = new FormControl('2024-06-01');
      const startControl = new FormControl('2024-01-01');

      applyDependentDateConflictErrors(birthControl, startControl);

      expect(birthControl.errors?.[DEPENDENT_DATE_CONFLICT_ERROR]).toBeTrue();
      expect(startControl.errors?.[DEPENDENT_DATE_CONFLICT_ERROR]).toBeTrue();
    });

    it('clears dateConflict while preserving required error', () => {
      const birthControl = new FormControl('', Validators.required);
      const startControl = new FormControl('2024-01-01');

      applyDependentDateConflictErrors(birthControl, startControl);
      birthControl.setValue('1990-01-01');
      applyDependentDateConflictErrors(birthControl, startControl);

      expect(startControl.errors?.[DEPENDENT_DATE_CONFLICT_ERROR]).toBeUndefined();
      expect(birthControl.errors?.['required']).toBeTrue();
    });
  });
});
