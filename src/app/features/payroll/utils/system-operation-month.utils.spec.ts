import { normalizeYearMonthKey } from './system-operation-month.utils';

describe('normalizeYearMonthKey', () => {
  it('accepts YYYY-MM', () => {
    expect(normalizeYearMonthKey('2026-04')).toBe('2026-04');
  });

  it('accepts YYYY/MM', () => {
    expect(normalizeYearMonthKey('2026/04')).toBe('2026-04');
  });

  it('accepts YYYY-MM-DD', () => {
    expect(normalizeYearMonthKey('2026-04-01')).toBe('2026-04');
  });

  it('returns null for empty values', () => {
    expect(normalizeYearMonthKey('')).toBeNull();
    expect(normalizeYearMonthKey(null)).toBeNull();
  });
});
