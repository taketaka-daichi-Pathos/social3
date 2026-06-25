export type RevisionStatus = 'pending' | 'eligible' | 'excluded' | 'applied';

export type AnnualExclusionReason =
  | 'insufficient_base_days'
  | 'hired_after_june'
  | 'occasional_revision_scheduled'
  | 'missing_payroll';

export type OccasionalExclusionReason =
  | 'no_fixed_wage_change'
  | 'insufficient_base_days'
  | 'grade_difference_under_2'
  | 'missing_payroll';

export interface PayrollMonthSnapshot {
  yearMonth: string;
  baseDays: number;
  totalPayment: number;
  fixedWages: number;
  nonFixedWages: number;
  locked: boolean;
}

export interface EffectiveStandardRemuneration {
  healthStandard: number;
  pensionStandard: number;
  healthGrade: number | null;
  pensionGrade: number | null;
  source: 'employee_master' | 'annual_determination' | 'occasional_revision';
  applicationMonth: string | null;
}

export interface AnnualDeterminationResult {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  targetYear: number;
  status: RevisionStatus;
  exclusionReasons: AnnualExclusionReason[];
  exclusionLabels: string[];
  validMonths: string[];
  monthDetails: Array<{
    yearMonth: string;
    baseDays: number;
    totalPayment: number;
    included: boolean;
    note: string | null;
  }>;
  averagePayment: number | null;
  currentHealthStandard: number;
  currentPensionStandard: number;
  proposedHealthStandard: number | null;
  proposedPensionStandard: number | null;
  proposedHealthGrade: number | null;
  proposedPensionGrade: number | null;
  applicationMonth: string;
  hasGradeChange: boolean;
}

export interface OccasionalRevisionResult {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  changeMonth: string;
  status: RevisionStatus;
  exclusionReasons: OccasionalExclusionReason[];
  exclusionLabels: string[];
  targetMonths: string[];
  monthDetails: Array<{
    yearMonth: string;
    baseDays: number;
    totalPayment: number;
    included: boolean;
    note: string | null;
  }>;
  averagePayment: number | null;
  currentHealthStandard: number;
  currentPensionStandard: number;
  proposedHealthStandard: number | null;
  proposedPensionStandard: number | null;
  proposedHealthGrade: number | null;
  proposedPensionGrade: number | null;
  gradeDifference: number | null;
  applicationMonth: string | null;
}
