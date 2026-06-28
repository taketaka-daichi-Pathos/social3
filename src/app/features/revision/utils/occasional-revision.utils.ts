import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import {
  getNextYearMonthKey,
  parseYearMonthKey,
} from '@features/payroll/utils/compensation.utils';

/** 随時改定の原則となる等級差（2等級以上） */
export const OCCASIONAL_MIN_GRADE_DIFF = 2;

export const OCCASIONAL_HEALTH_MIN_GRADE = 1;
export const OCCASIONAL_HEALTH_MAX_GRADE = 50;
export const OCCASIONAL_PENSION_MIN_GRADE = 1;
export const OCCASIONAL_PENSION_MAX_GRADE = 32;

export type OccasionalInsuranceGradeEligibility = 'eligible' | 'mismatch' | 'insufficient';

export type OccasionalRevisionCandidateOutcome = 'eligible' | 'excluded' | 'skip';

export interface OccasionalRevisionCandidateEvaluation {
  outcome: OccasionalRevisionCandidateOutcome;
  reason: string;
  gradeDifference: number;
  /** outcome が excluded のときにセット */
  exclusionReason?: 'no_grade_change' | 'grade_difference_under_2' | 'fixed_wage_grade_direction_mismatch';
}

/**
 * スナップショットの固定的賃金（基本給＋固定手当）を安全に数値化する。
 */
export function normalizeSnapshotFixedWages(snapshot: PayrollMonthSnapshot | undefined): number {
  if (!snapshot) {
    return Number.NaN;
  }

  const fixed = Number(snapshot.fixedWages);
  if (Number.isFinite(fixed)) {
    return fixed;
  }

  const total = Number(snapshot.totalPayment ?? 0);
  const nonFixed = Number(snapshot.nonFixedWages ?? 0);
  const derived = total - nonFixed;

  return Number.isFinite(derived) ? derived : Number.NaN;
}

/**
 * 健康保険・厚生年金の上下限等級における1等級差の特例。
 * 例: 健保 49→50、厚年 31→32 など。
 */
export function isOccasionalBoundaryOneGradeChange(
  currentGrade: number,
  proposedGrade: number,
  minGrade: number,
  maxGrade: number
): boolean {
  if (Math.abs(proposedGrade - currentGrade) !== 1) {
    return false;
  }

  return (
    (currentGrade === minGrade && proposedGrade === minGrade + 1) ||
    (currentGrade === minGrade + 1 && proposedGrade === minGrade) ||
    (currentGrade === maxGrade - 1 && proposedGrade === maxGrade) ||
    (currentGrade === maxGrade && proposedGrade === maxGrade - 1)
  );
}

/** 2等級差以上、または上下限における1等級差の特例を満たすか（方向は別途判定） */
export function meetsOccasionalGradeDifferenceRequirement(
  currentHealthGrade: number | null,
  currentPensionGrade: number | null,
  proposedHealthGrade: number | null,
  proposedPensionGrade: number | null,
  gradeDifference: number
): boolean {
  if (gradeDifference >= OCCASIONAL_MIN_GRADE_DIFF) {
    return true;
  }

  if (
    currentHealthGrade != null &&
    proposedHealthGrade != null &&
    isOccasionalBoundaryOneGradeChange(
      currentHealthGrade,
      proposedHealthGrade,
      OCCASIONAL_HEALTH_MIN_GRADE,
      OCCASIONAL_HEALTH_MAX_GRADE
    )
  ) {
    return true;
  }

  if (
    currentPensionGrade != null &&
    proposedPensionGrade != null &&
    isOccasionalBoundaryOneGradeChange(
      currentPensionGrade,
      proposedPensionGrade,
      OCCASIONAL_PENSION_MIN_GRADE,
      OCCASIONAL_PENSION_MAX_GRADE
    )
  ) {
    return true;
  }

  return false;
}

/**
 * 保険種別ごとの随時改定可否（方向＋等級差）。
 * - 昇給かつ gradeDiff >= 2 → eligible
 * - 降給かつ gradeDiff <= -2 → eligible
 * - 上下限1等級差かつ方向一致 → eligible
 * - 2等級以上の逆方向 → mismatch
 * - 上下限1等級差かつ逆方向 → mismatch
 */
export function evaluateOccasionalInsuranceGradeEligibility(
  fixedWageDiff: number,
  currentGrade: number | null,
  proposedGrade: number | null,
  minGrade: number,
  maxGrade: number
): OccasionalInsuranceGradeEligibility {
  if (currentGrade == null || proposedGrade == null) {
    return 'insufficient';
  }

  const gradeDiff = proposedGrade - currentGrade;

  if (fixedWageDiff > 0 && gradeDiff >= OCCASIONAL_MIN_GRADE_DIFF) {
    return 'eligible';
  }

  if (fixedWageDiff < 0 && gradeDiff <= -OCCASIONAL_MIN_GRADE_DIFF) {
    return 'eligible';
  }

  if (isOccasionalBoundaryOneGradeChange(currentGrade, proposedGrade, minGrade, maxGrade)) {
    if (fixedWageDiff > 0 && gradeDiff > 0) {
      return 'eligible';
    }
    if (fixedWageDiff < 0 && gradeDiff < 0) {
      return 'eligible';
    }
    return 'mismatch';
  }

  if (Math.abs(gradeDiff) >= OCCASIONAL_MIN_GRADE_DIFF) {
    if ((fixedWageDiff > 0 && gradeDiff < 0) || (fixedWageDiff < 0 && gradeDiff > 0)) {
      return 'mismatch';
    }
  }

  return 'insufficient';
}

export function calculateOccasionalGradeDifference(
  currentHealthGrade: number | null,
  currentPensionGrade: number | null,
  proposedHealthGrade: number | null,
  proposedPensionGrade: number | null
): number {
  return Math.max(
    Math.abs((proposedHealthGrade ?? 0) - (currentHealthGrade ?? 0)),
    Math.abs((proposedPensionGrade ?? 0) - (currentPensionGrade ?? 0))
  );
}

/** 固定的賃金変動と等級変動の総合判定 */
export function evaluateOccasionalRevisionCandidate(
  fixedWageDiff: number,
  currentHealthGrade: number | null,
  currentPensionGrade: number | null,
  proposedHealthGrade: number | null,
  proposedPensionGrade: number | null
): OccasionalRevisionCandidateEvaluation {
  const gradeDifference = calculateOccasionalGradeDifference(
    currentHealthGrade,
    currentPensionGrade,
    proposedHealthGrade,
    proposedPensionGrade
  );

  if (!Number.isFinite(fixedWageDiff) || fixedWageDiff === 0) {
    return { outcome: 'skip', reason: '固定的賃金の変動なし', gradeDifference };
  }

  const healthResult = evaluateOccasionalInsuranceGradeEligibility(
    fixedWageDiff,
    currentHealthGrade,
    proposedHealthGrade,
    OCCASIONAL_HEALTH_MIN_GRADE,
    OCCASIONAL_HEALTH_MAX_GRADE
  );
  const pensionResult = evaluateOccasionalInsuranceGradeEligibility(
    fixedWageDiff,
    currentPensionGrade,
    proposedPensionGrade,
    OCCASIONAL_PENSION_MIN_GRADE,
    OCCASIONAL_PENSION_MAX_GRADE
  );

  if (healthResult === 'mismatch' || pensionResult === 'mismatch') {
    return {
      outcome: 'excluded',
      reason: '方向不一致',
      gradeDifference,
      exclusionReason: 'fixed_wage_grade_direction_mismatch',
    };
  }

  if (healthResult === 'eligible' || pensionResult === 'eligible') {
    return { outcome: 'eligible', reason: '改定対象', gradeDifference };
  }

  if (gradeDifference === 0) {
    return {
      outcome: 'excluded',
      reason: '等級変動がないため変更なし',
      gradeDifference,
      exclusionReason: 'no_grade_change',
    };
  }

  return {
    outcome: 'excluded',
    reason: '2等級差未満',
    gradeDifference,
    exclusionReason: 'grade_difference_under_2',
  };
}

/**
 * @deprecated evaluateOccasionalRevisionCandidate を使用してください
 */
export function hasOccasionalFixedWageGradeDirectionMismatch(
  fixedWageDiff: number,
  currentHealthGrade: number | null,
  currentPensionGrade: number | null,
  proposedHealthGrade: number | null,
  proposedPensionGrade: number | null
): boolean {
  const evaluation = evaluateOccasionalRevisionCandidate(
    fixedWageDiff,
    currentHealthGrade,
    currentPensionGrade,
    proposedHealthGrade,
    proposedPensionGrade
  );

  return evaluation.outcome === 'excluded' && evaluation.reason === '方向不一致';
}

/** 随時改定の変動月（起算月）から新等級の適用月（変動月の3ヶ月後）を算出する */
export function resolveOccasionalRevisionApplicationMonth(changeMonth: string): string {
  let applicationMonth = changeMonth;

  for (let index = 0; index < 3; index += 1) {
    applicationMonth = getNextYearMonthKey(applicationMonth);
  }

  return applicationMonth;
}

/**
 * 随時改定の期間ラベル（例: 2025年10月 適用分（7月変動））
 * 内部の月次キーは変動月（changeMonth）を基準とする。
 */
export function formatOccasionalRevisionPeriodLabel(changeMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(changeMonth)) {
    return '—';
  }

  const applicationMonth = resolveOccasionalRevisionApplicationMonth(changeMonth);
  const { year: applicationYear, month: applicationMonthNumber } =
    parseYearMonthKey(applicationMonth);
  const { month: changeMonthNumber } = parseYearMonthKey(changeMonth);

  return `${applicationYear}年${applicationMonthNumber}月 適用分（${changeMonthNumber}月変動）`;
}

export function logOccasionalRevisionDebug(payload: Record<string, unknown>): void {
  console.log('[OccasionalRevision]', payload);
}
