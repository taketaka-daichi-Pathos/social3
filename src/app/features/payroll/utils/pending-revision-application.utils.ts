import { Employee } from '@features/employees/models/employee.model';
import {
  AnnualDeterminationResult,
  OccasionalRevisionResult,
} from '@features/revision/models/revision.model';
import {
  isAnnualRevisionApplied,
  isOccasionalRevisionApplied,
} from '@features/revision/utils/revision-history.utils';
import { getOccasionalRevisionDashboardSearchRange } from '@features/revision/utils/occasional-revision.utils';
import {
  getAnnualDeterminationMonths,
  getNextYearMonthKey,
  getPreviousYearMonthKey,
  parseYearMonthKey,
} from '@features/payroll/utils/compensation.utils';

export const PENDING_INSURANCE_UPDATES_BLOCK_MESSAGE =
  '⚠️ この月に適用予定の社会保険改定（随時改定または算定基礎）が未処理です。先に適用処理を完了させてください。';

/** @deprecated PENDING_INSURANCE_UPDATES_BLOCK_MESSAGE を使用してください */
export const PENDING_REVISION_APPLICATION_BLOCK_MESSAGE =
  PENDING_INSURANCE_UPDATES_BLOCK_MESSAGE;

export const ANNUAL_DETERMINATION_APPLICATION_MONTH = 9;

/** 算定基礎が対象外扱いとなり、適用待ちとしてブロックしない行か */
export function isAnnualRevisionTrulyExcluded(row: AnnualDeterminationResult): boolean {
  return (
    row.exclusionReasons.includes('hired_after_june') ||
    row.exclusionReasons.includes('occasional_revision_scheduled') ||
    row.occasionalPriorityApplicationMonth != null
  );
}

/** 改定画面の提出対象判定用：算定基礎が対象月に適用予定かつ未適用か */
export function isAnnualRevisionPendingApplication(
  row: AnnualDeterminationResult,
  employee: Employee
): boolean {
  if (isAnnualRevisionApplied(employee, row)) {
    return false;
  }

  return !isAnnualRevisionTrulyExcluded(row);
}

/** 改定画面の提出対象判定用：随時改定が対象月に適用予定かつ未適用か */
export function isOccasionalRevisionPendingApplication(
  row: OccasionalRevisionResult,
  employee: Employee
): boolean {
  return row.isEligible && !isOccasionalRevisionApplied(employee, row);
}

/**
 * 月次給与確定ブロック用：算定基礎が9月適用で未処理（処理待ち）か。
 * 対象外・適用済みは含めない。
 */
export function isAnnualDeterminationAwaitingApply(
  row: AnnualDeterminationResult,
  employee: Employee
): boolean {
  if (isAnnualRevisionApplied(employee, row)) {
    return false;
  }

  if (isAnnualRevisionTrulyExcluded(row) || row.status === 'excluded') {
    return false;
  }

  return true;
}

/**
 * 月次給与確定ブロック用：随時改定が適用月に未処理（処理待ち）か。
 * 対象外・適用済みは含めない。eligible 以外の pending（確認中）もブロック対象。
 */
export function isOccasionalRevisionAwaitingApply(
  row: OccasionalRevisionResult,
  employee: Employee
): boolean {
  if (isOccasionalRevisionApplied(employee, row)) {
    return false;
  }

  if (row.status === 'excluded') {
    return false;
  }

  return Boolean(row.applicationMonth?.trim());
}

/** 対象月に未適用の社会保険改定（随時改定・算定基礎）があるか */
export function hasPendingInsuranceUpdatesForMonth(params: {
  targetMonth: string;
  employees: Employee[];
  annualResults: ReadonlyArray<AnnualDeterminationResult>;
  occasionalResults: ReadonlyArray<OccasionalRevisionResult>;
}): boolean {
  const targetMonth = params.targetMonth.trim();
  if (!targetMonth) {
    return false;
  }

  const { month } = parseYearMonthKey(targetMonth);
  const employeeById = new Map(params.employees.map((employee) => [employee.id, employee]));

  for (const row of params.occasionalResults) {
    if (row.applicationMonth !== targetMonth) {
      continue;
    }

    const employee = employeeById.get(row.employeeId);
    if (employee && isOccasionalRevisionAwaitingApply(row, employee)) {
      return true;
    }
  }

  if (month === ANNUAL_DETERMINATION_APPLICATION_MONTH) {
    for (const row of params.annualResults) {
      if (row.applicationMonth !== targetMonth) {
        continue;
      }

      const employee = employeeById.get(row.employeeId);
      if (employee && isAnnualDeterminationAwaitingApply(row, employee)) {
        return true;
      }
    }
  }

  return false;
}

/** @deprecated hasPendingInsuranceUpdatesForMonth を使用してください */
export function hasPendingRevisionApplicationForMonth(
  params: Parameters<typeof hasPendingInsuranceUpdatesForMonth>[0]
): boolean {
  return hasPendingInsuranceUpdatesForMonth(params);
}

function listMonthsInclusive(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = from;

  while (cursor <= to) {
    months.push(cursor);
    if (cursor === to) {
      break;
    }
    cursor = getNextYearMonthKey(cursor);
  }

  return months;
}

/** 適用待ち改定の判定に必要な給与データの読込月 */
export function collectPayrollMonthsForPendingRevisionCheck(targetMonth: string): string[] {
  const normalized = targetMonth.trim();
  const { year, month } = parseYearMonthKey(normalized);
  const months = new Set<string>();

  let cursor = normalized;
  for (let index = 0; index < 4; index += 1) {
    months.add(cursor);
    cursor = getPreviousYearMonthKey(cursor);
  }

  if (month === ANNUAL_DETERMINATION_APPLICATION_MONTH) {
    for (const determinationMonth of getAnnualDeterminationMonths(year)) {
      months.add(determinationMonth);
    }

    const occasionalRange = getOccasionalRevisionDashboardSearchRange(year);
    for (const loadMonth of listMonthsInclusive(
      occasionalRange.payrollLoadFrom,
      occasionalRange.payrollLoadTo
    )) {
      months.add(loadMonth);
    }
  }

  return [...months].sort();
}

export function getOccasionalRevisionSearchRangeForApplicationMonth(applicationMonth: string): {
  searchFrom: string;
  searchTo: string;
} {
  const changeMonth = getPreviousYearMonthKey(
    getPreviousYearMonthKey(getPreviousYearMonthKey(applicationMonth))
  );

  return {
    searchFrom: getPreviousYearMonthKey(changeMonth),
    searchTo: changeMonth,
  };
}
