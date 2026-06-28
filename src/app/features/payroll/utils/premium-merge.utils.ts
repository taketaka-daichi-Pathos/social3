import {
  PremiumShare,
  SocialInsurancePremiumBreakdown,
} from '@core/models/social-insurance.model';

const ZERO_PREMIUM_SHARE: PremiumShare = {
  employeeShare: 0,
  employerShare: 0,
  total: 0,
};

export function emptyPremiumBreakdown(): SocialInsurancePremiumBreakdown {
  return {
    health: { ...ZERO_PREMIUM_SHARE },
    longTermCare: { ...ZERO_PREMIUM_SHARE },
    pension: { ...ZERO_PREMIUM_SHARE },
  };
}

export function addPremiumShares(left: PremiumShare, right: PremiumShare): PremiumShare {
  return {
    employeeShare: left.employeeShare + right.employeeShare,
    employerShare: left.employerShare + right.employerShare,
    total: left.total + right.total,
  };
}

export function mergePremiumBreakdowns(
  left: SocialInsurancePremiumBreakdown,
  right: SocialInsurancePremiumBreakdown
): SocialInsurancePremiumBreakdown {
  return {
    health: addPremiumShares(left.health, right.health),
    longTermCare: addPremiumShares(left.longTermCare, right.longTermCare),
    pension: addPremiumShares(left.pension, right.pension),
  };
}

export function addPremiumBreakdownToCumulative(
  totals: {
    healthEmployee: number;
    healthEmployer: number;
    longTermCareEmployee: number;
    longTermCareEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    employeeShare: number;
    employerShare: number;
    total: number;
  },
  premiums: SocialInsurancePremiumBreakdown,
  rowTotals: { employeeShare: number; employerShare: number; total: number }
): void {
  totals.healthEmployee += premiums.health.employeeShare;
  totals.healthEmployer += premiums.health.employerShare;
  totals.longTermCareEmployee += premiums.longTermCare.employeeShare;
  totals.longTermCareEmployer += premiums.longTermCare.employerShare;
  totals.pensionEmployee += premiums.pension.employeeShare;
  totals.pensionEmployer += premiums.pension.employerShare;
  totals.employeeShare += rowTotals.employeeShare;
  totals.employerShare += rowTotals.employerShare;
  totals.total += rowTotals.total;
}
