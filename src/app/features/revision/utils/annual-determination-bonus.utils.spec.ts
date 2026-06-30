import { BonusHistoryEntry } from '@features/payroll/models/bonus-history.model';
import {
  aggregateAssessmentPeriodBonusPayments,
  assessAnnualDeterminationBonusAdjustment,
  assessOccasionalRevisionBonusAdjustment,
  filterBonusHistoryInAssessmentPeriod,
  getOccasionalRevisionBonusAssessmentPeriod,
  isBonusPaymentDateInAnnualDeterminationAssessmentPeriod,
  resolveOccasionalRevisionAverageWithBonus,
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

  describe('getOccasionalRevisionBonusAssessmentPeriod', () => {
    it('2月改定は前年2月1日〜当年1月末日を判定期間とする', () => {
      expect(getOccasionalRevisionBonusAssessmentPeriod('2026-02')).toEqual({
        from: '2025-02-01',
        to: '2026-01-31',
      });
    });

    it('10月改定は前年10月1日〜当年9月末日を判定期間とする', () => {
      expect(getOccasionalRevisionBonusAssessmentPeriod('2026-10')).toEqual({
        from: '2025-10-01',
        to: '2026-09-30',
      });
    });
  });

  describe('assessOccasionalRevisionBonusAdjustment', () => {
    const quarterlyBonusesAcrossYearBoundary = [
      createBonusEntry('2025-02-10', 120_000),
      createBonusEntry('2025-05-10', 120_000),
      createBonusEntry('2025-08-10', 120_000),
      createBonusEntry('2025-11-10', 120_000),
    ];

    it('2月改定では年跨ぎの直近12ヶ月で4回以上の賞与を加算する', () => {
      const assessment = assessOccasionalRevisionBonusAdjustment(
        quarterlyBonusesAcrossYearBoundary,
        '2026-02'
      );

      expect(assessment.applied).toBe(true);
      expect(assessment.bonusPaymentCount).toBe(4);
      expect(assessment.bonusTotalAmount).toBe(480_000);
      expect(assessment.monthlyBonusAllocation).toBe(40_000);
      expect(assessment.assessmentPeriodFrom).toBe('2025-02-01');
      expect(assessment.assessmentPeriodTo).toBe('2026-01-31');
    });

    it('算定基礎の判定期間では同じ賞与実績が4回未満になる（年跨ぎ漏れの再現）', () => {
      const assessment = assessAnnualDeterminationBonusAdjustment(
        quarterlyBonusesAcrossYearBoundary,
        2026
      );

      expect(assessment.applied).toBe(false);
      expect(assessment.bonusPaymentCount).toBe(2);
    });

    it('10月改定でも直近12ヶ月の賞与を正しく加算する', () => {
      const bonusHistory = [
        createBonusEntry('2025-10-10', 120_000),
        createBonusEntry('2026-01-10', 120_000),
        createBonusEntry('2026-04-10', 120_000),
        createBonusEntry('2026-07-10', 120_000),
      ];

      const assessment = assessOccasionalRevisionBonusAdjustment(bonusHistory, '2026-10');

      expect(assessment.applied).toBe(true);
      expect(assessment.bonusPaymentCount).toBe(4);
      expect(assessment.assessmentPeriodFrom).toBe('2025-10-01');
      expect(assessment.assessmentPeriodTo).toBe('2026-09-30');
    });
  });

  describe('resolveOccasionalRevisionAverageWithBonus', () => {
    it('給与平均に賞与の12等分を加算する', () => {
      const bonusHistory = [
        createBonusEntry('2025-02-10', 120_000),
        createBonusEntry('2025-05-10', 120_000),
        createBonusEntry('2025-08-10', 120_000),
        createBonusEntry('2025-11-10', 120_000),
      ];

      const { averagePayment, frequentBonusAdjustment } = resolveOccasionalRevisionAverageWithBonus(
        300_000,
        bonusHistory,
        '2026-02'
      );

      expect(averagePayment).toBe(340_000);
      expect(frequentBonusAdjustment.applied).toBe(true);
      expect(frequentBonusAdjustment.monthlyBonusAllocation).toBe(40_000);
    });
  });
});
