import {
  normalizePayrollAdjustmentType,
  PayrollAdjustmentType,
} from '@features/payroll/models/payroll-adjustment.model';
import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';

import { REGULAR_MIN_PAYMENT_BASE_DAYS } from '@features/revision/utils/revision-base-days.utils';

/** @deprecated REGULAR_MIN_PAYMENT_BASE_DAYS を使用してください */
export const ANNUAL_DETERMINATION_MIN_BASE_DAYS = REGULAR_MIN_PAYMENT_BASE_DAYS;

export interface AnnualDeterminationMonthEvaluation {
  included: boolean;
  calculationAmount: number;
  note: string | null;
}

/** 基礎日数判定を除いた月次評価（短時間就労者の15・16日特例判定用） */
export interface AnnualDeterminationMonthBaseEvaluation {
  excluded: boolean;
  calculationAmount: number;
  note: string | null;
}

function isAdjustmentExcludedType(type: PayrollAdjustmentType | null): boolean {
  return type === 'mid_hire_reduction' || type === 'delayed_unpaid';
}

/** 画面表示の総支給額（固定賃金＋非固定賃金＋調整額。下限0円） */
export function resolvePayrollDisplayTotal(snapshot: PayrollMonthSnapshot): number {
  const adjustmentAmount = Number(snapshot.adjustmentAmount ?? 0);
  return Math.max(0, Number(snapshot.totalPayment ?? 0) + adjustmentAmount);
}

/**
 * 算定基礎・随時改定の月次報酬月額。
 * 遅配（昇給差額分）は「表示合計 − 調整額」＝固定賃金＋非固定賃金。
 * 欠勤等減額は調整後の表示合計を用いる。
 */
export function resolveRevisionMonthPaymentAmount(snapshot: PayrollMonthSnapshot): number {
  const adjustmentType = normalizePayrollAdjustmentType(snapshot.adjustmentType);
  const adjustmentAmount = Number(snapshot.adjustmentAmount ?? 0);
  const hasAdjustment = adjustmentAmount !== 0 && adjustmentType != null;
  const displayTotal = resolvePayrollDisplayTotal(snapshot);

  if (hasAdjustment && adjustmentType === 'absence_reduction') {
    return displayTotal;
  }

  if (hasAdjustment && adjustmentType === 'delayed_raise_delta') {
    return displayTotal - adjustmentAmount;
  }

  return snapshot.totalPayment;
}

/** 算定基礎：基礎日数しきい値を適用する前の月次評価 */
export function evaluateAnnualDeterminationMonthBase(
  snapshot: PayrollMonthSnapshot | undefined
): AnnualDeterminationMonthBaseEvaluation {
  if (!snapshot || !snapshot.locked) {
    return { excluded: true, calculationAmount: 0, note: '給与未保存' };
  }

  const adjustmentType = normalizePayrollAdjustmentType(snapshot.adjustmentType);
  const adjustmentAmount = Number(snapshot.adjustmentAmount ?? 0);
  const hasAdjustment = adjustmentAmount !== 0 && adjustmentType != null;
  const revisionAmount = snapshot.totalPayment;
  const displayTotal = resolvePayrollDisplayTotal(snapshot);

  if (hasAdjustment && isAdjustmentExcludedType(adjustmentType)) {
    return {
      excluded: true,
      calculationAmount: 0,
      note:
        adjustmentType === 'mid_hire_reduction'
          ? '中途入社減額のため対象外'
          : '遅配（未払い）のため対象外',
    };
  }

  if (hasAdjustment && adjustmentType === 'absence_reduction') {
    return {
      excluded: false,
      calculationAmount: displayTotal,
      note: null,
    };
  }

  if (hasAdjustment && adjustmentType === 'delayed_raise_delta') {
    return {
      excluded: false,
      calculationAmount: displayTotal - adjustmentAmount,
      note: null,
    };
  }

  return { excluded: false, calculationAmount: revisionAmount, note: null };
}

export function evaluateAnnualDeterminationMonth(
  snapshot: PayrollMonthSnapshot | undefined,
  minBaseDays: number = REGULAR_MIN_PAYMENT_BASE_DAYS
): AnnualDeterminationMonthEvaluation {
  const baseEvaluation = evaluateAnnualDeterminationMonthBase(snapshot);

  if (baseEvaluation.excluded) {
    return { included: false, calculationAmount: 0, note: baseEvaluation.note };
  }

  if (!snapshot || snapshot.baseDays < minBaseDays) {
    return {
      included: false,
      calculationAmount: baseEvaluation.calculationAmount,
      note: '基礎日数不足',
    };
  }

  return {
    included: true,
    calculationAmount: baseEvaluation.calculationAmount,
    note: null,
  };
}
