import { Employee, EmployeeAllowance } from '@features/employees/models/employee.model';
import { EmployeeSalaryHistoryEntry } from '@features/employees/models/employee-salary-history.model';
import { PayrollAllowanceEntry, PayrollEntry, PayrollRecord } from '@features/payroll/models/compensation.model';
import { normalizePayrollAdjustmentType } from '@features/payroll/models/payroll-adjustment.model';
import {
  CompanyAllowance,
  DEFAULT_COMPANY_ALLOWANCES,
} from '@features/settings/models/company-settings.model';
import {
  isAfterRetirementDate,
  isAfterRetirementMonth,
  isRetiredEmployee,
} from '@features/employees/utils/retirement.utils';

/** 給与・賞与の入力金額を円単位の整数へ正規化（浮動小数点誤差を四捨五入で吸収） */
export function roundPayrollYen(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount);
}

/** 0円未満にならない給与項目の正規化 */
export function roundNonNegativePayrollYen(value: unknown): number {
  return Math.max(0, roundPayrollYen(value));
}

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

/** 実行日の年の4月（YYYY-04）を返す。適用開始月の初期値などに使用 */
export function getCurrentYearAprilMonthKey(referenceDate = new Date()): string {
  return `${referenceDate.getFullYear()}-04`;
}

/** YYYY-MM から1ヶ月前の YYYY-MM を返す（1月は前年12月） */
export function getPreviousYearMonthKey(yearMonth: string): string {
  const normalized = extractYearMonthKey(yearMonth.trim()) || yearMonth.trim();
  const { year, month } = parseYearMonthKey(normalized);

  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return '';
  }

  if (month <= 1) {
    return toYearMonthKeyFromParts(year - 1, 12);
  }

  return toYearMonthKeyFromParts(year, month - 1);
}

/** YYYY-MM から1ヶ月後の YYYY-MM を返す（12月は翌年1月） */
export function getNextYearMonthKey(yearMonth: string): string {
  const normalized = extractYearMonthKey(yearMonth.trim()) || yearMonth.trim();
  const { year, month } = parseYearMonthKey(normalized);

  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return '';
  }

  if (month >= 12) {
    return toYearMonthKeyFromParts(year + 1, 1);
  }

  return toYearMonthKeyFromParts(year, month + 1);
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

/** 対象月が入社年月以降か（当月を含む） */
export function isOnOrAfterHireMonth(employee: Employee, targetYearMonth: string): boolean {
  return !isBeforeHireMonth(employee, targetYearMonth);
}

/** 月次給与行が入力・保存可能か（入社月以降・未ロック・登録ロック月以外） */
export function isPayrollRowEditable(
  employee: Employee,
  targetYearMonth: string,
  savedEntry?: PayrollEntry | null
): boolean {
  if (!isOnOrAfterHireMonth(employee, targetYearMonth)) {
    return false;
  }

  if (Boolean(savedEntry?.locked)) {
    return false;
  }

  return !isRegistrationPayrollLockedMonth(employee, targetYearMonth);
}

/** 従業員登録フローで確定した給与履歴のロック対象月か */
export function isRegistrationPayrollLockedMonth(
  employee: Employee,
  targetYearMonth: string
): boolean {
  const lockedThrough = employee.registrationPayrollLockedThrough?.trim();
  if (!lockedThrough || !/^\d{4}-\d{2}$/.test(lockedThrough)) {
    return false;
  }

  return compareYearMonths(targetYearMonth, lockedThrough) <= 0;
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

/** 前月保存チェックを省略してよい月か */
export function isFirstPayrollMonth(employee: Employee, targetYearMonth: string): boolean {
  if (employee.registrationType === 'existing') {
    const startMonth = resolveApplicableStartMonth(employee);
    if (startMonth === targetYearMonth) {
      return true;
    }
  }

  if (isHireMonth(employee, targetYearMonth)) {
    return true;
  }

  const previousMonth = getPreviousYearMonthKey(targetYearMonth);
  return isBeforeHireMonth(employee, previousMonth);
}

/** 従業員ドキュメントの salaryHistory から対象月のエントリを取得 */
export function findEmployeeSalaryHistoryEntry(
  employee: Employee,
  targetYearMonth: string
): EmployeeSalaryHistoryEntry | null {
  return (
    employee.salaryHistory?.find(
      (entry) => entry.targetMonth === targetYearMonth && entry.locked
    ) ?? null
  );
}

/** 対象月の初期登録給与履歴（salaryHistory）が存在するか */
export function hasEmployeeSalaryHistoryForMonth(
  employee: Employee,
  targetYearMonth: string
): boolean {
  return findEmployeeSalaryHistoryEntry(employee, targetYearMonth) != null;
}

/** salaryHistory から月次給与エントリ形式に変換（表示・ロック用） */
export function buildPayrollEntryFromSalaryHistory(
  employee: Employee,
  historyEntry: EmployeeSalaryHistoryEntry
): PayrollEntry {
  return {
    employeeId: employee.id,
    employeeNumber: employee.employeeNumber,
    employeeName: employeeFullName(employee),
    baseSalary: historyEntry.fixedWages,
    allowances: [],
    nonFixedWages: historyEntry.nonFixedWages,
    baseDays: historyEntry.baseDays,
    adjustmentAmount: 0,
    adjustmentType: null,
    adjustmentTargetMonth: '',
    totalPayment: historyEntry.fixedWages + historyEntry.nonFixedWages,
    locked: true,
    registrationLocked: true,
  };
}

/** 保存済み給与または salaryHistory から対象月のエントリを解決 */
export function resolvePayrollEntryForMonth(
  employee: Employee,
  targetYearMonth: string,
  savedRecord: PayrollRecord | null | undefined
): PayrollEntry | null {
  const fromRecord = savedRecord?.entries.find((entry) => entry.employeeId === employee.id);
  if (fromRecord) {
    return fromRecord;
  }

  const historyEntry = findEmployeeSalaryHistoryEntry(employee, targetYearMonth);
  if (!historyEntry) {
    return null;
  }

  return buildPayrollEntryFromSalaryHistory(employee, historyEntry);
}

/** Firestore取得分とローカルキャッシュをマージ（保存直後の読込ズレ対策） */
export function mergePayrollRecords(
  fetched: PayrollRecord | null | undefined,
  cached: PayrollRecord | null | undefined,
  targetYearMonth: string
): PayrollRecord | null {
  if (!fetched && !cached) {
    return null;
  }

  if (!fetched) {
    return cached?.targetMonth === targetYearMonth ? cached : null;
  }

  if (!cached || cached.targetMonth !== targetYearMonth) {
    return fetched;
  }

  const byEmployeeId = new Map<string, PayrollEntry>(
    fetched.entries.map((entry) => [entry.employeeId, entry])
  );

  for (const entry of cached.entries) {
    const existing = byEmployeeId.get(entry.employeeId);
    if (!existing) {
      byEmployeeId.set(entry.employeeId, entry);
      continue;
    }

    if (entry.locked && (!existing.locked || existing.baseDays == null)) {
      byEmployeeId.set(entry.employeeId, entry);
    }
  }

  return {
    targetMonth: fetched.targetMonth,
    entries: [...byEmployeeId.values()],
  };
}

/**
 * 累計・保険料表示に加算可能な月次給与エントリを解決する。
 * Firestore の確定済み（locked）エントリ、または salaryHistory フォールバック（常に locked）のみ返す。
 */
export function resolveCountablePayrollEntryForMonth(
  employee: Employee,
  targetYearMonth: string,
  savedRecord: PayrollRecord | null | undefined
): PayrollEntry | null {
  const entry = resolvePayrollEntryForMonth(employee, targetYearMonth, savedRecord);
  return entry?.locked ? entry : null;
}

/** 給与エントリが個別保存済み（確定）か。locked が null/undefined の場合は未確定として扱う */
export function isPayrollEntryLocked(entry: PayrollEntry | null | undefined): boolean {
  return entry?.locked === true;
}

/** 月次給与行が従業員登録時の初期履歴データか */
export function isRegistrationInitialPayrollRow(
  employee: Employee,
  targetYearMonth: string,
  savedEntry?: PayrollEntry | null
): boolean {
  if (savedEntry?.registrationLocked) {
    return true;
  }

  return (
    isRegistrationPayrollLockedMonth(employee, targetYearMonth) &&
    hasEmployeeSalaryHistoryForMonth(employee, targetYearMonth)
  );
}

/** 対象月の給与・賞与テーブルに表示する従業員か */
export function isEmployeeVisibleForTargetMonth(
  employee: Employee,
  targetYearMonth: string
): boolean {
  const hireMonth = toYearMonthKey(employee.hireDate);
  if (!hireMonth) {
    return false;
  }

  if (compareYearMonths(hireMonth, targetYearMonth) > 0) {
    return false;
  }

  if (employee.registrationType === 'existing') {
    const startMonth = resolveApplicableStartMonth(employee);
    const hasHistory = hasEmployeeSalaryHistoryForMonth(employee, targetYearMonth);

    if (!startMonth) {
      if (!hasHistory) {
        return false;
      }
    } else if (compareYearMonths(targetYearMonth, startMonth) < 0 && !hasHistory) {
      return false;
    }
  }

  if (isRetiredEmployee(employee) && isAfterRetirementMonth(employee, targetYearMonth)) {
    return false;
  }

  return true;
}

/** 賞与タブ: 支払日を考慮した表示可否（退職日以前の支払いは表示） */
/** 賞与タブ: 支払日を考慮した表示可否（退職日以前の支払いは表示） */
export function isEmployeeVisibleForBonusPayment(
  employee: Employee,
  paymentDate: string,
  targetYearMonth: string
): boolean {
  if (!isEmployeeVisibleForTargetMonth(employee, targetYearMonth)) {
    return false;
  }

  const normalizedPaymentDate = paymentDate.trim();
  if (
    normalizedPaymentDate &&
    isRetiredEmployee(employee) &&
    isAfterRetirementDate(employee, normalizedPaymentDate)
  ) {
    return false;
  }

  return true;
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

/** 賞与タブ: 月次給与と同じ在籍・退職月ルールで対象従業員を絞り込む（支払日指定時は日付単位で判定） */
export function filterEmployeesForBonusTargetMonth(
  employees: Employee[],
  targetYearMonth: string,
  paymentDate = ''
): Employee[] {
  const normalizedPaymentDate = paymentDate.trim();

  return employees
    .filter((employee) =>
      normalizedPaymentDate
        ? isEmployeeVisibleForBonusPayment(employee, normalizedPaymentDate, targetYearMonth)
        : isEmployeeVisibleForTargetMonth(employee, targetYearMonth)
    )
    .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));
}

/** 対象月に確定済み（locked）または salaryHistory フォールバックの月次給与が存在する従業員 */
export function filterEmployeesWithLockedPayroll(
  employees: Employee[],
  targetYearMonth: string,
  payrollRecord: PayrollRecord | null | undefined
): Employee[] {
  return filterEmployeesForTargetMonth(employees, targetYearMonth).filter(
    (employee) =>
      resolveCountablePayrollEntryForMonth(employee, targetYearMonth, payrollRecord) != null
  );
}

export function employeeFullName(employee: Employee): string {
  return `${employee.lastName} ${employee.firstName}`;
}

export function getAllowanceTemplate(companyAllowances: CompanyAllowance[]): CompanyAllowance[] {
  const byName = new Map(
    companyAllowances.map((row) => [String(row.name ?? '').trim(), row.amount ?? null])
  );

  return DEFAULT_COMPANY_ALLOWANCES.map((row) => ({
    name: row.name,
    amount: byName.get(row.name) ?? null,
  }));
}

export function resolvePayrollAllowances(
  employee: Employee,
  companyAllowances: CompanyAllowance[],
  savedEntry?: PayrollEntry | null
): PayrollAllowanceEntry[] {
  const template = getAllowanceTemplate(companyAllowances);

  return template.map((templateRow) => {
    // ロック済み（登録時過去履歴含む）は保存値のみ使用。fixedWages は基本給+手当の合計のため
    // 従業員マスタの手当へフォールスルーすると二重計上になる。
    if (savedEntry?.locked) {
      const saved = savedEntry.allowances.find((row) => row.name === templateRow.name);
      return { name: templateRow.name, amount: saved?.amount ?? 0 };
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

/** 月次給与の基礎日数デフォルト（対象月が不明な場合のフォールバック） */
export const DEFAULT_PAYROLL_BASE_DAYS = 20;

/** YYYY-MM 形式の対象月の暦日数（例: 6月→30、7月→31） */
export function getCalendarDaysInYearMonth(yearMonth: string): number {
  const { year, month } = parseYearMonthKey(yearMonth);
  return new Date(year, month, 0).getDate();
}

/** 月次給与の基礎日数初期値（Firestore保存済みエントリを最優先） */
export function resolvePayrollBaseDays(
  savedEntry?: PayrollEntry | null,
  targetYearMonth?: string
): number {
  if (savedEntry != null) {
    const savedBaseDays = Number(savedEntry.baseDays);
    if (Number.isFinite(savedBaseDays)) {
      return savedBaseDays;
    }
  }

  if (targetYearMonth) {
    return getCalendarDaysInYearMonth(targetYearMonth);
  }

  return DEFAULT_PAYROLL_BASE_DAYS;
}

export type PayrollRowRawFormValues = {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  baseSalary: number;
  allowances: PayrollAllowanceEntry[];
  nonFixedWages: number;
  baseDays: number;
  adjustmentAmount: number;
  adjustmentType: PayrollEntry['adjustmentType'];
  adjustmentTargetMonth: string;
};

export type PayrollRowFormValueSource = {
  getRawValue(): PayrollRowRawFormValues;
  controls: {
    baseSalary: { value: number };
    nonFixedWages: { value: number };
    baseDays: { value: number };
    adjustmentAmount: { value: number };
    adjustmentType: { value: PayrollEntry['adjustmentType'] };
    adjustmentTargetMonth: { value: string };
    allowances: {
      controls: Array<{
        controls: {
          name: { value: string };
          amount: { value: number };
        };
      }>;
    };
  };
};

/** FormGroup 各行から Firestore 保存用の最新値を抽出する */
export function extractPayrollRowFormValues(
  group: PayrollRowFormValueSource
): PayrollRowRawFormValues {
  const raw = group.getRawValue();

  return {
    employeeId: String(raw.employeeId ?? ''),
    employeeNumber: String(raw.employeeNumber ?? ''),
    employeeName: String(raw.employeeName ?? ''),
    baseSalary: roundNonNegativePayrollYen(group.controls.baseSalary.value ?? 0),
    nonFixedWages: roundNonNegativePayrollYen(group.controls.nonFixedWages.value ?? 0),
    baseDays: roundNonNegativePayrollYen(group.controls.baseDays.value),
    adjustmentAmount: roundPayrollYen(group.controls.adjustmentAmount.value ?? 0),
    adjustmentType: group.controls.adjustmentType.value ?? null,
    adjustmentTargetMonth: String(group.controls.adjustmentTargetMonth.value ?? '').trim(),
    allowances: group.controls.allowances.controls.map((allowance) => ({
      name: String(allowance.controls.name.value ?? ''),
      amount: roundNonNegativePayrollYen(allowance.controls.amount.value ?? 0),
    })),
  };
}

/** フォーム行から月次給与エントリを組み立てる（disabled 制御を含む最新値を取得） */
export function buildPayrollEntryFromFormValues(
  raw: {
    employeeId: string;
    employeeNumber: string;
    employeeName: string;
    baseSalary: number;
    allowances: PayrollAllowanceEntry[];
    nonFixedWages: number;
    baseDays: number;
    adjustmentAmount: number;
    adjustmentType: PayrollEntry['adjustmentType'];
    adjustmentTargetMonth: string;
  },
  options: { locked?: boolean; registrationLocked?: boolean } = {}
): PayrollEntry {
  const baseSalary = roundNonNegativePayrollYen(raw.baseSalary ?? 0);
  const nonFixedWages = roundNonNegativePayrollYen(raw.nonFixedWages ?? 0);
  const allowances = raw.allowances.map((row) => ({
    name: row.name,
    amount: roundNonNegativePayrollYen(row.amount ?? 0),
  }));
  const adjustmentAmount = roundPayrollYen(raw.adjustmentAmount ?? 0);
  const totalPayment = calculatePayrollDisplayTotal(
    baseSalary,
    allowances,
    nonFixedWages,
    adjustmentAmount
  );

  return {
    employeeId: String(raw.employeeId ?? ''),
    employeeNumber: String(raw.employeeNumber ?? ''),
    employeeName: String(raw.employeeName ?? ''),
    baseSalary,
    allowances,
    nonFixedWages,
    baseDays: roundNonNegativePayrollYen(raw.baseDays ?? 0),
    adjustmentAmount,
    adjustmentType: adjustmentAmount !== 0 ? raw.adjustmentType ?? null : null,
    adjustmentTargetMonth: adjustmentAmount !== 0 ? String(raw.adjustmentTargetMonth ?? '').trim() : '',
    totalPayment,
    locked: options.locked ?? true,
    registrationLocked: options.registrationLocked,
  };
}

export function calculateFixedWagesTotal(
  baseSalary: number,
  allowances: PayrollAllowanceEntry[]
): number {
  const allowanceTotal = allowances.reduce(
    (sum, row) => sum + roundNonNegativePayrollYen(row.amount ?? 0),
    0
  );
  return roundNonNegativePayrollYen(baseSalary) + allowanceTotal;
}

export function calculateEmployeeAllowancesTotal(allowances: EmployeeAllowance[]): number {
  return (allowances ?? []).reduce(
    (sum, row) => sum + roundNonNegativePayrollYen(row.amount),
    0
  );
}

/** salaryHistory の最新月エントリを返す */
export function resolveNewestSalaryHistoryEntry(
  history: EmployeeSalaryHistoryEntry[]
): EmployeeSalaryHistoryEntry | null {
  if (!history.length) {
    return null;
  }

  return [...history].sort((left, right) =>
    left.targetMonth.localeCompare(right.targetMonth)
  ).at(-1) ?? null;
}

/**
 * 既存社員登録時に fixedWages（基本給+手当）が baseSalary へ誤保存されたデータを補正する。
 * Firestore 上の生データは変更せず、読み取り時のみ純粋な基本給へ正規化する。
 */
export function normalizeEmployeeBaseSalary(
  baseSalary: number,
  allowances: EmployeeAllowance[],
  salaryHistory?: EmployeeSalaryHistoryEntry[]
): number {
  const allowanceTotal = calculateEmployeeAllowancesTotal(allowances);
  if (allowanceTotal <= 0) {
    return baseSalary;
  }

  const newest = resolveNewestSalaryHistoryEntry(salaryHistory ?? []);
  if (!newest || newest.fixedWages !== baseSalary) {
    return baseSalary;
  }

  return Math.max(0, baseSalary - allowanceTotal);
}

/** 従業員マスタの固定賃金（基本給＋手当合計） */
export function calculateEmployeeFixedWages(
  employee: Pick<Employee, 'baseSalary' | 'allowances'>
): number {
  return employee.baseSalary + calculateEmployeeAllowancesTotal(employee.allowances ?? []);
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

/** 算定基礎・随時改定の報酬月額（固定賃金＋非固定賃金。調整額は含めない） */
export function calculatePayrollRevisionAmount(
  baseSalary: number,
  allowances: PayrollAllowanceEntry[],
  nonFixedWages: number
): number {
  return calculatePayrollRowTotal(baseSalary, allowances, nonFixedWages);
}

export const PAYROLL_DISPLAY_TOTAL_FLOOR_ERROR =
  '調整後の合計額が0円を下回っています';

/** 調整前の給与総額（固定賃金＋非固定賃金） */
export function calculatePayrollPreAdjustmentTotal(
  baseSalary: number,
  allowances: PayrollAllowanceEntry[],
  nonFixedWages: number
): number {
  return calculatePayrollRevisionAmount(baseSalary, allowances, nonFixedWages);
}

/** 調整額適用後に合計が0円未満になるか */
export function wouldPayrollAdjustmentExceedTotal(
  preAdjustmentTotal: number,
  adjustmentAmount: number
): boolean {
  const base = roundNonNegativePayrollYen(preAdjustmentTotal);
  const adjustment = roundPayrollYen(adjustmentAmount);
  return base + adjustment < 0;
}

/** 調整額が給与総額を超える場合のエラーメッセージ（問題なければ null） */
export function validatePayrollAdjustmentTotal(
  preAdjustmentTotal: number,
  adjustmentAmount: number
): string | null {
  if (wouldPayrollAdjustmentExceedTotal(preAdjustmentTotal, adjustmentAmount)) {
    return PAYROLL_DISPLAY_TOTAL_FLOOR_ERROR;
  }

  return null;
}

/** 画面表示用の総支給額（固定賃金＋非固定賃金＋調整額。下限0円） */
export function calculatePayrollDisplayTotal(
  baseSalary: number,
  allowances: PayrollAllowanceEntry[],
  nonFixedWages: number,
  adjustmentAmount = 0
): number {
  const preAdjustmentTotal = calculatePayrollPreAdjustmentTotal(
    baseSalary,
    allowances,
    nonFixedWages
  );
  return roundNonNegativePayrollYen(
    preAdjustmentTotal + roundPayrollYen(adjustmentAmount)
  );
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

export function calculateDefaultFixedWages(employee: Employee): number {
  return calculateEmployeeFixedWages(employee);
}

export function payrollEntryToSnapshot(entry: PayrollEntry): {
  baseDays: number;
  totalPayment: number;
  fixedWages: number;
  nonFixedWages: number;
  adjustmentAmount: number;
  adjustmentType: ReturnType<typeof normalizePayrollAdjustmentType>;
  adjustmentTargetMonth: string;
  locked: boolean;
} {
  const fixedWages = calculatePayrollEntryFixedWages(entry.baseSalary, entry.allowances);
  const revisionAmount = calculatePayrollRevisionAmount(
    entry.baseSalary,
    entry.allowances,
    entry.nonFixedWages
  );

  return {
    baseDays: entry.baseDays ?? 0,
    totalPayment: revisionAmount,
    fixedWages,
    nonFixedWages: entry.nonFixedWages,
    adjustmentAmount: Number(entry.adjustmentAmount ?? 0),
    adjustmentType: normalizePayrollAdjustmentType(entry.adjustmentType),
    adjustmentTargetMonth: String(entry.adjustmentTargetMonth ?? '').trim(),
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
