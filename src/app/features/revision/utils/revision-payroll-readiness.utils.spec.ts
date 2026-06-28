import {
  hasMissingPayrollInRevisionMonthDetails,
  REVISION_MISSING_PAYROLL_NOTE,
} from './revision-payroll-readiness.utils';

describe('hasMissingPayrollInRevisionMonthDetails', () => {
  it('returns true when any month has the missing payroll note', () => {
    expect(
      hasMissingPayrollInRevisionMonthDetails([
        { note: null },
        { note: REVISION_MISSING_PAYROLL_NOTE },
        { note: '基礎日数不足' },
      ])
    ).toBe(true);
  });

  it('returns false when all months are saved', () => {
    expect(
      hasMissingPayrollInRevisionMonthDetails([
        { note: null },
        { note: null },
        { note: '15・16日特例適用' },
      ])
    ).toBe(false);
  });
});
