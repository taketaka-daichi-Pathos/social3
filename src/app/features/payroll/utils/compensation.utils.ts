import { Employee, EmployeeAllowance } from '@features/employees/models/employee.model';
import { PayrollAllowanceEntry, PayrollEntry, PayrollRecord } from '@features/payroll/models/compensation.model';
import {
  CompanyAllowance,
  DEFAULT_COMPANY_ALLOWANCES,
} from '@features/settings/models/company-settings.model';

function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  return new Date(value);
}

/** YYYY-MM-DD から YYYY-MM キーを生成（ローカル日付） */
export function extractYearMonthKey(value: string): string {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})/.exec(trimmed);
  if (!match) {
    return '';
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return '';
  }

  return `${match[1]}-${match[2]}`;
}

export function compareYearMonths(left: string, right: string): number {
  const a = parseYearMonthKey(left);
  const b = parseYearMonthKey(right);

  if (a.year !== b.year) {
    return a.year - b.year;
  }

  return a.month - b.month;
}

/** YYYY-MM-DD から YYYY-MM キーを生成（ローカル日付） */
export function toYearMonthKey(value: string): string {
  const extracted = extractYearMonthKey(value);
  if (extracted) {
    return extracted;
  }

  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getCurrentYearMonthKey(referenceDate = new Date()): string {
  return `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
}

/** YYYY-MM から1ヶ月前の YYYY-MM を返す（1月は前年12月） */
export function getPreviousYearMonthKey(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (month <= 1) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** YYYY-MM から1ヶ月後の YYYY-MM を返す（12月は翌年1月） */
export function getNextYearMonthKey(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (month >= 12) {
    return `${year + 1}-01`;
  }

  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function parseYearMonthKey(yearMonth: string): { year: number; month: number } {
  const [yearStr, monthStr] = yearMonth.split('-');
  return {
    year: Number(yearStr),
    month: Number(monthStr),
  };
}

export function toYearMonthKeyFromParts(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isHireMonth(employee: Employee, targetYearMonth: string): boolean {
  const hireMonth = toYearMonthKey(employee.hireDate);
  if (!hireMonth) {
    return false;
  }

  return compareYearMonths(hireMonth, targetYearMonth) === 0;
}

/** 既存社員（直近の基本給登録済み）か */
export function isExistingEmployee(employee: Employee): boolean {
  return employee.registrationType === 'existing';
}

/** 対象月が入社年月より前か（同月は操作可能） */
export function isBeforeHireMonth(employee: Employee, targetYearMonth: string): boolean {
  const hireMonth = toYearMonthKey(employee.hireDate);
  if (!hireMonth) {
    return false;
  }

  return compareYearMonths(targetYearMonth, hireMonth) < 0;
}

export function formatTargetMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  return `${year}年${Number(month)}月度`;
}

/** 既存社員の適用開始年月を取得（旧フィールドからのフォールバック付き） */
export function resolveApplicableStartMonth(employee: Employee): string {
  const month = employee.applicableStartMonth?.trim();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    return month;
  }

  return '';
}

/** 給与入力の初月か（前月保存チェックの例外判定） */
export function isFirstPayrollMonth(employee: Employee, targetYearMonth: string): boolean {
  if (employee.registrationType === 'existing') {
    const startMonth = resolveApplicableStartMonth(employee);
    return startMonth === targetYearMonth;
  }

  return isHireMonth(employee, targetYearMonth);
}

/** 対象月の給与・賞与テーブルに表示する従業員か */
export function isEmployeeVisibleForTargetMonth(
  employee: Employee,
  targetYearMonth: string
): boolean {
  if (employee.registrationType === 'existing') {
    const startMonth = resolveApplicableStartMonth(employee);
    if (!startMonth) {
      return false;
    }

    return compareYearMonths(targetYearMonth, startMonth) >= 0;
  }

  const hireMonth = toYearMonthKey(employee.hireDate);
  if (!hireMonth) {
    return false;
  }

  return compareYearMonths(hireMonth, targetYearMonth) <= 0;
}

/** 対象月の給与・賞与テーブルに表示する従業員のみ */
export function filterEmployeesForTargetMonth(
  employees: Employee[],
  targetYearMonth: string
): Employee[] {
  return employees
    .filter((employee) => isEmployeeVisibleForTargetMonth(employee, targetYearMonth))
    .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));
}

/** 対象月に確定済み（locked）の月次給与が存在する従業員ID */
export function getLockedPayrollEmployeeIds(record: PayrollRecord | null | undefined): Set<string> {
  if (!record) {
    return new Set();
  }

  return new Set(
    record.entries.filter((entry) => entry.locked).map((entry) => entry.employeeId)
  );
}

export function filterEmployeesWithLockedPayroll(
  employees: Employee[],
  targetYearMonth: string,
  payrollRecord: PayrollRecord | null | undefined
): Employee[] {
  const lockedIds = getLockedPayrollEmployeeIds(payrollRecord);

  return filterEmployeesForTargetMonth(employees, targetYearMonth).filter((employee) =>
    lockedIds.has(employee.id)
  );
}

export function employeeFullName(employee: Employee): string {
  return `${employee.lastName} ${employee.firstName}`;
}

export function getAllowanceTemplate(companyAllowances: CompanyAllowance[]): CompanyAllowance[] {
  if (companyAllowances.length > 0) {
    return companyAllowances;
  }

  return [...DEFAULT_COMPANY_ALLOWANCES];
}

export function resolvePayrollAllowances(
  employee: Employee,
  companyAllowances: CompanyAllowance[],
  savedEntry?: PayrollEntry | null
): PayrollAllowanceEntry[] {
  const template = getAllowanceTemplate(companyAllowances);

  return template.map((templateRow) => {
    const saved = savedEntry?.allowances.find((row) => row.name === templateRow.name);
    if (saved) {
      return { name: templateRow.name, amount: saved.amount };
    }

    if (isExistingEmployee(employee)) {
      const fromEmployee = employee.allowances?.find((row) => row.name === templateRow.name);
      return { name: templateRow.name, amount: fromEmployee?.amount ?? 0 };
    }

    const fromEmployee = employee.allowances?.find((row) => row.name === templateRow.name);
    if (fromEmployee?.amount != null) {
      return { name: templateRow.name, amount: fromEmployee.amount };
    }

    return { name: templateRow.name, amount: templateRow.amount ?? 0 };
  });
}

/** 月次給与の基本給初期値（既存社員は直近の基本給） */
export function resolvePayrollBaseSalary(employee: Employee, savedEntry?: PayrollEntry | null): number {
  if (savedEntry?.baseSalary != null) {
    return savedEntry.baseSalary;
  }

  return employee.baseSalary;
}

/** 月次給与の基礎日数デフォルト */
export const DEFAULT_PAYROLL_BASE_DAYS = 20;

/** 月次給与の基礎日数初期値 */
export function resolvePayrollBaseDays(savedEntry?: PayrollEntry | null): number {
  if (savedEntry != null && savedEntry.baseDays != null && savedEntry.baseDays > 0) {
    return savedEntry.baseDays;
  }

  if (savedEntry?.locked && savedEntry.baseDays != null) {
    return savedEntry.baseDays;
  }

  return DEFAULT_PAYROLL_BASE_DAYS;
}

export function calculateFixedWagesTotal(
  baseSalary: number,
  allowances: PayrollAllowanceEntry[]
): number {
  const allowanceTotal = allowances.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  return baseSalary + allowanceTotal;
}

export function calculatePayrollEntryFixedWages(
  baseSalary: number,
  allowances: PayrollAllowanceEntry[]
): number {
  return calculateFixedWagesTotal(baseSalary, allowances);
}

export function calculatePayrollRowTotal(
  baseSalary: number,
  allowances: PayrollAllowanceEntry[],
  nonFixedWages: number
): number {
  return calculateFixedWagesTotal(baseSalary, allowances) + nonFixedWages;
}

export function toEmployeeAllowances(allowances: PayrollAllowanceEntry[]): EmployeeAllowance[] {
  return allowances.map((row) => ({
    name: row.name,
    amount: row.amount,
  }));
}

export function calculatePayrollEntryTotalPayment(
  baseSalary: number,
  allowances: PayrollAllowanceEntry[],
  nonFixedWages: number
): number {
  return calculatePayrollRowTotal(baseSalary, allowances, nonFixedWages);
}

export function calculateDefaultFixedWages(
  employee: Employee,
  allowances: CompanyAllowance[]
): number {
  const allowanceTotal = allowances.reduce((sum, allowance) => sum + (allowance.amount ?? 0), 0);
  return employee.baseSalary + allowanceTotal;
}

export function payrollEntryToSnapshot(entry: PayrollEntry): {
  baseDays: number;
  totalPayment: number;
  fixedWages: number;
  nonFixedWages: number;
  locked: boolean;
} {
  const fixedWages = calculatePayrollEntryFixedWages(entry.baseSalary, entry.allowances);
  const totalPayment =
    entry.totalPayment ??
    calculatePayrollEntryTotalPayment(entry.baseSalary, entry.allowances, entry.nonFixedWages);

  return {
    baseDays: entry.baseDays ?? 0,
    totalPayment,
    fixedWages,
    nonFixedWages: entry.nonFixedWages,
    locked: entry.locked,
  };
}

/** 年度開始月（4月）から対象月までの年月リスト */
export function listFiscalYearMonthsUpTo(targetYearMonth: string): string[] {
  const { year, month } = parseYearMonthKey(targetYearMonth);
  const fiscalStartYear = month >= 4 ? year : year - 1;
  const months: string[] = [];

  for (let m = 4; m <= 12; m += 1) {
    const key = toYearMonthKeyFromParts(fiscalStartYear, m);
    if (key <= targetYearMonth) {
      months.push(key);
    }
  }

  for (let m = 1; m <= 3; m += 1) {
    const key = toYearMonthKeyFromParts(fiscalStartYear + 1, m);
    if (key <= targetYearMonth) {
      months.push(key);
    }
  }

  return months;
}

export function getAnnualDeterminationMonths(targetYear: number): string[] {
  return [
    toYearMonthKeyFromParts(targetYear, 4),
    toYearMonthKeyFromParts(targetYear, 5),
    toYearMonthKeyFromParts(targetYear, 6),
  ];
}

export function isHiredOnOrAfterJuneFirst(employee: Employee, targetYear: number): boolean {
  const hireDate = parseLocalDate(employee.hireDate);
  const juneFirst = new Date(targetYear, 5, 1);
  return hireDate >= juneFirst;
}
