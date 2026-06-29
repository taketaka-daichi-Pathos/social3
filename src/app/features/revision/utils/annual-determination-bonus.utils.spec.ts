import { BonusHistoryEntry } from '@features/payroll/models/bonus-history.model';
import {
  aggregateAssessmentPeriodBonusPayments,
  assessAnnualDeterminationBonusAdjustment,
  filterBonusHistoryInAssessmentPeriod,
  isBonusPaymentDateInAnnualDeterminationAssessmentPeriod,
} from '@features/revision/utils/annual-determination-bonus.utils';

function createBonusEntry(
  paymentDate: string,
  bonusAmount: number,
  overrides: Partial<BonusHistoryEntry> = {}
): BonusHistoryEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    paymentMonth: paymentDate.slice(0, 7),
    paymentDate,
    fixedWagesAtPayment: 0,
    bonusAmount,
    standardBonusAmount: bonusAmount,
    savedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('annual-determination-bonus.utils', () => {
  describe('isBonusPaymentDateInAnnualDeterminationAssessmentPeriod', () => {
    it('2026年算定基礎の判定期間は2025-07-01〜2026-06-30', () => {
      expect(isBonusPaymentDateInAnnualDeterminationAssessmentPeriod('2025-07-01', 2026)).toBe(
        true
      );
      expect(isBonusPaymentDateInAnnualDeterminationAssessmentPeriod('2026-06-30', 2026)).toBe(
        true
      );
      expect(isBonusPaymentDateInAnnualDeterminationAssessmentPeriod('2025-06-30', 2026)).toBe(
        false
      );
      expect(isBonusPaymentDateInAnnualDeterminationAssessmentPeriod('2026-10-15', 2026)).toBe(
        false
      );
    });
  });

  describe('filterBonusHistoryInAssessmentPeriod', () => {
    it('未来の賞与（2026年10月支給など）は除外する', () => {
      const bonusHistory = [
        createBonusEntry('2025-08-10', 100_000),
        createBonusEntry('2025-12-10', 100_000),
        createBonusEntry('2026-03-10', 100_000),
        createBonusEntry('2026-10-15', 100_000),
      ];

      const filtered = filterBonusHistoryInAssessmentPeriod(bonusHistory, 2026);

      expect(filtered.map((entry) => entry.paymentDate)).toEqual([
        '2025-08-10',
        '2025-12-10',
        '2026-03-10',
      ]);
    });

    it('paymentMonth が期間内でも paymentDate が期間外なら除外する', () => {
      const bonusHistory = [
        createBonusEntry('2026-10-15', 100_000, { paymentMonth: '2026-06' }),
      ];

      expect(filterBonusHistoryInAssessmentPeriod(bonusHistory, 2026)).toEqual([]);
    });
  });

  describe('assessAnnualDeterminationBonusAdjustment', () => {
    it('判定期間内が3回以下の場合は加算しない', () => {
      const bonusHistory = [
        createBonusEntry('2025-08-10', 120_000),
        createBonusEntry('2025-12-10', 120_000),
        createBonusEntry('2026-03-10', 120_000),
        createBonusEntry('2026-10-15', 120_000),
      ];

      const assessment = assessAnnualDeterminationBonusAdjustment(bonusHistory, 2026);

      expect(assessment.applied).toBe(false);
      expect(assessment.bonusPaymentCount).toBe(3);
      expect(assessment.monthlyBonusAllocation).toBe(0);
      expect(assessment.assessmentPeriodFrom).toBe('2025-07-01');
      expect(assessment.assessmentPeriodTo).toBe('2026-06-30');
    });

    it('判定期間内が4回以上の場合のみ総額を12で割って加算する', () => {
      const bonusHistory = [
        createBonusEntry('2025-08-10', 120_000),
        createBonusEntry('2025-12-10', 120_000),
        createBonusEntry('2026-03-10', 120_000),
        createBonusEntry('2026-06-10', 120_000),
        createBonusEntry('2026-10-15', 999_999),
      ];

      const assessment = assessAnnualDeterminationBonusAdjustment(bonusHistory, 2026);

      expect(assessment.applied).toBe(true);
      expect(assessment.bonusPaymentCount).toBe(4);
      expect(assessment.bonusTotalAmount).toBe(480_000);
      expect(assessment.monthlyBonusAllocation).toBe(40_000);
    });

    it('同一支給日の重複履歴は1回として数える', () => {
      const bonusHistory = [
        createBonusEntry('2025-08-10', 50_000, { id: 'a' }),
        createBonusEntry('2025-08-10', 50_000, { id: 'b' }),
        createBonusEntry('2025-12-10', 100_000),
        createBonusEntry('2026-03-10', 100_000),
        createBonusEntry('2026-06-10', 100_000),
      ];

      const payments = aggregateAssessmentPeriodBonusPayments(bonusHistory, 2026);

      expect(payments).toEqual([
        { paymentDate: '2025-08-10', bonusAmount: 100_000 },
        { paymentDate: '2025-12-10', bonusAmount: 100_000 },
        { paymentDate: '2026-03-10', bonusAmount: 100_000 },
        { paymentDate: '2026-06-10', bonusAmount: 100_000 },
      ]);
      expect(assessAnnualDeterminationBonusAdjustment(bonusHistory, 2026).bonusPaymentCount).toBe(4);
    });
  });
});
