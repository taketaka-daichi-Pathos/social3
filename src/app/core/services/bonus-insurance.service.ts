import { inject, Injectable } from '@angular/core';
import { CompanyService } from '@core/services/company.service';
import { SocialInsuranceCalculatorService } from '@core/services/social-insurance-calculator.service';
import { Employee } from '@features/employees/models/employee.model';
import { CompensationRecord } from '@features/payroll/models/compensation.model';
import { extractYearMonthKey } from '@features/settings/utils/insurance-rate-date.utils';
import {
  BonusInsuranceCalculationResult,
  calculateBonusInsurancePremiums,
  calculateStandardBonusAmount,
  getPastFiscalStandardBonusTotal,
  getSameMonthExistingStandardBonusTotal,
  parseTargetYearMonth,
  resolvePayrollInsuranceRates,
} from '@features/payroll/utils/bonus-insurance.utils';
import { emptyPremiumBreakdown } from '@features/payroll/utils/premium-merge.utils';
import { isSocialInsuranceExemptForDate } from '@features/employees/utils/leave-record.utils';
import { isSocialInsuranceExemptForRetirementMonth } from '@features/employees/utils/retirement.utils';

@Injectable({ providedIn: 'root' })
export class BonusInsuranceService {
  private readonly companyService = inject(CompanyService);
  private readonly insuranceCalculator = inject(SocialInsuranceCalculatorService);

  async calculateForEmployee(
    employee: Employee,
    targetMonth: string,
    bonusAmount: number,
    bonusRecordsByMonth: Map<string, CompensationRecord>,
    paymentDate?: string
  ): Promise<BonusInsuranceCalculationResult> {
    const company = await this.companyService.getCompanyForCurrentUser();
    const rateTargetDate = paymentDate?.trim() || `${targetMonth}-01`;
    const rateReferenceMonth = paymentDate?.trim()
      ? extractYearMonthKey(rateTargetDate)
      : targetMonth;
    const parsedTarget = parseTargetYearMonth(rateReferenceMonth);

    console.log('[Debug] BonusInsuranceService.calculateForEmployee 呼び出し:', {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      targetMonth,
      paymentDate: paymentDate ?? null,
      rateReferenceMonth,
      parsedTarget,
      targetYear: parsedTarget?.targetYear,
      targetMonthNumber: parsedTarget?.targetMonth,
    });

    if (!parsedTarget) {
      console.warn(
        '[Debug] targetYear / targetMonth が未解析です。rateTargetDate にフォールバックします:',
        rateTargetDate
      );
    }

    const rates = parsedTarget
      ? resolvePayrollInsuranceRates(company, parsedTarget)
      : resolvePayrollInsuranceRates(company, rateTargetDate);

    if (
      isSocialInsuranceExemptForDate(employee, rateTargetDate) ||
      isSocialInsuranceExemptForRetirementMonth(employee, rateReferenceMonth)
    ) {
      const standardBonusAmount = calculateStandardBonusAmount(bonusAmount);
      return {
        bonusAmount,
        standardBonusAmount,
        pensionStandardBonus: 0,
        healthStandardBonus: 0,
        pastFiscalStandardBonusTotal: 0,
        premiums: emptyPremiumBreakdown(),
      };
    }

    const includeLongTermCare = this.insuranceCalculator.resolveLongTermCareInclusion(
      employee.birthDate,
      rateReferenceMonth
    );
    const pastFiscalStandardBonusTotal = getPastFiscalStandardBonusTotal(
      employee.id,
      targetMonth,
      bonusRecordsByMonth,
      rateTargetDate
    );
    const existingSameMonthStandardBonusTotal = getSameMonthExistingStandardBonusTotal(
      employee.id,
      rateReferenceMonth,
      bonusRecordsByMonth,
      rateTargetDate
    );

    const result = calculateBonusInsurancePremiums(
      bonusAmount,
      pastFiscalStandardBonusTotal,
      includeLongTermCare,
      rates,
      existingSameMonthStandardBonusTotal
    );

    return {
      ...result,
      premiums: this.insuranceCalculator.applyAgePremiumExemptions(
        result.premiums,
        employee.birthDate,
        rateReferenceMonth
      ),
    };
  }
}
