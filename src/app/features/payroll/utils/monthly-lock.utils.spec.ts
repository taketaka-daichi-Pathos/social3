import {
  canLockPayrollMonthSequentially,
  canSaveCompensationForTargetMonth,
  isExemptFromPreviousMonthLockRequirement,
  isMonthlyLockDocumentLocked,
  shouldShowPreviousMonthNotLockedCompensationSaveWarning,
} from './monthly-lock.utils';

describe('monthly-lock sequential validation', () => {
  it('allows locking the system start month without a locked previous month', () => {
    expect(
      canLockPayrollMonthSequentially({
        targetMonth: '2026-01',
        previousMonthLocked: false,
        systemStartDate: '2026-01',
        latestLockedMonth: null,
      })
    ).toBe(true);
  });

  it('normalizes YYYY/MM system start date when comparing', () => {
    expect(
      canLockPayrollMonthSequentially({
        targetMonth: '2026-04',
        previousMonthLocked: false,
        systemStartDate: '2026/04',
        latestLockedMonth: null,
      })
    ).toBe(true);
  });

  it('normalizes YYYY-MM-DD system start date when comparing', () => {
    expect(
      canLockPayrollMonthSequentially({
        targetMonth: '2026-04',
        previousMonthLocked: false,
        systemStartDate: '2026-04-01',
        latestLockedMonth: null,
      })
    ).toBe(true);
  });

  it('blocks locking when the previous month is not locked', () => {
    expect(
      canLockPayrollMonthSequentially({
        targetMonth: '2026-11',
        previousMonthLocked: false,
        systemStartDate: '2026-01',
        latestLockedMonth: '2026-09',
      })
    ).toBe(false);
  });

  it('allows locking when the previous month is locked', () => {
    expect(
      canLockPayrollMonthSequentially({
        targetMonth: '2026-11',
        previousMonthLocked: true,
        systemStartDate: '2026-01',
        latestLockedMonth: '2026-10',
      })
    ).toBe(true);
  });

  it('treats the first lock month as exempt when no month has been locked yet', () => {
    expect(
      isExemptFromPreviousMonthLockRequirement('2026-03', '2026-03', null)
    ).toBe(true);

    expect(
      canLockPayrollMonthSequentially({
        targetMonth: '2026-03',
        previousMonthLocked: false,
        systemStartDate: '2026-03',
        latestLockedMonth: null,
      })
    ).toBe(true);
  });
});

describe('isMonthlyLockDocumentLocked', () => {
  it('returns true only when isLocked is strictly true', () => {
    expect(isMonthlyLockDocumentLocked({ isLocked: true })).toBe(true);
    expect(isMonthlyLockDocumentLocked({ isLocked: true, allowances: [] })).toBe(true);
  });

  it('returns false for missing, non-boolean, or false isLocked', () => {
    expect(isMonthlyLockDocumentLocked(null)).toBe(false);
    expect(isMonthlyLockDocumentLocked(undefined)).toBe(false);
    expect(isMonthlyLockDocumentLocked({ allowances: [] })).toBe(false);
    expect(isMonthlyLockDocumentLocked({ isLocked: false })).toBe(false);
    expect(isMonthlyLockDocumentLocked({ isLocked: 'true' })).toBe(false);
  });
});

describe('canSaveCompensationForTargetMonth', () => {
  it('allows saving on the system start month without a locked previous month', () => {
    expect(
      canSaveCompensationForTargetMonth({
        targetMonth: '2026-04',
        previousMonthLocked: false,
        systemStartDate: '2026-04',
        companySettingsLoaded: true,
      })
    ).toBe(true);
  });

  it('blocks saving when the previous month is not locked', () => {
    expect(
      canSaveCompensationForTargetMonth({
        targetMonth: '2026-05',
        previousMonthLocked: false,
        systemStartDate: '2026-04',
        companySettingsLoaded: true,
      })
    ).toBe(false);
  });

  it('allows saving when the previous month is locked', () => {
    expect(
      canSaveCompensationForTargetMonth({
        targetMonth: '2026-05',
        previousMonthLocked: true,
        systemStartDate: '2026-04',
        companySettingsLoaded: true,
      })
    ).toBe(true);
  });

  it('shows warning only when save is blocked by previous month lock', () => {
    expect(
      shouldShowPreviousMonthNotLockedCompensationSaveWarning({
        targetMonth: '2026-05',
        previousMonthLocked: false,
        systemStartDate: '2026-04',
        companySettingsLoaded: true,
      })
    ).toBe(true);

    expect(
      shouldShowPreviousMonthNotLockedCompensationSaveWarning({
        targetMonth: '2026-04',
        previousMonthLocked: false,
        systemStartDate: '2026-04',
        companySettingsLoaded: true,
      })
    ).toBe(false);
  });
});
