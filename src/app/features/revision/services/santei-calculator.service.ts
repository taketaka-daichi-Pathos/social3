import { Injectable } from '@angular/core';
import { Employee } from '@features/employees/models/employee.model';
import {
  AnnualDeterminationMonthEvaluation,
  evaluateAnnualDeterminationMonth,
  evaluateAnnualDeterminationMonthBase,
} from '@features/revision/utils/annual-determination-adjustment.utils';
import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import {
  PART_TIME_SPECIAL_MIN_PAYMENT_BASE_DAYS,
  REGULAR_MIN_PAYMENT_BASE_DAYS,
  SHORT_TIME_WORKER_SPECIAL_MIN_PAYMENT_BASE_DAYS,
  SHORT_TIME_WORKER_STANDARD_MIN_PAYMENT_BASE_DAYS,
} from '@features/revision/utils/revision-base-days.utils';

const SHORT_TIME_WORKER_SPECIAL_NOTE = '15・16日特例適用';

@Injectable({ providedIn: 'root' })
export class SanteiCalculatorService {
  /**
   * 算定基礎：対象月ごとの評価結果を社会保険区分に応じて一括算出する。
   * 短時間就労者は4〜6月全体の15・16日特例を考慮するため、月単体評価は不可。
   */
  buildAnnualDeterminationEvaluations(
    employee: Employee,
    validMonths: readonly string[],
    snapshots: ReadonlyMap<string, PayrollMonthSnapshot>
  ): ReadonlyMap<string, AnnualDeterminationMonthEvaluation> {
    const insuranceType = employee.socialInsuranceType ?? 'general';

    switch (insuranceType) {
      case 'short_time_worker':
        return this.calculateSanteiForShortTimeWorker(validMonths, snapshots);
      case 'part_time_special':
        return this.calculateSanteiForPartTimeSpecial(validMonths, snapshots);
      default:
        return this.calculateSanteiForGeneral(validMonths, snapshots);
    }
  }

  /** @deprecated buildAnnualDeterminationEvaluations を使用してください */
  evaluateMonthForEmployee(
    snapshot: PayrollMonthSnapshot | undefined,
    employee: Employee
  ): AnnualDeterminationMonthEvaluation {
    const yearMonth = snapshot?.yearMonth;
    if (!yearMonth) {
      return { included: false, calculationAmount: 0, note: '給与未保存' };
    }

    const evaluations = this.buildAnnualDeterminationEvaluations(
      employee,
      [yearMonth],
      snapshot ? new Map([[yearMonth, snapshot]]) : new Map()
    );

    return (
      evaluations.get(yearMonth) ?? { included: false, calculationAmount: 0, note: '給与未保存' }
    );
  }

  /** 一般の被保険者：17日以上の月のみ算定対象 */
  calculateSanteiForGeneral(
    validMonths: readonly string[],
    snapshots: ReadonlyMap<string, PayrollMonthSnapshot>
  ): ReadonlyMap<string, AnnualDeterminationMonthEvaluation> {
    return this.buildPerMonthEvaluations(
      validMonths,
      snapshots,
      REGULAR_MIN_PAYMENT_BASE_DAYS
    );
  }

  /**
   * 短時間就労者：17日以上の月が1つでもあれば17日以上の月のみ、
   * なければ15日以上17日未満（15・16日）の月のみ算定対象。
   */
  calculateSanteiForShortTimeWorker(
    validMonths: readonly string[],
    snapshots: ReadonlyMap<string, PayrollMonthSnapshot>
  ): ReadonlyMap<string, AnnualDeterminationMonthEvaluation> {
    const preEvaluations = validMonths.map((yearMonth) => {
      const snapshot = snapshots.get(yearMonth);
      const baseEvaluation = evaluateAnnualDeterminationMonthBase(snapshot);

      return {
        yearMonth,
        snapshot,
        baseEvaluation,
      };
    });

    const cohortCandidates = preEvaluations.filter((row) => !row.baseEvaluation.excluded);
    const hasStandardMonth = cohortCandidates.some(
      (row) => (row.snapshot?.baseDays ?? 0) >= SHORT_TIME_WORKER_STANDARD_MIN_PAYMENT_BASE_DAYS
    );

    const result = new Map<string, AnnualDeterminationMonthEvaluation>();

    for (const row of preEvaluations) {
      if (row.baseEvaluation.excluded) {
        result.set(row.yearMonth, {
          included: false,
          calculationAmount: 0,
          note: row.baseEvaluation.note,
        });
        continue;
      }

      const baseDays = row.snapshot?.baseDays ?? 0;
      const calculationAmount = row.baseEvaluation.calculationAmount;

      if (hasStandardMonth) {
        if (baseDays >= SHORT_TIME_WORKER_STANDARD_MIN_PAYMENT_BASE_DAYS) {
          result.set(row.yearMonth, {
            included: true,
            calculationAmount,
            note: null,
          });
        } else {
          result.set(row.yearMonth, {
            included: false,
            calculationAmount,
            note: '基礎日数不足',
          });
        }
        continue;
      }

      if (
        baseDays >= SHORT_TIME_WORKER_SPECIAL_MIN_PAYMENT_BASE_DAYS &&
        baseDays < SHORT_TIME_WORKER_STANDARD_MIN_PAYMENT_BASE_DAYS
      ) {
        result.set(row.yearMonth, {
          included: true,
          calculationAmount,
          note: SHORT_TIME_WORKER_SPECIAL_NOTE,
        });
        continue;
      }

      result.set(row.yearMonth, {
        included: false,
        calculationAmount,
        note: '基礎日数不足',
      });
    }

    return result;
  }

  /** 短時間労働者（特定適用拡大）：11日以上の月のみ算定対象 */
  calculateSanteiForPartTimeSpecial(
    validMonths: readonly string[],
    snapshots: ReadonlyMap<string, PayrollMonthSnapshot>
  ): ReadonlyMap<string, AnnualDeterminationMonthEvaluation> {
    return this.buildPerMonthEvaluations(
      validMonths,
      snapshots,
      PART_TIME_SPECIAL_MIN_PAYMENT_BASE_DAYS
    );
  }

  private buildPerMonthEvaluations(
    validMonths: readonly string[],
    snapshots: ReadonlyMap<string, PayrollMonthSnapshot>,
    minBaseDays: number
  ): ReadonlyMap<string, AnnualDeterminationMonthEvaluation> {
    const result = new Map<string, AnnualDeterminationMonthEvaluation>();

    for (const yearMonth of validMonths) {
      result.set(
        yearMonth,
        evaluateAnnualDeterminationMonth(snapshots.get(yearMonth), minBaseDays)
      );
    }

    return result;
  }
}
