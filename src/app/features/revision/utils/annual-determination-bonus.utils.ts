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

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

/**
 * 随時改定の賞与判定期間（変動月基準の直近12ヶ月）。
 * 例: 変動月 2026-02 → 2025-02-01 〜 2026-01-31（前年同月1日〜変動月の前月末日）
 */
export function getOccasionalRevisionBonusAssessmentPeriod(changeMonth: string): {
  from: string;
  to: string;
} {
  const { year, month } = parseYearMonthKey(changeMonth);
  const from = `${year - 1}-${String(month).padStart(2, '0')}-01`;
  const to = formatIsoDate(new Date(year, month, 0));
  return { from, to };
}

/** 指定判定期間内か（支給日 YYYY-MM-DD のみ。paymentMonth は使用しない） */
export function isBonusPaymentDateInAssessmentPeriod(
  paymentDate: string,
  from: string,
  to: string
): boolean {
  const normalized = normalizeBonusPaymentDate(paymentDate);
  if (!normalized) {
    return false;
  }

  return normalized >= from && normalized <= to;
}

/** 算定基礎の賞与判定期間内か（支給日 YYYY-MM-DD のみ。paymentMonth は使用しない） */
export function isBonusPaymentDateInAnnualDeterminationAssessmentPeriod(
  paymentDate: string,
  targetYear: number
): boolean {
  const { from, to } = getAnnualDeterminationBonusAssessmentPeriod(targetYear);
  return isBonusPaymentDateInAssessmentPeriod(paymentDate, from, to);
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

export function filterBonusHistoryInPeriod(
  bonusHistory: BonusHistoryEntry[] | undefined,
  from: string,
  to: string
): BonusHistoryEntry[] {
  return (bonusHistory ?? []).filter((entry) =>
    isBonusPaymentDateInAssessmentPeriod(entry.paymentDate, from, to)
  );
}

/** 判定期間内の賞与を支給日単位で集約（同一支給日は1回としてカウント） */
export function aggregateBonusPaymentsInPeriod(
  bonusHistory: BonusHistoryEntry[] | undefined,
  from: string,
  to: string
): AssessmentPeriodBonusPayment[] {
  const totalsByPaymentDate = new Map<string, number>();

  for (const entry of filterBonusHistoryInPeriod(bonusHistory, from, to)) {
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

/** 算定基礎の判定期間内の賞与を支給日単位で集約（同一支給日は1回としてカウント） */
export function aggregateAssessmentPeriodBonusPayments(
  bonusHistory: BonusHistoryEntry[] | undefined,
  targetYear: number
): AssessmentPeriodBonusPayment[] {
  const { from, to } = getAnnualDeterminationBonusAssessmentPeriod(targetYear);
  return aggregateBonusPaymentsInPeriod(bonusHistory, from, to);
}

function buildBonusAssessment(
  bonusHistory: BonusHistoryEntry[] | undefined,
  from: string,
  to: string,
  debugContext: Record<string, unknown>
): AnnualDeterminationBonusAssessment {
  const payments = aggregateBonusPaymentsInPeriod(bonusHistory, from, to);
  const bonusPaymentCount = payments.length;
  const bonusTotalAmount = payments.reduce((sum, payment) => sum + payment.bonusAmount, 0);

  const debugResult =
    bonusPaymentCount >= FREQUENT_BONUS_MIN_PAYMENT_COUNT
      ? { applied: true, monthlyBonusAllocation: Math.floor(bonusTotalAmount / 12) }
      : { applied: false, reason: '対象外（判定期間内の支給回数が4回未満）' };

  console.log('[AnnualDeterminationBonus] 年4回以上賞与の加算判定', {
    ...debugContext,
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

export function assessAnnualDeterminationBonusAdjustment(
  bonusHistory: BonusHistoryEntry[] | undefined,
  targetYear: number
): AnnualDeterminationBonusAssessment {
  const { from, to } = getAnnualDeterminationBonusAssessmentPeriod(targetYear);
  return buildBonusAssessment(bonusHistory, from, to, { targetYear, revisionType: 'annual' });
}

/** 随時改定の年4回以上賞与加算判定（変動月基準の直近12ヶ月） */
export function assessOccasionalRevisionBonusAdjustment(
  bonusHistory: BonusHistoryEntry[] | undefined,
  changeMonth: string
): AnnualDeterminationBonusAssessment {
  const { from, to } = getOccasionalRevisionBonusAssessmentPeriod(changeMonth);
  return buildBonusAssessment(bonusHistory, from, to, { changeMonth, revisionType: 'occasional' });
}

export function formatAnnualDeterminationBonusPeriodLabel(targetYear: number): string {
  const { from, to } = getAnnualDeterminationBonusAssessmentPeriod(targetYear);
  return `${from} 〜 ${to}`;
}

/** 年4回以上賞与の12等分加算額（算定基礎用） */
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
 * 判定期間は変動月基準の直近12ヶ月（算定基礎の7月〜翌6月とは異なる）。
 */
export function resolveOccasionalRevisionAverageWithBonus(
  payrollOnlyAverage: number,
  bonusHistory: BonusHistoryEntry[] | undefined,
  changeMonth: string
): {
  averagePayment: number;
  frequentBonusAdjustment: AnnualDeterminationFrequentBonusAdjustment;
} {
  const bonusAssessment = assessOccasionalRevisionBonusAdjustment(bonusHistory, changeMonth);
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
