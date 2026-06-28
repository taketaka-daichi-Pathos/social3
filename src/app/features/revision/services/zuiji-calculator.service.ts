import { Injectable } from '@angular/core';
import { Employee } from '@features/employees/models/employee.model';
import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import { resolveRevisionMonthPaymentAmount } from '@features/revision/utils/annual-determination-adjustment.utils';
import {
  PART_TIME_SPECIAL_MIN_PAYMENT_BASE_DAYS,
  REGULAR_MIN_PAYMENT_BASE_DAYS,
} from '@features/revision/utils/revision-base-days.utils';

export interface OccasionalRevisionMonthDetail {
  yearMonth: string;
  baseDays: number;
  totalPayment: number;
  included: boolean;
  note: string | null;
}

/**
 * 随時改定の計算サービス。
 * 算定基礎の15・16日特例は適用しない。一般・短時間就労者はいずれも17日基準、
 * 短時間労働者（特定適用拡大）のみ11日基準。
 */
@Injectable({ providedIn: 'root' })
export class ZuijiCalculatorService {
  /** 随時改定：社会保険区分に応じて17日/11日基準を切り替えるルーター */
  buildOccasionalMonthDetailsForEmployee(
    targetMonths: string[],
    monthSnapshots: PayrollMonthSnapshot[],
    employee: Employee
  ): OccasionalRevisionMonthDetail[] {
    switch (employee.socialInsuranceType ?? 'general') {
      case 'part_time_special':
        return this.calculateZuijiForPartTimeSpecial(targetMonths, monthSnapshots);
      case 'short_time_worker':
        return this.calculateZuijiForShortTimeWorker(targetMonths, monthSnapshots);
      default:
        return this.calculateZuijiForGeneral(targetMonths, monthSnapshots);
    }
  }

  /** 一般の被保険者（17日基準・特例なし） */
  calculateZuijiForGeneral(
    targetMonths: string[],
    monthSnapshots: PayrollMonthSnapshot[]
  ): OccasionalRevisionMonthDetail[] {
    return this.buildOccasionalMonthDetails(targetMonths, monthSnapshots, REGULAR_MIN_PAYMENT_BASE_DAYS);
  }

  /** 短時間就労者（17日基準・特例なし。3ヶ月すべて17日以上が必要） */
  calculateZuijiForShortTimeWorker(
    targetMonths: string[],
    monthSnapshots: PayrollMonthSnapshot[]
  ): OccasionalRevisionMonthDetail[] {
    return this.buildOccasionalMonthDetails(targetMonths, monthSnapshots, REGULAR_MIN_PAYMENT_BASE_DAYS);
  }

  /** 短時間労働者（特定適用拡大・11日基準） */
  calculateZuijiForPartTimeSpecial(
    targetMonths: string[],
    monthSnapshots: PayrollMonthSnapshot[]
  ): OccasionalRevisionMonthDetail[] {
    return this.buildOccasionalMonthDetails(
      targetMonths,
      monthSnapshots,
      PART_TIME_SPECIAL_MIN_PAYMENT_BASE_DAYS
    );
  }

  /** @deprecated calculateZuijiForGeneral を使用してください */
  calculateZuijiForRegular(
    targetMonths: string[],
    monthSnapshots: PayrollMonthSnapshot[]
  ): OccasionalRevisionMonthDetail[] {
    return this.calculateZuijiForGeneral(targetMonths, monthSnapshots);
  }

  /** @deprecated calculateZuijiForPartTimeSpecial を使用してください */
  calculateZuijiForPartTime(
    targetMonths: string[],
    monthSnapshots: PayrollMonthSnapshot[]
  ): OccasionalRevisionMonthDetail[] {
    return this.calculateZuijiForPartTimeSpecial(targetMonths, monthSnapshots);
  }

  isOccasionalMonthEligibleForEmployee(
    snapshot: PayrollMonthSnapshot,
    employee: Employee
  ): boolean {
    const minBaseDays =
      (employee.socialInsuranceType ?? 'general') === 'part_time_special'
        ? PART_TIME_SPECIAL_MIN_PAYMENT_BASE_DAYS
        : REGULAR_MIN_PAYMENT_BASE_DAYS;

    return snapshot.baseDays >= minBaseDays;
  }

  private buildOccasionalMonthDetails(
    targetMonths: string[],
    monthSnapshots: PayrollMonthSnapshot[],
    minBaseDays: number
  ): OccasionalRevisionMonthDetail[] {
    return targetMonths.map((yearMonth, monthIndex) => {
      const snapshot = monthSnapshots[monthIndex]!;
      const included = snapshot.baseDays >= minBaseDays;

      return {
        yearMonth,
        baseDays: snapshot.baseDays,
        totalPayment: resolveRevisionMonthPaymentAmount(snapshot),
        included,
        note: snapshot.baseDays < minBaseDays ? '基礎日数不足' : null,
      };
    });
  }
}
