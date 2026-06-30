import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import {
  isDelayedUnpaidAdjustment,
  isMidHireReductionAdjustment,
  resolveOccasionalRevisionMonthInclusion,
  resolveRevisionMonthPaymentAmount,
} from '@features/revision/utils/annual-determination-adjustment.utils';
import { REGULAR_MIN_PAYMENT_BASE_DAYS } from '@features/revision/utils/revision-base-days.utils';

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

describe('annual-determination-adjustment.utils occasional revision', () => {
  it('excludes mid-hire reduction months even when base days are sufficient', () => {
    const snapshot = createSnapshot({
      adjustmentType: 'mid_hire_reduction',
      adjustmentAmount: -50_000,
      baseDays: 20,
    });

    expect(isMidHireReductionAdjustment(snapshot)).toBe(true);
    expect(
      resolveOccasionalRevisionMonthInclusion(snapshot, REGULAR_MIN_PAYMENT_BASE_DAYS)
    ).toEqual({
      included: false,
      note: '中途入社減額のため対象外',
    });
  });

  it('applies delayed unpaid amount using the same subtraction as delayed raise delta', () => {
    const snapshot = createSnapshot({
      adjustmentType: 'delayed_unpaid',
      adjustmentAmount: -40_000,
    });

    expect(isDelayedUnpaidAdjustment(snapshot)).toBe(true);
    expect(resolveRevisionMonthPaymentAmount(snapshot)).toBe(300_000);
  });

  it('keeps delayed raise delta subtraction behavior unchanged', () => {
    const snapshot = createSnapshot({
      adjustmentType: 'delayed_raise_delta',
      adjustmentAmount: 30_000,
    });

    expect(resolveRevisionMonthPaymentAmount(snapshot)).toBe(300_000);
  });
});
