import { Employee } from '@features/employees/models/employee.model';
import { PayrollEntry, PayrollRecord } from '@features/payroll/models/compensation.model';
import {
  calculateEmployeeFixedWages,
  compareYearMonths,
  getAnnualDeterminationMonths,
  payrollEntryToSnapshot,
  toYearMonthKeyFromParts,
} from '@features/payroll/utils/compensation.utils';
import { calculateBonusTwelfthAmount } from '@features/revision/utils/annual-determination-bonus.utils';
import { resolveRevisionMonthPaymentAmount } from '@features/revision/utils/annual-determination-adjustment.utils';
import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import { SanteiData, SanteiMonthRecord } from '@features/statutory-reports/models/egov-export.model';

const SANTEI_PAYMENT_MONTHS = [4, 5, 6] as const;

/** 算定基礎届の対象年のデフォルト値（4月未満は前年度） */
export function resolveDefaultSanteiTargetYear(referenceDate = new Date()): number {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  return month < 4 ? year - 1 : year;
}

/** 給与レコードから「年月 → 従業員ID → エントリ」のルックアップを構築する */
export function buildPayrollLookupByEmployeeId(
  records: PayrollRecord[]
): Map<string, Map<string, PayrollEntry>> {
  const map = new Map<string, Map<string, PayrollEntry>>();

  for (const record of records) {
    const byEmployee = new Map<string, PayrollEntry>();
    for (const entry of record.entries) {
      byEmployee.set(entry.employeeId, entry);
    }
    map.set(record.targetMonth, byEmployee);
  }

  return map;
}

function formatPaymentMonth(month: number): string {
  return String(month).padStart(2, '0');
}

function payrollEntryToSanteiMonthRecord(
  paymentMonth: string,
  yearMonth: string,
  entry: PayrollEntry | undefined,
  bonusAddition: number
): SanteiMonthRecord {
  if (!entry) {
    return {
      paymentMonth,
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
    paymentMonth,
    baseDays: snapshot.baseDays,
    currencyAmount,
    kindAmount: 0,
  };
}

function resolvePreviousRevisionMonth(employee: Employee, targetYear: number): string | null {
  const applicationMonth = toYearMonthKeyFromParts(targetYear, 9);
  const historyEntries = (employee.revisionHistory ?? [])
    .filter(
      (entry) =>
        entry.applicableMonth?.trim() &&
        compareYearMonths(entry.applicableMonth, applicationMonth) < 0
    )
    .sort((left, right) => compareYearMonths(right.applicableMonth, left.applicableMonth));

  if (historyEntries.length > 0) {
    return historyEntries[0].applicableMonth;
  }

  const applicableStartMonth = employee.applicableStartMonth?.trim();
  return applicableStartMonth || null;
}

/**
 * 給与実績から算定基礎届用の SanteiData を組み立てる。
 * payrollByMonth のキーは YYYY-MM（4月・5月・6月）。
 */
export function buildSanteiDataFromPayroll(
  employee: Employee,
  targetYear: number,
  payrollByMonth: Map<string, PayrollEntry | undefined>
): SanteiData {
  const bonusAddition = calculateBonusTwelfthAmount(employee.bonusHistory, targetYear);
  const yearMonths = getAnnualDeterminationMonths(targetYear);

  const months = SANTEI_PAYMENT_MONTHS.map((month, index) => {
    const yearMonth = yearMonths[index];
    const entry = payrollByMonth.get(yearMonth);
    return payrollEntryToSanteiMonthRecord(formatPaymentMonth(month), yearMonth, entry, bonusAddition);
  }) as [SanteiMonthRecord, SanteiMonthRecord, SanteiMonthRecord];

  return {
    targetYear,
    months,
    applicationMonth: toYearMonthKeyFromParts(targetYear, 9),
    previousHealthStandardRemuneration: employee.healthStandardRemuneration ?? 0,
    previousPensionStandardRemuneration: employee.pensionStandardRemuneration ?? 0,
    previousRevisionMonth: resolvePreviousRevisionMonth(employee, targetYear),
  };
}

/** テスト・開発用のダミー SanteiData（給与未登録時のフォールバック） */
export function buildMockSanteiData(employee: Employee, targetYear: number): SanteiData {
  const fixedWages = Math.max(0, Math.round(calculateEmployeeFixedWages(employee)));
  const months = SANTEI_PAYMENT_MONTHS.map(
    (month) =>
      ({
        paymentMonth: formatPaymentMonth(month),
        baseDays: 30,
        currencyAmount: fixedWages,
        kindAmount: 0,
      }) satisfies SanteiMonthRecord
  ) as [SanteiMonthRecord, SanteiMonthRecord, SanteiMonthRecord];

  return {
    targetYear,
    months,
    applicationMonth: toYearMonthKeyFromParts(targetYear, 9),
    previousHealthStandardRemuneration: employee.healthStandardRemuneration ?? fixedWages,
    previousPensionStandardRemuneration: employee.pensionStandardRemuneration ?? fixedWages,
    previousRevisionMonth: employee.applicableStartMonth?.trim() || null,
  };
}
