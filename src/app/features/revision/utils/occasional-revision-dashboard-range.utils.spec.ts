import { getOccasionalRevisionDashboardSearchRange } from '@features/revision/utils/occasional-revision.utils';

describe('getOccasionalRevisionDashboardSearchRange', () => {
  it('includes the month before January so January changes can be detected', () => {
    const range = getOccasionalRevisionDashboardSearchRange(2026);

    expect(range.searchFrom).toBe('2025-12');
    expect(range.searchTo).toBe('2026-12');
    expect(range.payrollLoadFrom).toBe('2025-12');
    expect(range.payrollLoadTo).toBe('2027-02');
  });
});
