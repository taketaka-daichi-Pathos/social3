import { Injectable } from '@angular/core';
import {
  EmployeeInsuranceSummary,
  InsuranceGradeResult,
  PremiumShare,
  SocialInsurancePremiumBreakdown,
} from '@core/models/social-insurance.model';
import { StandardRemunerationService } from '@core/services/standard-remuneration.service';
import { Employee } from '@features/employees/models/employee.model';
import { getCurrentCareInsuranceRate } from '@features/settings/utils/care-insurance-rate.utils';
import { getCurrentYearMonthKey } from '@features/payroll/utils/compensation.utils';
import { isSocialInsuranceExemptForMonth } from '@features/employees/utils/leave-record.utils';
import { isSocialInsuranceExemptForRetirementMonth } from '@features/employees/utils/retirement.utils';
import { resolveAgeBasedPremiumFlags } from '@features/employees/utils/age-event.utils';
import { emptyPremiumBreakdown } from '@features/payroll/utils/premium-merge.utils';

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

/**
 * 保険料率（小数: 0.0985 = 9.85%）を整数演算で掛け合わせ、浮動小数点誤差を防ぐ。
 * 例: 2,000,000円 × 9.85% → 197,000円
 */
export function multiplyAmountByInsuranceRateDecimal(amount: number, rateDecimal: number): number {
  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (normalizedAmount <= 0 || rateDecimal <= 0) {
    return 0;
  }

  const rateBasis = Math.round(rateDecimal * 10000);
  return Math.floor((normalizedAmount * rateBasis) / 10000);
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

  /** 介護保険第2号被保険者（40歳以上65歳未満）かどうか — 簡易判定（月次は resolveLongTermCareInclusion を使用） */
  isLongTermCareInsured(age: number): boolean {
    return age >= LONG_TERM_CARE_MIN_AGE && age < LONG_TERM_CARE_MAX_EXCLUSIVE_AGE;
  }

  /** 対象年月に基づく介護保険料徴収の要否（40歳到達月〜65歳到達月前、75歳到達月は除外） */
  resolveLongTermCareInclusion(birthDate: string, targetYearMonth: string): boolean {
    if (!birthDate.trim() || !targetYearMonth.trim()) {
      return false;
    }

    return resolveAgeBasedPremiumFlags(birthDate, targetYearMonth).includeLongTermCare;
  }

  applyAgePremiumExemptions(
    premiums: SocialInsurancePremiumBreakdown,
    birthDate: string,
    targetYearMonth: string
  ): SocialInsurancePremiumBreakdown {
    const flags = resolveAgeBasedPremiumFlags(birthDate, targetYearMonth);

    return {
      health: flags.exemptHealth ? ZERO_PREMIUM_SHARE : premiums.health,
      longTermCare: flags.includeLongTermCare ? premiums.longTermCare : ZERO_PREMIUM_SHARE,
      pension: flags.exemptPension ? ZERO_PREMIUM_SHARE : premiums.pension,
    };
  }

  calculatePremiums(
    healthStandard: number,
    pensionStandard: number,
    includeLongTermCare: boolean,
    healthInsuranceRate: number = HEALTH_INSURANCE_RATE,
    longTermCareRatePercent: number = getCurrentCareInsuranceRate()
  ): SocialInsurancePremiumBreakdown {
    console.log('[Debug] SocialInsuranceCalculator.calculatePremiums 受け取った引数:', {
      healthStandard,
      pensionStandard,
      includeLongTermCare,
      healthInsuranceRate,
      longTermCareRatePercent,
    });

    const longTermCareRate = longTermCareRatePercent / 100;
    const health = this.splitPremium(
      multiplyAmountByInsuranceRateDecimal(healthStandard, healthInsuranceRate)
    );
    const longTermCare = includeLongTermCare
      ? this.splitPremium(
          multiplyAmountByInsuranceRateDecimal(healthStandard, longTermCareRate)
        )
      : ZERO_PREMIUM_SHARE;
    const pension = this.splitPremium(
      multiplyAmountByInsuranceRateDecimal(pensionStandard, PENSION_INSURANCE_RATE)
    );

    const premiums = { health, longTermCare, pension };
    console.log('[Debug] SocialInsuranceCalculator.calculatePremiums 計算結果:', premiums);

    return premiums;
  }

  calculateForEmployee(employee: Employee, targetYearMonth?: string): EmployeeInsuranceSummary {
    const targetMonth = targetYearMonth?.trim() || getCurrentYearMonthKey();
    const referenceDate = this.parseReferenceDateFromYearMonth(targetMonth);
    const age = this.calculateAge(employee.birthDate, referenceDate);
    const isLongTermCareInsured = this.resolveLongTermCareInclusion(
      employee.birthDate,
      targetMonth
    );
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

    if (
      isSocialInsuranceExemptForMonth(employee, targetMonth) ||
      isSocialInsuranceExemptForRetirementMonth(employee, targetMonth)
    ) {
      return {
        age,
        isLongTermCareInsured,
        healthGrade,
        pensionGrade,
        premiums: emptyPremiumBreakdown(),
      };
    }

    const premiums = this.applyAgePremiumExemptions(
      this.calculatePremiums(
        healthGrade.standardMonthlyRemuneration,
        pensionGrade.standardMonthlyRemuneration,
        isLongTermCareInsured
      ),
      employee.birthDate,
      targetMonth
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

  private parseReferenceDateFromYearMonth(targetYearMonth: string): Date {
    const match = /^(\d{4})-(\d{2})$/.exec(targetYearMonth.trim());
    if (!match) {
      return new Date();
    }

    return new Date(Number(match[1]), Number(match[2]) - 1, 1);
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

