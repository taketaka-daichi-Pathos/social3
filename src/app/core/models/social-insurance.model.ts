export interface InsuranceGradeResult {
  grade: number;
  standardMonthlyRemuneration: number;
}

export interface PremiumShare {
  employeeShare: number;
  employerShare: number;
  total: number;
}

export interface SocialInsurancePremiumBreakdown {
  health: PremiumShare;
  longTermCare: PremiumShare;
  pension: PremiumShare;
}

export interface EmployeeInsuranceSummary {
  age: number;
  isLongTermCareInsured: boolean;
  healthGrade: InsuranceGradeResult | null;
  pensionGrade: InsuranceGradeResult | null;
  premiums: SocialInsurancePremiumBreakdown | null;
}
