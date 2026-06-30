import { Employee } from '@features/employees/models/employee.model';
import {
  isBonusPaymentDateInAnnualDeterminationAssessmentPeriod,
} from '@features/revision/utils/annual-determination-bonus.utils';
import {
  ANNUAL_DETERMINATION_APPLICATION_MONTH,
  findAppliedAnnualRevision,
} from '@features/revision/utils/revision-history.utils';

export function resolveAnnualDeterminationApplicationMonthKey(targetYear: number): string {
  return `${targetYear}-${String(ANNUAL_DETERMINATION_APPLICATION_MONTH).padStart(2, '0')}`;
}

export function hasAppliedAnnualDeterminationRevision(
  employee: Employee,
  targetYear: number
): boolean {
  return (
    findAppliedAnnualRevision(
      employee,
      targetYear,
      resolveAnnualDeterminationApplicationMonthKey(targetYear)
    ) != null
  );
}

export function listAppliedAnnualDeterminationTargetYears(employee: Employee): number[] {
  const years = new Set<number>();

  for (const entry of employee.revisionHistory ?? []) {
    const targetYear = entry.targetYear;
    if (entry.type !== '算定基礎' || targetYear == null) {
      continue;
    }

    if (hasAppliedAnnualDeterminationRevision(employee, targetYear)) {
      years.add(targetYear);
    }
  }

  return [...years].sort((left, right) => left - right);
}

export interface AppliedAnnualDeterminationBonusLock {
  targetYear: number;
}

export function resolveAppliedAnnualDeterminationBonusLock(
  employee: Employee,
  paymentDate: string
): AppliedAnnualDeterminationBonusLock | null {
  let blocking: AppliedAnnualDeterminationBonusLock | null = null;

  for (const targetYear of listAppliedAnnualDeterminationTargetYears(employee)) {
    if (!isBonusPaymentDateInAnnualDeterminationAssessmentPeriod(paymentDate, targetYear)) {
      continue;
    }

    if (!blocking || targetYear > blocking.targetYear) {
      blocking = { targetYear };
    }
  }

  return blocking;
}

export function isBonusPaymentLockedByAppliedAnnualDetermination(
  employee: Employee,
  paymentDate: string
): boolean {
  return resolveAppliedAnnualDeterminationBonusLock(employee, paymentDate) != null;
}

export function formatAppliedAnnualDeterminationBonusLockMessage(
  lock: AppliedAnnualDeterminationBonusLock
): string {
  const { targetYear } = lock;
  return `${targetYear}年の算定基礎が適用済みのため、${targetYear - 1}年7月〜${targetYear}年6月の賞与データは登録・編集できません。`;
}

export function assertBonusPaymentEditableForAppliedAnnualDetermination(
  employee: Employee,
  paymentDate: string
): void {
  const lock = resolveAppliedAnnualDeterminationBonusLock(employee, paymentDate);
  if (lock) {
    throw new Error(formatAppliedAnnualDeterminationBonusLockMessage(lock));
  }
}
