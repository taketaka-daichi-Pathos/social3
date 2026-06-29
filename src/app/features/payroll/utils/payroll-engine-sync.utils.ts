import { Employee } from '@features/employees/models/employee.model';
import { PayrollEntry, PayrollRecord } from '@features/payroll/models/compensation.model';
import {
  buildPayrollEntryFromSalaryHistory,
  compareYearMonths,
  findEmployeeSalaryHistoryEntry,
  getNextYearMonthKey,
  getPreviousYearMonthKey,
  payrollEntryToSnapshot,
} from '@features/payroll/utils/compensation.utils';
import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';

function isMissingPayrollEngineEntry(
  employee: Employee,
  targetYearMonth: string,
  payrollSnapshots: Map<string, Map<string, PayrollMonthSnapshot>>
): boolean {
  const historyEntry = findEmployeeSalaryHistoryEntry(employee, targetYearMonth);
  if (!historyEntry) {
    return false;
  }

  return !payrollSnapshots.get(employee.id)?.has(targetYearMonth);
}

/**
 * 随時改定・算定基礎の給与読込範囲に、登録時過去履歴月を加える。
 * システム利用開始月をまたぐ昇給判定でも、隣接月の payrolls を確実に取得する。
 */
export function expandPayrollLoadMonthsWithRegistrationHistory(
  baseMonths: string[],
  employees: Employee[],
  loadFrom: string,
  loadTo: string
): string[] {
  const months = new Set(baseMonths);
  const rangeStart = getPreviousYearMonthKey(loadFrom);

  for (const employee of employees) {
    if (employee.registrationType !== 'existing') {
      continue;
    }

    for (const entry of employee.salaryHistory ?? []) {
      if (!entry.locked) {
        continue;
      }

      const month = entry.targetMonth.trim();
      if (!month) {
        continue;
      }

      if (compareYearMonths(month, loadTo) > 0) {
        continue;
      }

      if (compareYearMonths(month, rangeStart) >= 0) {
        months.add(month);
      }

      const nextMonth = getNextYearMonthKey(month);
      if (
        compareYearMonths(nextMonth, rangeStart) >= 0 &&
        compareYearMonths(nextMonth, loadTo) <= 0
      ) {
        months.add(nextMonth);
      }
    }
  }

  return [...months].sort();
}

/** payrolls 未同期時のフォールバックとして salaryHistory からスナップショットを補完する */
export function mergeSalaryHistoryIntoPayrollSnapshots(
  payrollSnapshots: Map<string, Map<string, PayrollMonthSnapshot>>,
  employees: Employee[]
): Map<string, Map<string, PayrollMonthSnapshot>> {
  const merged = new Map(payrollSnapshots);

  for (const employee of employees) {
    for (const historyEntry of employee.salaryHistory ?? []) {
      if (!historyEntry.locked) {
        continue;
      }

      const month = historyEntry.targetMonth;
      const employeeSnapshots = merged.get(employee.id) ?? new Map<string, PayrollMonthSnapshot>();

      if (employeeSnapshots.has(month)) {
        if (!merged.has(employee.id)) {
          merged.set(employee.id, employeeSnapshots);
        }
        continue;
      }

      if (isMissingPayrollEngineEntry(employee, month, payrollSnapshots)) {
        console.warn(
          '[PayrollEngineSync] salaryHistory から payrolls を自動補完しました:',
          {
            employeeId: employee.id,
            employeeNumber: employee.employeeNumber,
            targetMonth: month,
          }
        );
      }

      const payrollEntry: PayrollEntry = buildPayrollEntryFromSalaryHistory(employee, historyEntry);
      employeeSnapshots.set(month, toPayrollMonthSnapshot(month, payrollEntry));
      merged.set(employee.id, employeeSnapshots);
    }
  }

  return merged;
}

export function mergePayrollEntriesForImport(
  existing: PayrollRecord | null | undefined,
  savedEntry: PayrollEntry
): PayrollEntry[] {
  const entries = [...(existing?.entries ?? [])];
  const index = entries.findIndex((row) => row.employeeId === savedEntry.employeeId);

  if (index >= 0) {
    entries[index] = savedEntry;
  } else {
    entries.push(savedEntry);
  }

  return entries;
}

function toPayrollMonthSnapshot(month: string, entry: PayrollEntry): PayrollMonthSnapshot {
  return {
    yearMonth: month,
    ...payrollEntryToSnapshot(entry),
  };
}
