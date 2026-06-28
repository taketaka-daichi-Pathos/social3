import { FormControl } from '@angular/forms';
import { duplicateApplicableMonthValidator, statutoryMasterPeriodValidator } from '@features/settings/validators/insurance-rate-history.validators';

describe('duplicateApplicableMonthValidator', () => {
  it('returns duplicateMonth when the month already exists in history', () => {
    const control = new FormControl('2025-04');
    control.addValidators(
      duplicateApplicableMonthValidator(() => ({
        history: [
          {
            id: 'entry-1',
            applicableMonth: '2025-04',
            healthInsuranceRate: 9.91,
            careInsuranceRate: 1.59,
            updatedAt: null,
          },
        ],
        editingEntryId: null,
      }))
    );

    control.updateValueAndValidity();

    expect(control.errors).toEqual({ duplicateMonth: true });
  });

  it('allows the month when editing the same history entry', () => {
    const control = new FormControl('2025-04');
    control.addValidators(
      duplicateApplicableMonthValidator(() => ({
        history: [
          {
            id: 'entry-1',
            applicableMonth: '2025-04',
            healthInsuranceRate: 9.91,
            careInsuranceRate: 1.59,
            updatedAt: null,
          },
        ],
        editingEntryId: 'entry-1',
      }))
    );

    control.updateValueAndValidity();

    expect(control.errors).toBeNull();
  });
});

describe('statutoryMasterPeriodValidator', () => {
  it('rejects manual entry within statutory master retention period', () => {
    const control = new FormControl('2026-04');
    control.addValidators(
      statutoryMasterPeriodValidator(() => ({
        history: [],
        editingEntryId: null,
        systemStartDate: '2026-04',
        userEditedApplicableMonth: true,
      }))
    );

    control.updateValueAndValidity();

    expect(control.errors).toEqual({ statutoryMasterPeriod: true });
  });

  it('allows initial systemStartDate seed without user edit', () => {
    const control = new FormControl('2026-04');
    control.addValidators(
      statutoryMasterPeriodValidator(() => ({
        history: [],
        editingEntryId: null,
        systemStartDate: '2026-04',
        userEditedApplicableMonth: false,
      }))
    );

    control.updateValueAndValidity();

    expect(control.errors).toBeNull();
  });

  it('allows editing an existing history entry for the same month', () => {
    const control = new FormControl('2026-04');
    control.addValidators(
      statutoryMasterPeriodValidator(() => ({
        history: [
          {
            id: 'entry-1',
            applicableMonth: '2026-04',
            healthInsuranceRate: 9.85,
            careInsuranceRate: 1.62,
            updatedAt: null,
          },
        ],
        editingEntryId: 'entry-1',
        systemStartDate: '2026-04',
        userEditedApplicableMonth: true,
      }))
    );

    control.updateValueAndValidity();

    expect(control.errors).toBeNull();
  });
});
