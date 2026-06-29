import { InsuranceGrade } from '@core/models/insurance-grade.model';
import { Employee } from '@features/employees/models/employee.model';
import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import { normalizeSnapshotFixedWages } from '@features/revision/utils/occasional-revision.utils';
import { resolveStandardRemunerationAtMonth } from '@features/revision/utils/revision-history.utils';

export type RevisionPriorGradeSource = 'payroll_snapshot' | 'revision_history' | 'employee_master';

export interface RevisionPriorGrades {
  healthStandard: number;
  pensionStandard: number;
  healthGrade: number | null;
  pensionGrade: number | null;
  source: RevisionPriorGradeSource;
}

type GradeByAmountResolver = (amount: number) => InsuranceGrade | null;
type GradeByFixedWageResolver = (fixedWages: number) => InsuranceGrade | null;

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
