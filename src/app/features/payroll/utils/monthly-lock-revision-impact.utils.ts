import { Employee } from '@features/employees/models/employee.model';
import { PayrollRecord } from '@features/payroll/models/compensation.model';
import {
  getAnnualDeterminationMonths,
  getPreviousYearMonthKey,
  isEmployeeVisibleForTargetMonth,
  isHiredOnOrAfterJuneFirst,
  parseYearMonthKey,
  resolvePayrollEntryForMonth,
} from '@features/payroll/utils/compensation.utils';

export function isAnnualDeterminationMonth(yearMonth: string): boolean {
  const { year } = parseYearMonthKey(yearMonth);
  return getAnnualDeterminationMonths(year).includes(yearMonth);
}

export function hasAnnualDeterminationTargetsForMonth(
  targetMonth: string,
  employees: Employee[],
  payrollRecord: PayrollRecord | null
): boolean {
  if (!isAnnualDeterminationMonth(targetMonth)) {
    return false;
  }

  const { year } = parseYearMonthKey(targetMonth);

  return employees.some((employee) => {
    if (!isEmployeeVisibleForTargetMonth(employee, targetMonth)) {
      return false;
    }

    if (isHiredOnOrAfterJuneFirst(employee, year)) {
      return false;
    }

    const entry = resolvePayrollEntryForMonth(employee, targetMonth, payrollRecord);
    return Boolean(entry?.locked);
  });
}

export function hasOccasionalRevisionTargetsForMonth(
  targetMonth: string,
  occasionalResults: ReadonlyArray<{ changeMonth: string; status: string }>
): boolean {
  return occasionalResults.some(
    (result) => result.changeMonth === targetMonth && result.status === 'eligible'
  );
}

export function getOccasionalRevisionSearchRangeForMonth(targetMonth: string): {
  searchFrom: string;
  searchTo: string;
} {
  return {
    searchFrom: getPreviousYearMonthKey(targetMonth),
    searchTo: targetMonth,
  };
}
