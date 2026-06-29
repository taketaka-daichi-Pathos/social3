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

/** 算定基礎の賞与判定期間内か（支給日 YYYY-MM-DD のみ。paymentMonth は使用しない） */
export function isBonusPaymentDateInAnnualDeterminationAssessmentPeriod(
  paymentDate: string,
  targetYear: number
): boolean {
  const normalized = normalizeBonusPaymentDate(paymentDate);
  if (!normalized) {
    return false;
  }

  const { from, to } = getAnnualDeterminationBonusAssessmentPeriod(targetYear);
  return normalized >= from && normalized <= to;
}

export function filterBonusHistoryInAssessmentPeriod(
  bonusHistory: BonusHistoryEntry[] | undefined,
  targetYear: number
): BonusHistoryEntry[] {
  return (bonusHistory ?? []).filter((entry) =>
    isBonusPaymentDateInAnnualDeterminationAssessmentPeriod(entry.paymentDate, targetYear)
  );
}

interface AssessmentPeriodBonusPayment {
  paymentDate: string;
  bonusAmount: number;
}

/** 判定期間内の賞与を支給日単位で集約（同一支給日は1回としてカウント） */
export function aggregateAssessmentPeriodBonusPayments(
  bonusHistory: BonusHistoryEntry[] | undefined,
  targetYear: number
): AssessmentPeriodBonusPayment[] {
  const totalsByPaymentDate = new Map<string, number>();

  for (const entry of filterBonusHistoryInAssessmentPeriod(bonusHistory, targetYear)) {
    const paymentDate = normalizeBonusPaymentDate(entry.paymentDate);
    if (!paymentDate) {
      continue;
    }

    const bonusAmount = Math.max(0, Math.floor(Number(entry.bonusAmount) || 0));
    totalsByPaymentDate.set(paymentDate, (totalsByPaymentDate.get(paymentDate) ?? 0) + bonusAmount);
  }

  return [...totalsByPaymentDate.entries()]
    .filter(([, bonusAmount]) => bonusAmount > 0)
    .map(([paymentDate, bonusAmount]) => ({ paymentDate, bonusAmount }))
    .sort((left, right) => left.paymentDate.localeCompare(right.paymentDate));
}

export function assessAnnualDeterminationBonusAdjustment(
  bonusHistory: BonusHistoryEntry[] | undefined,
  targetYear: number
): AnnualDeterminationBonusAssessment {
  const { from, to } = getAnnualDeterminationBonusAssessmentPeriod(targetYear);
  const payments = aggregateAssessmentPeriodBonusPayments(bonusHistory, targetYear);
  const bonusPaymentCount = payments.length;
  const bonusTotalAmount = payments.reduce((sum, payment) => sum + payment.bonusAmount, 0);

  const debugResult =
    bonusPaymentCount >= FREQUENT_BONUS_MIN_PAYMENT_COUNT
      ? { applied: true, monthlyBonusAllocation: Math.floor(bonusTotalAmount / 12) }
      : { applied: false, reason: '対象外（判定期間内の支給回数が4回未満）' };

  console.log('[AnnualDeterminationBonus] 年4回以上賞与の加算判定', {
    targetYear,
    assessmentPeriod: { from, to },
    bonusPaymentCount,
    bonusPaymentDates: payments.map((payment) => payment.paymentDate),
    bonusPayments: payments,
    result: debugResult,
  });

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
