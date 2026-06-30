import { Employee } from '@features/employees/models/employee.model';
import { RevisionHistoryEntry } from '@features/revision/models/revision-history.model';
import {
  assertBonusPaymentEditableForAppliedAnnualDetermination,
  formatAppliedAnnualDeterminationBonusLockMessage,
  isBonusPaymentLockedByAppliedAnnualDetermination,
  resolveAppliedAnnualDeterminationBonusLock,
} from '@features/revision/utils/annual-determination-bonus-lock.utils';

function createEmployee(
  revisionHistory: RevisionHistoryEntry[],
  overrides: Partial<Employee> = {}
): Employee {
  return {
    id: 'emp-1',
    employeeNumber: '001',
    lastName: '山田',
    firstName: '太郎',
    hireDate: '2020-04-01',
    revisionHistory,
    bonusHistory: [],
    ...overrides,
  } as Employee;
}

function createAnnualRevisionEntry(targetYear: number): RevisionHistoryEntry {
  return {
    id: crypto.randomUUID(),
    applicableMonth: `${targetYear}-09`,
    type: '算定基礎',
    targetYear,
    beforeHealthGrade: 20,
    beforeHealthAmount: 300_000,
    beforePensionGrade: 18,
    beforePensionAmount: 300_000,
    afterHealthGrade: 22,
    afterHealthAmount: 320_000,
    afterPensionGrade: 20,
    afterPensionAmount: 320_000,
    averageAmount: 310_000,
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

describe('annual-determination-bonus-lock.utils', () => {
  it('locks bonus payments within the assessment period after annual determination is applied', () => {
    const employee = createEmployee([createAnnualRevisionEntry(2026)]);

    expect(resolveAppliedAnnualDeterminationBonusLock(employee, '2025-07-01')).toEqual({
      targetYear: 2026,
    });
    expect(isBonusPaymentLockedByAppliedAnnualDetermination(employee, '2026-06-30')).toBe(true);
    expect(isBonusPaymentLockedByAppliedAnnualDetermination(employee, '2026-07-01')).toBe(false);
    expect(isBonusPaymentLockedByAppliedAnnualDetermination(employee, '2025-06-30')).toBe(false);
  });

  it('does not lock when annual determination is not applied', () => {
    const employee = createEmployee([]);

    expect(isBonusPaymentLockedByAppliedAnnualDetermination(employee, '2026-03-10')).toBe(false);
  });

  it('formats the lock message for the target year', () => {
    expect(
      formatAppliedAnnualDeterminationBonusLockMessage({
        targetYear: 2026,
      })
    ).toBe(
      '2026年の算定基礎が適用済みのため、2025年7月〜2026年6月の賞与データは登録・編集できません。'
    );
  });

  it('throws when saving a locked bonus payment', () => {
    const employee = createEmployee([createAnnualRevisionEntry(2026)]);

    expect(() =>
      assertBonusPaymentEditableForAppliedAnnualDetermination(employee, '2025-12-10')
    ).toThrow(
      '2026年の算定基礎が適用済みのため、2025年7月〜2026年6月の賞与データは登録・編集できません。'
    );
  });
});
