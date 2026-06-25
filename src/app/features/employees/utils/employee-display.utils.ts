import { EmployeeInsuranceSummary } from '@core/models/social-insurance.model';

export interface PremiumTotals {
  employeeShare: number;
  employerShare: number;
  total: number;
}

export function formatGradeLabel(summary: EmployeeInsuranceSummary): string {
  const health = summary.healthGrade?.grade ?? '—';
  const pension = summary.pensionGrade?.grade ?? '—';
  return `健保${health}等級 / 厚生${pension}等級`;
}

export function getPremiumTotals(summary: EmployeeInsuranceSummary): PremiumTotals {
  if (!summary.premiums) {
    return { employeeShare: 0, employerShare: 0, total: 0 };
  }

  const { health, longTermCare, pension } = summary.premiums;
  const employeeShare =
    health.employeeShare + longTermCare.employeeShare + pension.employeeShare;
  const employerShare =
    health.employerShare + longTermCare.employerShare + pension.employerShare;

  return {
    employeeShare,
    employerShare,
    total: employeeShare + employerShare,
  };
}

export function formatMyNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 12) {
    return value;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}
