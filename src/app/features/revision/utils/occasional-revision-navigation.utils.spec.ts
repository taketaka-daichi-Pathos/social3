import { OccasionalRevisionResult } from '@features/revision/models/revision.model';
import {
  collectOccasionalApplicationMonths,
  resolvePreferredOccasionalApplicationMonth,
  shiftOccasionalApplicationMonth,
} from '@features/revision/utils/occasional-revision.utils';

function createRow(
  overrides: Partial<OccasionalRevisionResult> = {}
): OccasionalRevisionResult {
  return {
    employeeId: 'emp-1',
    employeeName: '山田 太郎',
    employeeNumber: '001',
    changeMonth: '2026-07',
    status: 'eligible',
    isFixedWageChanged: true,
    isEligible: true,
    ineligibleReason: null,
    exclusionReasons: [],
    exclusionLabels: [],
    targetMonths: [],
    monthDetails: [],
    frequentBonusAdjustment: {
      applied: false,
      bonusPaymentCount: 0,
      bonusTotalAmount: 0,
      monthlyBonusAllocation: 0,
      assessmentPeriodFrom: '',
      assessmentPeriodTo: '',
      payrollOnlyAverage: null,
    },
    averagePayment: 350000,
    currentHealthStandard: 300000,
    currentPensionStandard: 300000,
    currentHealthGrade: 22,
    currentPensionGrade: 18,
    proposedHealthStandard: 360000,
    proposedPensionStandard: 360000,
    proposedHealthGrade: 24,
    proposedPensionGrade: 20,
    gradeDifference: 2,
    applicationMonth: '2026-10',
    ...overrides,
  };
}

describe('occasional revision application month navigation', () => {
  it('collects unique application months in ascending order', () => {
    const months = collectOccasionalApplicationMonths([
      createRow({ applicationMonth: '2026-10' }),
      createRow({ employeeId: 'emp-2', applicationMonth: '2026-07' }),
      createRow({ employeeId: 'emp-3', applicationMonth: '2026-10' }),
    ]);

    expect(months).toEqual(['2026-07', '2026-10']);
  });

  it('shifts only within available application months', () => {
    const available = ['2026-07', '2026-10', '2026-12'];

    expect(shiftOccasionalApplicationMonth(available, '2026-10', -1)).toBe('2026-07');
    expect(shiftOccasionalApplicationMonth(available, '2026-10', 1)).toBe('2026-12');
    expect(shiftOccasionalApplicationMonth(available, '2026-07', -1)).toBeNull();
    expect(shiftOccasionalApplicationMonth(available, '2026-12', 1)).toBeNull();
  });

  it('prefers the latest application month when no candidate matches', () => {
    const rows = [
      createRow({ changeMonth: '2026-04', applicationMonth: '2026-07' }),
      createRow({ employeeId: 'emp-2', changeMonth: '2026-07', applicationMonth: '2026-10' }),
    ];

    expect(
      resolvePreferredOccasionalApplicationMonth(
        ['2026-07', '2026-10'],
        '2026-11',
        '2026-05',
        rows
      )
    ).toBe('2026-10');
  });

  it('maps legacy stored change month to application month', () => {
    const rows = [createRow({ changeMonth: '2026-07', applicationMonth: '2026-10' })];

    expect(
      resolvePreferredOccasionalApplicationMonth(
        ['2026-10'],
        null,
        '2026-07',
        rows
      )
    ).toBe('2026-10');
  });
});
