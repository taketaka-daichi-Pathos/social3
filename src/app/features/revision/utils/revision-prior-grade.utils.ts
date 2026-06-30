import { InsuranceGrade } from '@core/models/insurance-grade.model';
import { Employee } from '@features/employees/models/employee.model';
import {
  compareYearMonths,
  getPreviousYearMonthKey,
} from '@features/payroll/utils/compensation.utils';
import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import { normalizeSnapshotFixedWages } from '@features/revision/utils/occasional-revision.utils';
import {
  EmployeeGradesAtMonthSource,
  getAnnualDeterminationPriorReferenceMonth,
  resolveEmployeeGradesAtMonth,
  resolveStandardRemunerationAtMonth,
} from '@features/revision/utils/revision-history.utils';

export type RevisionPriorGradeSource =
  | 'payroll_snapshot'
  | 'grade_history'
  | 'revision_history'
  | 'employee_master';

export interface RevisionPriorGrades {
  healthStandard: number;
  pensionStandard: number;
  healthGrade: number | null;
  pensionGrade: number | null;
  source: RevisionPriorGradeSource;
}

type GradeByAmountResolver = (amount: number) => InsuranceGrade | null;
type GradeByFixedWageResolver = (fixedWages: number) => InsuranceGrade | null;

function mapEmployeeGradesSourceToPriorSource(
  source: EmployeeGradesAtMonthSource
): RevisionPriorGradeSource {
  return source;
}

function toRevisionPriorGradesFromEmployeeGrades(
  grades: ReturnType<typeof resolveEmployeeGradesAtMonth>
): RevisionPriorGrades {
  return {
    healthStandard: grades.healthStandard,
    pensionStandard: grades.pensionStandard,
    healthGrade: grades.healthGrade,
    pensionGrade: grades.pensionGrade,
    source: mapEmployeeGradesSourceToPriorSource(grades.source),
  };
}

function toRevisionPriorGrades(
  healthGrade: InsuranceGrade | null,
  pensionGrade: InsuranceGrade | null,
  source: RevisionPriorGradeSource
): RevisionPriorGrades | null {
  if (!healthGrade || !pensionGrade) {
    return null;
  }

  return {
    healthStandard: healthGrade.monthlyAmount,
    pensionStandard: pensionGrade.monthlyAmount,
    healthGrade: healthGrade.grade,
    pensionGrade: pensionGrade.grade,
    source,
  };
}

/**
 * 変動前月などの給与スナップショットから、固定的賃金を等級表に当てはめて従前等級を逆算する。
 */
export function resolvePriorGradesFromPayrollSnapshot(
  snapshot: PayrollMonthSnapshot | undefined,
  resolveHealthGrade: GradeByFixedWageResolver,
  resolvePensionGrade: GradeByFixedWageResolver
): RevisionPriorGrades | null {
  if (!snapshot?.locked) {
    return null;
  }

  const fixedWages = normalizeSnapshotFixedWages(snapshot);
  if (!Number.isFinite(fixedWages) || fixedWages < 0) {
    return null;
  }

  return toRevisionPriorGrades(
    resolveHealthGrade(fixedWages),
    resolvePensionGrade(fixedWages),
    'payroll_snapshot'
  );
}

/**
 * 給与スナップショットが無い場合は改定履歴・従業員マスタを参照する。
 */
export function resolvePriorGradesForReferenceMonth(
  employee: Employee,
  referenceYearMonth: string,
  snapshot: PayrollMonthSnapshot | undefined,
  resolveHealthGradeByFixedWage: GradeByFixedWageResolver,
  resolvePensionGradeByFixedWage: GradeByFixedWageResolver,
  resolveHealthGradeByAmount: GradeByAmountResolver,
  resolvePensionGradeByAmount: GradeByAmountResolver
): RevisionPriorGrades {
  const fromSnapshot = resolvePriorGradesFromPayrollSnapshot(
    snapshot,
    resolveHealthGradeByFixedWage,
    resolvePensionGradeByFixedWage
  );
  if (fromSnapshot) {
    return fromSnapshot;
  }

  const fromHistory = resolveStandardRemunerationAtMonth(employee, referenceYearMonth);
  const fromHistoryGrades = toRevisionPriorGrades(
    resolveHealthGradeByAmount(fromHistory.healthStandard),
    resolvePensionGradeByAmount(fromHistory.pensionStandard),
    fromHistory.source === 'revision_history' ? 'revision_history' : 'employee_master'
  );
  if (fromHistoryGrades) {
    return fromHistoryGrades;
  }

  return {
    healthStandard: employee.healthStandardRemuneration,
    pensionStandard: employee.pensionStandardRemuneration,
    healthGrade: employee.healthGrade,
    pensionGrade: employee.pensionGrade,
    source: 'employee_master',
  };
}

/**
 * 算定基礎の変更前等級を、その年7月1日時点（6月末まで有効な等級）で解決する。
 */
export function resolveAnnualDeterminationPriorGrades(
  employee: Employee,
  targetYear: number
): RevisionPriorGrades {
  return toRevisionPriorGradesFromEmployeeGrades(
    resolveEmployeeGradesAtMonth(employee, getAnnualDeterminationPriorReferenceMonth(targetYear))
  );
}

/**
 * 随時改定の変更前等級を解決する。
 * 登録済みの等級履歴（gradeHistory / revisionHistory）の等級番号をそのまま使用する。
 */
export function resolveOccasionalRevisionPriorGrades(
  employee: Employee,
  changeMonth: string,
  applicationMonth: string
): RevisionPriorGrades {
  const referenceMonth = resolveOccasionalRevisionPriorReferenceMonth(
    employee,
    changeMonth,
    applicationMonth
  );

  return toRevisionPriorGradesFromEmployeeGrades(
    resolveEmployeeGradesAtMonth(employee, referenceMonth)
  );
}

/**
 * 随時改定の変更前等級を参照する月（YYYY-MM）を決定する。
 *
 * 原則は変動月の前月。
 * 変動月当月に改定履歴の適用がある場合は、当月時点の等級（適用後）を参照する。
 * 変動月〜適用月の間に別の改定がある場合は、適用月の前月を参照する。
 */
export function resolveOccasionalRevisionPriorReferenceMonth(
  employee: Employee,
  changeMonth: string,
  applicationMonth: string
): string {
  const changePriorMonth = getPreviousYearMonthKey(changeMonth);
  const applicationPriorMonth = getPreviousYearMonthKey(applicationMonth);

  if (
    hasInterveningRevisionBetweenChangeAndApplicationPrior(
      employee,
      changeMonth,
      applicationPriorMonth
    )
  ) {
    return applicationPriorMonth;
  }

  if (hasRevisionApplicableInMonth(employee, changeMonth)) {
    return changeMonth;
  }

  return changePriorMonth;
}

function hasRevisionApplicableInMonth(employee: Employee, yearMonth: string): boolean {
  return (employee.revisionHistory ?? []).some((entry) => entry.applicableMonth === yearMonth);
}

function hasInterveningRevisionBetweenChangeAndApplicationPrior(
  employee: Employee,
  changeMonth: string,
  applicationPriorMonth: string
): boolean {
  return (employee.revisionHistory ?? []).some(
    (entry) =>
      compareYearMonths(entry.applicableMonth, changeMonth) > 0 &&
      compareYearMonths(entry.applicableMonth, applicationPriorMonth) <= 0
  );
}
