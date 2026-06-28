import {
  getNextYearMonthKey,
  getPreviousYearMonthKey,
} from './compensation.utils';

describe('year month navigation keys', () => {
  it('returns zero-padded previous month', () => {
    expect(getPreviousYearMonthKey('2026-05')).toBe('2026-04');
    expect(getPreviousYearMonthKey('2026-01')).toBe('2025-12');
  });

  it('normalizes non-padded input before calculating previous month', () => {
    expect(getPreviousYearMonthKey('2026-5')).toBe('2026-04');
  });

  it('returns zero-padded next month', () => {
    expect(getNextYearMonthKey('2026-04')).toBe('2026-05');
    expect(getNextYearMonthKey('2026-12')).toBe('2027-01');
  });
});
