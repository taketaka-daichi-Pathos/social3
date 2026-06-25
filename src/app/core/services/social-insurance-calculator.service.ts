import { Injectable } from '@angular/core';
import {
  EmployeeInsuranceSummary,
  InsuranceGradeResult,
  PremiumShare,
  SocialInsurancePremiumBreakdown,
} from '@core/models/social-insurance.model';
import { StandardRemunerationService } from '@core/services/standard-remuneration.service';
import { Employee } from '@features/employees/models/employee.model';
import { LONG_TERM_CARE_INSURANCE_RATE } from '@features/settings/models/prefecture-insurance-rates.constants';

/** 令和6年度 協会けんぽ 東京都 料率（計算用フォールバック） */
const HEALTH_INSURANCE_RATE = 0.0998;
const PENSION_INSURANCE_RATE = 0.183;

/** 介護保険第2号被保険者の年齢要件（40歳以上65歳未満） */
const LONG_TERM_CARE_MIN_AGE = 40;
const LONG_TERM_CARE_MAX_EXCLUSIVE_AGE = 65;

const ZERO_PREMIUM_SHARE: PremiumShare = {
  employeeShare: 0,
  employerShare: 0,
  total: 0,
};

/** 給与控除用の個人負担端数処理（0.50以下切捨て、0.50超切上げ） */
export function roundEmployeeDeductionShare(halfShare: number): number {
  return Math.ceil(halfShare - 0.5);
}

@Injectable({ providedIn: 'root' })
export class SocialInsuranceCalculatorService {
  constructor(private readonly standardRemunerationService: StandardRemunerationService) {}

  calculateAge(birthDate: string, referenceDate: Date = new Date()): number {
    const birth = this.parseDate(birthDate);
    if (!birth) {
      return 0;
    }

    let age = referenceDate.getFullYear() - birth.getFullYear();
    const monthDiff = referenceDate.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birth.getDate())) {
      age -= 1;
    }

    return age;
  }

  /** 介護保険第2号被保険者（40歳以上65歳未満）かどうか */
  isLongTermCareInsured(age: number): boolean {
    return age >= LONG_TERM_CARE_MIN_AGE && age < LONG_TERM_CARE_MAX_EXCLUSIVE_AGE;
  }

  calculatePremiums(
    healthStandard: number,
    pensionStandard: number,
    includeLongTermCare: boolean
  ): SocialInsurancePremiumBreakdown {
    const longTermCareRate = LONG_TERM_CARE_INSURANCE_RATE / 100;
    const health = this.splitPremium(healthStandard * HEALTH_INSURANCE_RATE);
    const longTermCare = includeLongTermCare
      ? this.splitPremium(healthStandard * longTermCareRate)
      : ZERO_PREMIUM_SHARE;
    const pension = this.splitPremium(pensionStandard * PENSION_INSURANCE_RATE);

    return { health, longTermCare, pension };
  }

  calculateForEmployee(employee: Employee): EmployeeInsuranceSummary {
    const age = this.calculateAge(employee.birthDate);
    const isLongTermCareInsured = this.isLongTermCareInsured(age);
    const healthGrade = this.toGradeResult(
      this.standardRemunerationService.findHealthGradeByAmount(employee.healthStandardRemuneration)
    );
    const pensionGrade = this.toGradeResult(
      this.standardRemunerationService.findPensionGradeByAmount(employee.pensionStandardRemuneration)
    );

    if (!healthGrade || !pensionGrade) {
      return {
        age,
        isLongTermCareInsured,
        healthGrade,
        pensionGrade,
        premiums: null,
      };
    }

    const premiums = this.calculatePremiums(
      healthGrade.standardMonthlyRemuneration,
      pensionGrade.standardMonthlyRemuneration,
      isLongTermCareInsured
    );

    return { age, isLongTermCareInsured, healthGrade, pensionGrade, premiums };
  }

  private toGradeResult(
    grade: { grade: number; monthlyAmount: number } | null
  ): InsuranceGradeResult | null {
    if (!grade) {
      return null;
    }

    return {
      grade: grade.grade,
      standardMonthlyRemuneration: grade.monthlyAmount,
    };
  }

  /** 折半前の全体保険料から個人負担を算出し、残りを会社負担とする */
  private splitPremium(totalPremium: number): PremiumShare {
    const total = Math.floor(totalPremium);
    const employeeShare = roundEmployeeDeductionShare(total / 2);
    const employerShare = total - employeeShare;

    return { employeeShare, employerShare, total };
  }

  private parseDate(value: string): Date | null {
    const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (isoDateMatch) {
      const year = Number(isoDateMatch[1]);
      const month = Number(isoDateMatch[2]) - 1;
      const day = Number(isoDateMatch[3]);
      const date = new Date(year, month, day);

      return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
