import {
  calculateFixedWagesTotal,
  calculatePayrollDisplayTotal,
  getCurrentYearAprilMonthKey,
  PAYROLL_DISPLAY_TOTAL_FLOOR_ERROR,
  roundNonNegativePayrollYen,
  roundPayrollYen,
  validatePayrollAdjustmentTotal,
  wouldPayrollAdjustmentExceedTotal,
} from '@features/payroll/utils/compensation.utils';

describe('compensation.utils year-month helpers', () => {
  it('returns April of the reference year', () => {
    expect(getCurrentYearAprilMonthKey(new Date(2026, 5, 25))).toBe('2026-04');
    expect(getCurrentYearAprilMonthKey(new Date(2027, 0, 1))).toBe('2027-04');
  });
});

describe('compensation.utils payroll adjustment guards', () => {
  const allowances = [{ name: '通勤手当', amount: 10_000 }];

  it('keeps display total at zero when adjustment exceeds pre-adjustment total', () => {
    expect(
      calculatePayrollDisplayTotal(200_000, allowances, 50_000, -1_000_000)
    ).toBe(0);
  });

  it('returns expected total when adjustment stays within bounds', () => {
    expect(
      calculatePayrollDisplayTotal(200_000, allowances, 50_000, -30_000)
    ).toBe(230_000);
  });

  it('detects when adjustment would drive total below zero', () => {
    expect(wouldPayrollAdjustmentExceedTotal(260_000, -300_000)).toBe(true);
    expect(wouldPayrollAdjustmentExceedTotal(260_000, -260_000)).toBe(false);
    expect(wouldPayrollAdjustmentExceedTotal(260_000, -100_000)).toBe(false);
  });

  it('returns validation message when adjustment exceeds total', () => {
    expect(validatePayrollAdjustmentTotal(260_000, -300_000)).toBe(
      PAYROLL_DISPLAY_TOTAL_FLOOR_ERROR
    );
    expect(validatePayrollAdjustmentTotal(260_000, -100_000)).toBeNull();
    expect(validatePayrollAdjustmentTotal(260_000, 0)).toBeNull();
  });
});

describe('compensation.utils payroll yen rounding', () => {
  it('rounds floating point artifacts to the nearest yen', () => {
    expect(roundNonNegativePayrollYen(299_999.99999999994)).toBe(300_000);
    expect(roundPayrollYen(-100_000.4)).toBe(-100_000);
  });

  it('keeps fixed wage totals when summing base salary and allowances', () => {
    const allowances = [
      { name: '通勤手当', amount: 100_000.00000000001 },
      { name: '住宅手当', amount: 50_000 },
    ];

    expect(calculateFixedWagesTotal(150_000, allowances)).toBe(300_000);
    expect(
      calculatePayrollDisplayTotal(150_000, allowances, 0, 0)
    ).toBe(300_000);
  });
});
