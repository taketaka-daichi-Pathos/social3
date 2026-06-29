export type RevisionStatus = 'pending' | 'eligible' | 'excluded' | 'applied';

export type AnnualExclusionReason =
  | 'insufficient_base_days'
  | 'hired_after_june'
  | 'occasional_revision_scheduled'
  | 'missing_payroll'
  | 'negative_average_payment';

export type OccasionalExclusionReason =
  | 'no_fixed_wage_change'
  | 'insufficient_base_days'
  | 'grade_difference_under_2'
  | 'no_grade_change'
  | 'fixed_wage_grade_direction_mismatch'
  | 'missing_payroll'
  | 'negative_average_payment';

import { PayrollAdjustmentType } from '@features/payroll/models/payroll-adjustment.model';

export interface PayrollMonthSnapshot {
  yearMonth: string;
  baseDays: number;
  /** 算定用ベース（固定賃金＋非固定賃金。調整額は含めない） */
  totalPayment: number;
  fixedWages: number;
  nonFixedWages: number;
  adjustmentAmount: number;
  adjustmentType: PayrollAdjustmentType | null;
  adjustmentTargetMonth: string;
  locked: boolean;
}

export interface EffectiveStandardRemuneration {
  healthStandard: number;
  pensionStandard: number;
  healthGrade: number | null;
  pensionGrade: number | null;
  source: 'employee_master' | 'annual_determination' | 'occasional_revision' | 'revision_history';
  applicationMonth: string | null;
}

export interface AnnualDeterminationMonthDetail {
  yearMonth: string;
  baseDays: number;
  /** 月次給与の報酬月額（固定賃金＋非固定賃金。調整額は含めない） */
  totalPayment: number;
  /** 年4回以上賞与の12等分加算額（該当時のみ） */
  bonusAddition: number;
  /** 算定基礎計算に用いる報酬月額（給与 + 賞与加算） */
  adjustedTotalPayment: number;
  included: boolean;
  note: string | null;
}

export interface AnnualDeterminationFrequentBonusAdjustment {
  applied: boolean;
  bonusPaymentCount: number;
  bonusTotalAmount: number;
  monthlyBonusAllocation: number;
  assessmentPeriodFrom: string;
  assessmentPeriodTo: string;
  payrollOnlyAverage: number | null;
}

export interface AnnualDeterminationResult {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  targetYear: number;
  status: RevisionStatus;
  exclusionReasons: AnnualExclusionReason[];
  exclusionLabels: string[];
  /** 7・8・9月随時改定により算定基礎から除外された場合の適用月（YYYY-MM） */
  occasionalPriorityApplicationMonth: string | null;
  validMonths: string[];
  monthDetails: AnnualDeterminationMonthDetail[];
  /** 年4回以上の賞与加算が適用された場合の内訳 */
  frequentBonusAdjustment: AnnualDeterminationFrequentBonusAdjustment;
  averagePayment: number | null;
  currentHealthStandard: number;
  currentPensionStandard: number;
  currentHealthGrade: number | null;
  currentPensionGrade: number | null;
  proposedHealthStandard: number | null;
  proposedPensionStandard: number | null;
  proposedHealthGrade: number | null;
  proposedPensionGrade: number | null;
  applicationMonth: string;
  hasGradeChange: boolean;
}

export interface OccasionalRevisionMonthDetail {
  yearMonth: string;
  baseDays: number;
  /** 月次給与の報酬月額（固定賃金＋非固定賃金。調整額は含めない） */
  totalPayment: number;
  /** 年4回以上賞与の12等分加算額（該当時のみ） */
  bonusAddition: number;
  /** 随時改定計算に用いる報酬月額（給与 + 賞与加算） */
  adjustedTotalPayment: number;
  included: boolean;
  note: string | null;
}

export interface OccasionalRevisionResult {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  changeMonth: string;
  status: RevisionStatus;
  /** 起算月に固定的賃金の変動があったか */
  isFixedWageChanged: boolean;
  /** 随時改定を適用可能か */
  isEligible: boolean;
  /** 適用不可の場合のユーザー向け理由 */
  ineligibleReason: string | null;
  exclusionReasons: OccasionalExclusionReason[];
  exclusionLabels: string[];
  targetMonths: string[];
  monthDetails: OccasionalRevisionMonthDetail[];
  /** 年4回以上の賞与加算が適用された場合の内訳 */
  frequentBonusAdjustment: AnnualDeterminationFrequentBonusAdjustment;
  averagePayment: number | null;
  currentHealthStandard: number;
  currentPensionStandard: number;
  currentHealthGrade: number | null;
  currentPensionGrade: number | null;
  proposedHealthStandard: number | null;
  proposedPensionStandard: number | null;
  proposedHealthGrade: number | null;
  proposedPensionGrade: number | null;
  gradeDifference: number | null;
  applicationMonth: string | null;
}
