export type CompensationType = 'payroll' | 'bonus';

export interface PayrollAllowanceEntry {
  name: string;
  amount: number;
}

import { PayrollAdjustmentType } from '@features/payroll/models/payroll-adjustment.model';

/** 月次給与の1従業員分 */
export interface PayrollEntry {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  baseSalary: number;
  allowances: PayrollAllowanceEntry[];
  nonFixedWages: number;
  baseDays: number;
  /** 算定基礎・随時改定の対象外となる調整額（欠勤控除など。マイナス可） */
  adjustmentAmount: number;
  /** 金額調整の種別（算定基礎の分岐に使用） */
  adjustmentType?: PayrollAdjustmentType | null;
  /** 遅配調整の対象月（YYYY-MM） */
  adjustmentTargetMonth?: string;
  totalPayment: number;
  locked: boolean;
  /** 従業員登録時に確定した過去給与（給与登録画面からの上書き不可） */
  registrationLocked?: boolean;
}

export interface PayrollRecord {
  targetMonth: string;
  entries: PayrollEntry[];
}

/** 賞与の1従業員分 */
export interface CompensationEntry {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  fixedWages: number;
  nonFixedWages: number;
  locked?: boolean;
  bonusAmount?: number;
  standardBonusAmount?: number;
  fixedWagesAtPayment?: number;
  paymentDate?: string;
  savedAt?: string;
}

export interface CompensationRecord {
  targetMonth: string;
  paymentDate?: string;
  entries: CompensationEntry[];
}
