import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import {
  isOccasionalRevisionFixedWageChangeTrigger,
  resolveOccasionalRevisionFixedWageSkipReason,
} from '@features/revision/utils/occasional-revision.utils';

function createSnapshot(
  overrides: Partial<PayrollMonthSnapshot> = {}
): PayrollMonthSnapshot {
  return {
    yearMonth: '2026-04',
    baseDays: 20,
    totalPayment: 300_000,
    fixedWages: 280_000,
    nonFixedWages: 20_000,
    adjustmentAmount: 0,
    adjustmentType: null,
    adjustmentTargetMonth: '',
    locked: true,
    ...overrides,
  };
}

describe('occasional revision fixed wage trigger', () => {
  it('does not trigger when only delayed unpaid adjustment changes remuneration', () => {
    const previous = createSnapshot({ yearMonth: '2026-03' });
    const current = createSnapshot({
      yearMonth: '2026-04',
      adjustmentType: 'delayed_unpaid',
      adjustmentAmount: -50_000,
      nonFixedWages: 0,
      totalPayment: 280_000,
    });

    expect(isOccasionalRevisionFixedWageChangeTrigger(current, previous)).toBe(false);
    expect(resolveOccasionalRevisionFixedWageSkipReason(current)).toBe(
      '遅配（未払い）のみの変動（固定的賃金の変動なし）'
    );
  });

  it('triggers when fixed wages change even if delayed unpaid is present', () => {
    const previous = createSnapshot({ yearMonth: '2026-03', fixedWages: 280_000 });
    const current = createSnapshot({
      yearMonth: '2026-04',
      fixedWages: 300_000,
      adjustmentType: 'delayed_unpaid',
      adjustmentAmount: -20_000,
    });

    expect(isOccasionalRevisionFixedWageChangeTrigger(current, previous)).toBe(true);
  });
});
