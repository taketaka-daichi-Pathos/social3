import { Employee } from '@features/employees/models/employee.model';
import {
  compareYearMonths,
  parseYearMonthKey,
} from '@features/payroll/utils/compensation.utils';
import {
  AnnualDeterminationResult,
  OccasionalRevisionResult,
} from '@features/revision/models/revision.model';
import {
  RevisionHistoryEntry,
} from '@features/revision/models/revision-history.model';

/** 算定基礎（定時決定）の適用月 */
export const ANNUAL_DETERMINATION_APPLICATION_MONTH = 9;

/** 算定基礎より優先される随時改定の適用月（当年7〜9月） */
export const OCCASIONAL_ANNUAL_PRIORITY_MONTHS = [7, 8, 9] as const;

/** 対象月が算定基礎の適用月（9月）か */
export function isAnnualDeterminationApplicationMonth(targetYearMonth: string): boolean {
  const { month } = parseYearMonthKey(targetYearMonth);
  return month === ANNUAL_DETERMINATION_APPLICATION_MONTH;
}

/** 算定基礎の適用予定データが従業員マスタに存在するか */
export function hasScheduledAnnualDetermination(employee: Employee): boolean {
  return (
    employee.scheduledHealthGrade != null &&
    employee.scheduledPensionGrade != null &&
    employee.scheduledHealthStandardRemuneration != null &&
    employee.scheduledPensionStandardRemuneration != null
  );
}

function normalizeRevisionTimestamp(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  return typeof value === 'string' ? value : new Date().toISOString();
}

export function formatGradeWithAmount(grade: number | null, amount: number): string {
  if (grade == null || amount <= 0) {
    return '—';
  }

  return `${grade}等級 (¥${amount.toLocaleString('ja-JP')})`;
}

export function gradeChangeDirection(
  beforeGrade: number | null,
  afterGrade: number | null
): 'up' | 'down' | 'same' | 'unknown' {
  if (beforeGrade == null || afterGrade == null) {
    return 'unknown';
  }

  if (afterGrade > beforeGrade) {
    return 'up';
  }

  if (afterGrade < beforeGrade) {
    return 'down';
  }

  return 'same';
}

export function parseRevisionHistory(value: unknown): RevisionHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: RevisionHistoryEntry[] = [];

  for (const row of value) {
    const item = row as Record<string, unknown>;
    const applicableMonth = String(item['applicableMonth'] ?? '').trim();
    const type = item['type'] === '随時改定' ? '随時改定' : '算定基礎';

    if (!/^\d{4}-\d{2}$/.test(applicableMonth)) {
      continue;
    }

    const entry: RevisionHistoryEntry = {
      id: String(item['id'] ?? `${applicableMonth}-${type}`),
      applicableMonth,
      type,
      beforeHealthGrade: Number(item['beforeHealthGrade'] ?? item['beforeGrade'] ?? 0),
      beforeHealthAmount: Number(item['beforeHealthAmount'] ?? item['beforeAmount'] ?? 0),
      beforePensionGrade: Number(item['beforePensionGrade'] ?? item['beforeGrade'] ?? 0),
      beforePensionAmount: Number(item['beforePensionAmount'] ?? item['beforeAmount'] ?? 0),
      afterHealthGrade: Number(item['afterHealthGrade'] ?? item['afterGrade'] ?? 0),
      afterHealthAmount: Number(item['afterHealthAmount'] ?? item['afterAmount'] ?? 0),
      afterPensionGrade: Number(item['afterPensionGrade'] ?? item['afterGrade'] ?? 0),
      afterPensionAmount: Number(item['afterPensionAmount'] ?? item['afterAmount'] ?? 0),
      updatedAt: normalizeRevisionTimestamp(item['updatedAt']),
    };

    const targetYear = item['targetYear'];
    if (targetYear != null) {
      entry.targetYear = Number(targetYear);
    }

    const changeMonth = String(item['changeMonth'] ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(changeMonth)) {
      entry.changeMonth = changeMonth;
    }

    const averageAmount = item['averageAmount'];
    if (averageAmount != null && averageAmount !== '') {
      entry.averageAmount = Number(averageAmount);
    }

    entries.push(entry);
  }

  return entries.sort((a, b) => compareYearMonths(a.applicableMonth, b.applicableMonth));
}

export function sortRevisionHistoryDesc(history: RevisionHistoryEntry[]): RevisionHistoryEntry[] {
  return [...history].sort((a, b) => {
    const monthCompare = compareYearMonths(b.applicableMonth, a.applicableMonth);
    if (monthCompare !== 0) {
      return monthCompare;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function findOccasionalRevisionInJulAugSep(
  history: RevisionHistoryEntry[],
  targetYear: number,
  atOrBeforeMonth?: string
): RevisionHistoryEntry | null {
  const candidates = history.filter((entry) => {
    if (entry.type !== '随時改定') {
      return false;
    }

    const { year, month } = parseYearMonthKey(entry.applicableMonth);
    if (
      year !== targetYear ||
      !OCCASIONAL_ANNUAL_PRIORITY_MONTHS.includes(
        month as (typeof OCCASIONAL_ANNUAL_PRIORITY_MONTHS)[number]
      )
    ) {
      return false;
    }

    if (atOrBeforeMonth && compareYearMonths(entry.applicableMonth, atOrBeforeMonth) > 0) {
      return false;
    }

    return true;
  });

  return (
    candidates
      .sort((a, b) => compareYearMonths(a.applicableMonth, b.applicableMonth))
      .at(-1) ?? null
  );
}

/**
 * 当年7〜9月に随時改定が適用済み、または算定基礎対象年に7〜9月適用の随時改定が見込まれる場合、
 * その適用月を返す（算定基礎の上書きをブロックする判定に使用）。
 */
export function resolveOccasionalPriorityOverAnnual(
  employee: Employee,
  targetYear: number,
  occasionalRevisions: OccasionalRevisionResult[] = []
): string | null {
  const fromHistory = findOccasionalRevisionInJulAugSep(
    employee.revisionHistory ?? [],
    targetYear
  );
  if (fromHistory) {
    return fromHistory.applicableMonth;
  }

  const calculated = occasionalRevisions
    .filter((revision) => {
      if (
        revision.employeeId !== employee.id ||
        revision.status !== 'eligible' ||
        !revision.applicationMonth
      ) {
        return false;
      }

      const { year, month } = parseYearMonthKey(revision.applicationMonth);
      return (
        year === targetYear &&
        OCCASIONAL_ANNUAL_PRIORITY_MONTHS.includes(
          month as (typeof OCCASIONAL_ANNUAL_PRIORITY_MONTHS)[number]
        )
      );
    })
    .sort((a, b) => a.applicationMonth!.localeCompare(b.applicationMonth!));

  return calculated.at(-1)?.applicationMonth ?? null;
}

function shouldSuppressAnnualDeterminationEntry(
  entry: RevisionHistoryEntry,
  applicableEntries: RevisionHistoryEntry[],
  targetYearMonth: string
): boolean {
  if (entry.type !== '算定基礎') {
    return false;
  }

  const { year, month } = parseYearMonthKey(entry.applicableMonth);
  if (month !== ANNUAL_DETERMINATION_APPLICATION_MONTH) {
    return false;
  }

  if (compareYearMonths(targetYearMonth, entry.applicableMonth) < 0) {
    return false;
  }

  return findOccasionalRevisionInJulAugSep(applicableEntries, year, targetYearMonth) != null;
}

function pickEffectiveRevisionHistoryEntry(
  applicableEntries: RevisionHistoryEntry[],
  targetYearMonth: string
): RevisionHistoryEntry {
  const sortedDesc = [...applicableEntries].sort((a, b) =>
    compareYearMonths(b.applicableMonth, a.applicableMonth)
  );

  for (const entry of sortedDesc) {
    if (shouldSuppressAnnualDeterminationEntry(entry, applicableEntries, targetYearMonth)) {
      continue;
    }

    return entry;
  }

  return sortedDesc[sortedDesc.length - 1];
}

/** 随時改定・算定基礎の「変更前等級」参照用。従業員マスタの等級・標準報酬月額をそのまま返す。 */
export function resolveEmployeeMasterCurrentGrades(employee: Employee): {
  healthStandard: number;
  pensionStandard: number;
  healthGrade: number | null;
  pensionGrade: number | null;
} {
  return {
    healthStandard: employee.healthStandardRemuneration,
    pensionStandard: employee.pensionStandardRemuneration,
    healthGrade: employee.healthGrade,
    pensionGrade: employee.pensionGrade,
  };
}

export function resolveStandardRemunerationAtMonth(
  employee: Employee,
  targetYearMonth: string
): {
  healthStandard: number;
  pensionStandard: number;
  source: 'employee_master' | 'revision_history';
  applicationMonth: string | null;
} {
  const history = employee.revisionHistory ?? [];

  if (history.length === 0) {
    return {
      healthStandard: employee.healthStandardRemuneration,
      pensionStandard: employee.pensionStandardRemuneration,
      source: 'employee_master',
      applicationMonth: null,
    };
  }

  const applicableEntries = history.filter(
    (entry) => compareYearMonths(entry.applicableMonth, targetYearMonth) <= 0
  );
  const latestApplicable =
    applicableEntries.length > 0
      ? pickEffectiveRevisionHistoryEntry(applicableEntries, targetYearMonth)
      : null;

  if (latestApplicable) {
    return {
      healthStandard: latestApplicable.afterHealthAmount,
      pensionStandard: latestApplicable.afterPensionAmount,
      source: 'revision_history',
      applicationMonth: latestApplicable.applicableMonth,
    };
  }

  const nextEntry = history.find(
    (entry) => compareYearMonths(entry.applicableMonth, targetYearMonth) > 0
  );

  if (nextEntry) {
    return {
      healthStandard: nextEntry.beforeHealthAmount,
      pensionStandard: nextEntry.beforePensionAmount,
      source: 'employee_master',
      applicationMonth: null,
    };
  }

  return {
    healthStandard: employee.healthStandardRemuneration,
    pensionStandard: employee.pensionStandardRemuneration,
    source: 'employee_master',
    applicationMonth: null,
  };
}

export function isAnnualRevisionApplied(
  employee: Employee,
  row: AnnualDeterminationResult
): boolean {
  return findAnnualRevisionHistoryEntry(employee, row) != null;
}

export function isOccasionalRevisionApplied(
  employee: Employee,
  row: OccasionalRevisionResult
): boolean {
  return findOccasionalRevisionHistoryEntry(employee, row) != null;
}

export function findAnnualRevisionHistoryEntry(
  employee: Employee,
  row: AnnualDeterminationResult
): RevisionHistoryEntry | null {
  return findAppliedAnnualRevision(employee, row.targetYear, row.applicationMonth);
}

export function findOccasionalRevisionHistoryEntry(
  employee: Employee,
  row: OccasionalRevisionResult
): RevisionHistoryEntry | null {
  return findAppliedOccasionalRevision(employee, row.changeMonth, row.applicationMonth);
}

export function findAppliedOccasionalRevision(
  employee: Employee,
  changeMonth: string,
  applicationMonth: string | null
): RevisionHistoryEntry | null {
  if (!applicationMonth) {
    return null;
  }

  return (
    (employee.revisionHistory ?? []).find(
      (entry) =>
        entry.type === '随時改定' &&
        entry.changeMonth === changeMonth &&
        entry.applicableMonth === applicationMonth
    ) ?? null
  );
}

export function findAppliedAnnualRevision(
  employee: Employee,
  targetYear: number,
  applicationMonth: string
): RevisionHistoryEntry | null {
  return (
    (employee.revisionHistory ?? []).find(
      (entry) =>
        entry.type === '算定基礎' &&
        entry.applicableMonth === applicationMonth &&
        (entry.targetYear == null || entry.targetYear === targetYear)
    ) ?? null
  );
}

export function revisionHistoryEntryHasGradeChange(entry: RevisionHistoryEntry): boolean {
  return (
    entry.beforeHealthGrade !== entry.afterHealthGrade ||
    entry.beforePensionGrade !== entry.afterPensionGrade
  );
}

export function overlayAnnualResultWithRevisionHistory(
  row: AnnualDeterminationResult,
  employee: Employee
): AnnualDeterminationResult {
  const entry = findAnnualRevisionHistoryEntry(employee, row);
  if (!entry) {
    return row;
  }

  return {
    ...row,
    status: 'eligible',
    exclusionReasons: [],
    exclusionLabels: [],
    currentHealthStandard: entry.beforeHealthAmount,
    currentPensionStandard: entry.beforePensionAmount,
    currentHealthGrade: entry.beforeHealthGrade,
    currentPensionGrade: entry.beforePensionGrade,
    proposedHealthStandard: entry.afterHealthAmount,
    proposedPensionStandard: entry.afterPensionAmount,
    proposedHealthGrade: entry.afterHealthGrade,
    proposedPensionGrade: entry.afterPensionGrade,
    averagePayment: entry.averageAmount ?? row.averagePayment,
    hasGradeChange: revisionHistoryEntryHasGradeChange(entry),
  };
}

export function overlayOccasionalResultWithRevisionHistory(
  row: OccasionalRevisionResult,
  employee: Employee
): OccasionalRevisionResult {
  const entry = findOccasionalRevisionHistoryEntry(employee, row);
  if (!entry) {
    return row;
  }

  return {
    ...row,
    status: 'eligible',
    exclusionReasons: [],
    exclusionLabels: [],
    currentHealthStandard: entry.beforeHealthAmount,
    currentPensionStandard: entry.beforePensionAmount,
    currentHealthGrade: entry.beforeHealthGrade,
    currentPensionGrade: entry.beforePensionGrade,
    proposedHealthStandard: entry.afterHealthAmount,
    proposedPensionStandard: entry.afterPensionAmount,
    proposedHealthGrade: entry.afterHealthGrade,
    proposedPensionGrade: entry.afterPensionGrade,
    averagePayment: entry.averageAmount ?? row.averagePayment,
    gradeDifference: Math.max(
      Math.abs(entry.afterHealthGrade - entry.beforeHealthGrade),
      Math.abs(entry.afterPensionGrade - entry.beforePensionGrade)
    ),
  };
}

export function overlayAnnualResultsWithRevisionHistory(
  results: AnnualDeterminationResult[],
  employees: Employee[]
): AnnualDeterminationResult[] {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  return results.map((row) => {
    const employee = employeeById.get(row.employeeId);
    if (!employee || !isAnnualRevisionApplied(employee, row)) {
      return row;
    }

    return overlayAnnualResultWithRevisionHistory(row, employee);
  });
}

export function overlayOccasionalResultsWithRevisionHistory(
  results: OccasionalRevisionResult[],
  employees: Employee[]
): OccasionalRevisionResult[] {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  return results.map((row) => {
    const employee = employeeById.get(row.employeeId);
    if (!employee || !isOccasionalRevisionApplied(employee, row)) {
      return row;
    }

    return overlayOccasionalResultWithRevisionHistory(row, employee);
  });
}

export function buildAnnualRevisionHistoryEntry(
  row: AnnualDeterminationResult,
  currentHealthGrade: number,
  currentPensionGrade: number
): RevisionHistoryEntry {
  return {
    id: crypto.randomUUID(),
    applicableMonth: row.applicationMonth,
    type: '算定基礎',
    targetYear: row.targetYear,
    beforeHealthGrade: currentHealthGrade,
    beforeHealthAmount: row.currentHealthStandard,
    beforePensionGrade: currentPensionGrade,
    beforePensionAmount: row.currentPensionStandard,
    afterHealthGrade: row.proposedHealthGrade ?? currentHealthGrade,
    afterHealthAmount: row.proposedHealthStandard ?? row.currentHealthStandard,
    afterPensionGrade: row.proposedPensionGrade ?? currentPensionGrade,
    afterPensionAmount: row.proposedPensionStandard ?? row.currentPensionStandard,
    averageAmount: row.averagePayment,
    updatedAt: new Date().toISOString(),
  };
}

export function buildOccasionalRevisionHistoryEntry(
  row: OccasionalRevisionResult,
  currentHealthGrade: number,
  currentPensionGrade: number
): RevisionHistoryEntry {
  return {
    id: crypto.randomUUID(),
    applicableMonth: row.applicationMonth ?? row.changeMonth,
    type: '随時改定',
    changeMonth: row.changeMonth,
    beforeHealthGrade: currentHealthGrade,
    beforeHealthAmount: row.currentHealthStandard,
    beforePensionGrade: currentPensionGrade,
    beforePensionAmount: row.currentPensionStandard,
    afterHealthGrade: row.proposedHealthGrade ?? currentHealthGrade,
    afterHealthAmount: row.proposedHealthStandard ?? row.currentHealthStandard,
    afterPensionGrade: row.proposedPensionGrade ?? currentPensionGrade,
    afterPensionAmount: row.proposedPensionStandard ?? row.currentPensionStandard,
    averageAmount: row.averagePayment,
    updatedAt: new Date().toISOString(),
  };
}
