import { Injectable } from '@angular/core';
import {
  findInsuranceGradeByAmount,
  HEALTH_INSURANCE_GRADES,
  InsuranceGrade,
  matchInsuranceGrade,
  PENSION_INSURANCE_GRADES,
} from '@core/models/insurance-grade.model';

@Injectable({ providedIn: 'root' })
export class StandardRemunerationService {
  readonly healthGrades = HEALTH_INSURANCE_GRADES;
  readonly pensionGrades = PENSION_INSURANCE_GRADES;

  resolveHealthGrade(baseSalary: number | null | undefined): InsuranceGrade | null {
    if (baseSalary == null || baseSalary < 0) {
      return null;
    }

    return matchInsuranceGrade(this.healthGrades, baseSalary);
  }

  resolvePensionGrade(baseSalary: number | null | undefined): InsuranceGrade | null {
    if (baseSalary == null || baseSalary < 0) {
      return null;
    }

    return matchInsuranceGrade(this.pensionGrades, baseSalary);
  }

  findHealthGradeByAmount(monthlyAmount: number | null | undefined): InsuranceGrade | null {
    if (monthlyAmount == null || monthlyAmount <= 0) {
      return null;
    }

    return findInsuranceGradeByAmount(this.healthGrades, monthlyAmount);
  }

  findPensionGradeByAmount(monthlyAmount: number | null | undefined): InsuranceGrade | null {
    if (monthlyAmount == null || monthlyAmount <= 0) {
      return null;
    }

    return findInsuranceGradeByAmount(this.pensionGrades, monthlyAmount);
  }
}
