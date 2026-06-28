import { Employee } from '@features/employees/models/employee.model';
import { PayrollEntry, PayrollRecord } from '@features/payroll/models/compensation.model';
import {
  calculatePayrollEntryFixedWages,
  compareYearMonths,
  getPreviousYearMonthKey,
  parseYearMonthKey,
  payrollEntryToSnapshot,
} from '@features/payroll/utils/compensation.utils';
import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import { resolveRevisionMonthPaymentAmount } from '@features/revision/utils/annual-determination-adjustment.utils';
import { calculateBonusTwelfthAmount } from '@features/revision/utils/annual-determination-bonus.utils';
import { GeppenData, GeppenMonthRecord } from '@features/statutory-reports/models/egov-export.model';
import { buildPayrollLookupByEmployeeId } from '@features/statutory-reports/utils/santei-data.utils';

/** 月額変更届の改定年月（YYYY-MM）のデフォルト値 */
export function resolveDefaultGeppenRevisionYearMonth(referenceDate = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** 改定年月から、前三ヶ月・前二ヶ月・前一ヶ月の YYYY-MM を返す */
export function resolveGeppenPayrollYearMonths(
  revisionYearMonth: string
): [string, string, string] {
  const monthBeforeRevision = getPreviousYearMonthKey(revisionYearMonth);
  const twoMonthsBefore = getPreviousYearMonthKey(monthBeforeRevision);
  const threeMonthsBefore = getPreviousYearMonthKey(twoMonthsBefore);
  return [threeMonthsBefore, twoMonthsBefore, monthBeforeRevision];
}

export function revisionYearMonthToDate(revisionYearMonth: string): Date {
  const { year, month } = parseYearMonthKey(revisionYearMonth);
  return new Date(year, month - 1, 1);
}

function paymentMonthFromYearMonth(yearMonth: string): string {
  return String(parseYearMonthKey(yearMonth).month).padStart(2, '0');
}

function payrollEntryToGeppenMonthRecord(
  yearMonth: string,
  entry: PayrollEntry | undefined,
  bonusAddition: number
): GeppenMonthRecord {
  if (!entry) {
    return {
      paymentMonth: paymentMonthFromYearMonth(yearMonth),
      baseDays: 0,
      currencyAmount: 0,
      kindAmount: 0,
    };
  }

  const snapshotBase = payrollEntryToSnapshot(entry);
  const snapshot: PayrollMonthSnapshot = {
    yearMonth,
    ...snapshotBase,
  };
  const currencyAmount = Math.max(
    0,
    Math.round(resolveRevisionMonthPaymentAmount(snapshot) + bonusAddition)
  );

  return {
    paymentMonth: paymentMonthFromYearMonth(yearMonth),
    baseDays: snapshot.baseDays,
    currencyAmount,
    kindAmount: 0,
  };
}

function resolvePreviousRevisionMonth(
  employee: Employee,
  revisionYearMonth: string
): string | null {
  const historyEntries = (employee.revisionHistory ?? [])
    .filter(
      (entry) =>
        entry.applicableMonth?.trim() &&
        compareYearMonths(entry.applicableMonth, revisionYearMonth) < 0
    )
    .sort((left, right) => compareYearMonths(right.applicableMonth, left.applicableMonth));

  if (historyEntries.length > 0) {
    return historyEntries[0].applicableMonth;
  }

  const applicableStartMonth = employee.applicableStartMonth?.trim();
  if (applicableStartMonth && compareYearMonths(applicableStartMonth, revisionYearMonth) < 0) {
    return applicableStartMonth;
  }

  return applicableStartMonth || null;
}

function resolvePreviousStandardRemuneration(
  employee: Employee,
  revisionYearMonth: string
): { health: number; pension: number } {
  const historyEntry = (employee.revisionHistory ?? []).find(
    (entry) => entry.applicableMonth === revisionYearMonth && entry.type === '随時改定'
  );

  if (historyEntry) {
    return {
      health: historyEntry.beforeHealthAmount,
      pension: historyEntry.beforePensionAmount,
    };
  }

  return {
    health: employee.healthStandardRemuneration ?? 0,
    pension: employee.pensionStandardRemuneration ?? 0,
  };
}

function resolveSalaryChangeFields(
  changeYearMonth: string,
  payrollByMonth: Map<string, PayrollEntry | undefined>
): { salaryChangeMonth: string; salaryChangeCategory: string } {
  const previousYearMonth = getPreviousYearMonthKey(changeYearMonth);
  const previousEntry = payrollByMonth.get(previousYearMonth);
  const changeEntry = payrollByMonth.get(changeYearMonth);

  if (!previousEntry || !changeEntry) {
    return { salaryChangeMonth: '', salaryChangeCategory: '' };
  }

  const previousFixed = calculatePayrollEntryFixedWages(
    previousEntry.baseSalary,
    previousEntry.allowances
  );
  const changeFixed = calculatePayrollEntryFixedWages(changeEntry.baseSalary, changeEntry.allowances);
  const month = paymentMonthFromYearMonth(changeYearMonth);

  if (changeFixed > previousFixed) {
    return { salaryChangeMonth: month, salaryChangeCategory: '1' };
  }

  if (changeFixed < previousFixed) {
    return { salaryChangeMonth: month, salaryChangeCategory: '2' };
  }

  return { salaryChangeMonth: '', salaryChangeCategory: '' };
}

/**
 * 給与実績から月額変更届用の GeppenData を組み立てる。
 */
export function buildGeppenDataFromPayroll(
  employee: Employee,
  revisionYearMonth: string,
  payrollByMonth: Map<string, PayrollEntry | undefined>
): GeppenData {
  const payrollYearMonths = resolveGeppenPayrollYearMonths(revisionYearMonth);
  const changeYearMonth = payrollYearMonths[0];
  const bonusAddition = calculateBonusTwelfthAmount(employee.bonusHistory, parseYearMonthKey(changeYearMonth).year);
  const previousStandards = resolvePreviousStandardRemuneration(employee, revisionYearMonth);
  const salaryChange = resolveSalaryChangeFields(changeYearMonth, payrollByMonth);

  const months = payrollYearMonths.map((yearMonth) =>
    payrollEntryToGeppenMonthRecord(yearMonth, payrollByMonth.get(yearMonth), bonusAddition)
  ) as [GeppenMonthRecord, GeppenMonthRecord, GeppenMonthRecord];

  return {
    revisionDate: revisionYearMonthToDate(revisionYearMonth),
    months,
    previousHealthStandardRemuneration: previousStandards.health,
    previousPensionStandardRemuneration: previousStandards.pension,
    previousRevisionMonth: resolvePreviousRevisionMonth(employee, revisionYearMonth),
    salaryChangeMonth: salaryChange.salaryChangeMonth,
    salaryChangeCategory: salaryChange.salaryChangeCategory,
  };
}

export { buildPayrollLookupByEmployeeId };
