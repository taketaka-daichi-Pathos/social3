export type CompensationType = 'payroll' | 'bonus';

export interface PayrollAllowanceEntry {
  name: string;
  amount: number;
}

/** 月次給与の1従業員分 */
export interface PayrollEntry {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  baseSalary: number;
  allowances: PayrollAllowanceEntry[];
  nonFixedWages: number;
  baseDays: number;
  totalPayment: number;
  locked: boolean;
}

export interface PayrollRecord {
  targetMonth: string;
  entries: PayrollEntry[];
}

/** 賞与の1従業員分（従来形式） */
export interface CompensationEntry {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  fixedWages: number;
  nonFixedWages: number;
  locked?: boolean;
}

export interface CompensationRecord {
  targetMonth: string;
  locked: boolean;
  entries: CompensationEntry[];
}
