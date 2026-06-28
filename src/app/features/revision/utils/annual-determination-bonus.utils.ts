import { BonusHistoryEntry } from '@features/payroll/models/bonus-history.model';
import { parseYearMonthKey } from '@features/payroll/utils/compensation.utils';
import { AnnualDeterminationFrequentBonusAdjustment } from '@features/revision/models/revision.model';
import { normalizeBonusPaymentDate } from '@features/payroll/utils/bonus-history.utils';
export const FREQUENT_BONUS_MIN_PAYMENT_COUNT = 4;

export interface AnnualDeterminationBonusAssessment {
  applied: boolean;
  bonusPaymentCount: number;
  bonusTotalAmount: number;
  monthlyBonusAllocation: number;
  assessmentPeriodFrom: string;
  assessmentPeriodTo: string;
  payrollOnlyAverage: number | null;
}

/** 算定基礎の賞与判定期間（前年7/1〜当年6/30） */
export function getAnnualDeterminationBonusAssessmentPeriod(targetYear: number): {
  from: string;
  to: string;
} {
  return {
    from: `${targetYear - 1}-07-01`,
    to: `${targetYear}-06-30`,
  };
}

export function filterBonusHistoryInAssessmentPeriod(
  bonusHistory: BonusHistoryEntry[] | undefined,
  targetYear: number
): BonusHistoryEntry[] {
  const { from, to } = getAnnualDeterminationBonusAssessmentPeriod(targetYear);

  return (bonusHistory ?? []).filter((entry) => {
    const paymentDate = normalizeBonusPaymentDate(entry.paymentDate);
    if (!paymentDate) {
      return false;
    }

    return paymentDate >= from && paymentDate <= to;
  });
}

export function assessAnnualDeterminationBonusAdjustment(
  bonusHistory: BonusHistoryEntry[] | undefined,
  targetYear: number
): AnnualDeterminationBonusAssessment {
  const { from, to } = getAnnualDeterminationBonusAssessmentPeriod(targetYear);
  const entries = filterBonusHistoryInAssessmentPeriod(bonusHistory, targetYear);
  const bonusPaymentCount = entries.length;
  const bonusTotalAmount = entries.reduce(
    (sum, entry) => sum + Math.max(0, Math.floor(Number(entry.bonusAmount) || 0)),
    0
  );

  if (bonusPaymentCount < FREQUENT_BONUS_MIN_PAYMENT_COUNT) {
    return {
      applied: false,
      bonusPaymentCount,
      bonusTotalAmount,
      monthlyBonusAllocation: 0,
      assessmentPeriodFrom: from,
      assessmentPeriodTo: to,
      payrollOnlyAverage: null,
    };
  }

  return {
    applied: true,
    bonusPaymentCount,
    bonusTotalAmount,
    monthlyBonusAllocation: Math.floor(bonusTotalAmount / 12),
    assessmentPeriodFrom: from,
    assessmentPeriodTo: to,
    payrollOnlyAverage: null,
  };
}

export function formatAnnualDeterminationBonusPeriodLabel(targetYear: number): string {
  const { from, to } = getAnnualDeterminationBonusAssessmentPeriod(targetYear);
  return `${from} 〜 ${to}`;
}

/** 年4回以上賞与の12等分加算額（算定基礎・随時改定共通） */
export function calculateBonusTwelfthAmount(
  bonusHistory: BonusHistoryEntry[] | undefined,
  targetYear: number
): number {
  const assessment = assessAnnualDeterminationBonusAdjustment(bonusHistory, targetYear);
  return assessment.applied ? assessment.monthlyBonusAllocation : 0;
}

export function toFrequentBonusAdjustment(
  assessment: AnnualDeterminationBonusAssessment,
  payrollOnlyAverage: number | null
): AnnualDeterminationFrequentBonusAdjustment {
  return {
    applied: assessment.applied,
    bonusPaymentCount: assessment.bonusPaymentCount,
    bonusTotalAmount: assessment.bonusTotalAmount,
    monthlyBonusAllocation: assessment.monthlyBonusAllocation,
    assessmentPeriodFrom: assessment.assessmentPeriodFrom,
    assessmentPeriodTo: assessment.assessmentPeriodTo,
    payrollOnlyAverage,
  };
}

/**
 * 随時改定の平均報酬月額（3ヶ月給与平均 + 年4回以上賞与の1/12加算）。
 * 判定期間・加算ロジックは算定基礎と同一。
 */
export function resolveOccasionalRevisionAverageWithBonus(
  payrollOnlyAverage: number,
  bonusHistory: BonusHistoryEntry[] | undefined,
  changeMonth: string
): {
  averagePayment: number;
  frequentBonusAdjustment: AnnualDeterminationFrequentBonusAdjustment;
} {
  const targetYear = parseYearMonthKey(changeMonth).year;
  const bonusAssessment = assessAnnualDeterminationBonusAdjustment(bonusHistory, targetYear);
  const monthlyBonusAddition = bonusAssessment.applied ? bonusAssessment.monthlyBonusAllocation : 0;

  return {
    averagePayment: Math.round(payrollOnlyAverage + monthlyBonusAddition),
    frequentBonusAdjustment: toFrequentBonusAdjustment(bonusAssessment, payrollOnlyAverage),
  };
}

export function enrichRevisionMonthDetailsWithBonus<
  T extends {
    yearMonth: string;
    baseDays: number;
    totalPayment: number;
    included: boolean;
    note: string | null;
  },
>(monthDetails: T[], monthlyBonusAllocation: number): Array<
  T & {
    bonusAddition: number;
    adjustedTotalPayment: number;
  }
> {
  const bonusAddition = monthlyBonusAllocation > 0 ? monthlyBonusAllocation : 0;

  return monthDetails.map((month) => ({
    ...month,
    bonusAddition,
    adjustedTotalPayment: month.totalPayment + bonusAddition,
  }));
}
