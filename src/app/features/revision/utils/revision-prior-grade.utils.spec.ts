import {
  HEALTH_INSURANCE_GRADES,
  matchInsuranceGrade,
  PENSION_INSURANCE_GRADES,
} from '@core/models/insurance-grade.model';
import { Employee } from '@features/employees/models/employee.model';
import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import {
  resolveAnnualDeterminationPriorGrades,
  resolveOccasionalRevisionPriorGrades,
  resolvePriorGradesForReferenceMonth,
  resolvePriorGradesFromPayrollSnapshot,
} from '@features/revision/utils/revision-prior-grade.utils';
import { RevisionHistoryEntry } from '@features/revision/models/revision-history.model';

function createSnapshot(fixedWages: number): PayrollMonthSnapshot {
  return {
    yearMonth: '2026-01',
    baseDays: 20,
    totalPayment: fixedWages,
    fixedWages,
    nonFixedWages: 0,
    adjustmentAmount: 0,
    adjustmentType: null,
    adjustmentTargetMonth: '',
    locked: true,
  };
}

function createEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    companyOwnerUid: 'owner-1',
    authUid: null,
    loginEmail: null,
    email: null,
    employeeNumber: '001',
    lastName: '山田',
    firstName: '太郎',
    lastNameKana: 'ヤマダ',
    firstNameKana: 'タロウ',
    birthDate: '1990-01-01',
    gender: 'male',
    hireDate: '2020-01-01',
    registrationType: 'existing',
    applicableStartMonth: '2026-04',
    status: 'active',
    resignationDate: null,
    healthGrade: 27,
    pensionGrade: 24,
    healthStandardRemuneration: 410_000,
    pensionStandardRemuneration: 380_000,
    allowances: [],
    revisionHistory: [],
    bonusHistory: [],
    leaveRecords: [],
    dependents: [],
    ...overrides,
  } as Employee;
}

const resolveHealthGrade = (amount: number) => matchInsuranceGrade(HEALTH_INSURANCE_GRADES, amount);
const resolvePensionGrade = (amount: number) => matchInsuranceGrade(PENSION_INSURANCE_GRADES, amount);
const findHealthGradeByAmount = (amount: number) =>
  HEALTH_INSURANCE_GRADES.find((grade) => grade.monthlyAmount === amount) ?? null;
const findPensionGradeByAmount = (amount: number) =>
  PENSION_INSURANCE_GRADES.find((grade) => grade.monthlyAmount === amount) ?? null;

describe('revision-prior-grade.utils', () => {
  it('derives prior grades from fixed wages in the payroll snapshot', () => {
    const prior = resolvePriorGradesFromPayrollSnapshot(
      createSnapshot(300_000),
      resolveHealthGrade,
      resolvePensionGrade
    );

    expect(prior).toEqual({
      healthStandard: 300_000,
      pensionStandard: 300_000,
      healthGrade: 22,
      pensionGrade: 19,
      source: 'payroll_snapshot',
    });
  });

  it('prefers payroll snapshot over employee master for prior grade resolution', () => {
    const employee = createEmployee({
      healthGrade: 27,
      pensionGrade: 24,
      healthStandardRemuneration: 410_000,
      pensionStandardRemuneration: 380_000,
    });

    const prior = resolvePriorGradesForReferenceMonth(
      employee,
      '2026-01',
      createSnapshot(300_000),
      resolveHealthGrade,
      resolvePensionGrade,
      findHealthGradeByAmount,
      findPensionGradeByAmount
    );

    expect(prior.source).toBe('payroll_snapshot');
    expect(prior.healthGrade).toBe(22);
    expect(prior.healthStandard).toBe(300_000);
    expect(prior.healthGrade).not.toBe(employee.healthGrade);
  });

  it('falls back to employee master when payroll snapshot is unavailable', () => {
    const employee = createEmployee();

    const prior = resolvePriorGradesForReferenceMonth(
      employee,
      '2026-03',
      undefined,
      resolveHealthGrade,
      resolvePensionGrade,
      findHealthGradeByAmount,
      findPensionGradeByAmount
    );

    expect(prior.source).toBe('employee_master');
    expect(prior.healthGrade).toBe(27);
    expect(prior.healthStandard).toBe(410_000);
  });

  it('uses registered gradeHistory at changeMonth - 1 without salary inverse calculation', () => {
    const employee = createEmployee({
      healthGrade: 20,
      pensionGrade: 19,
      healthStandardRemuneration: 260_000,
      pensionStandardRemuneration: 260_000,
      revisionHistory: [],
      gradeHistory: [
        {
          effectiveMonth: '2026-01',
          healthGrade: 50,
          pensionGrade: 32,
          healthStandardRemuneration: 1_390_000,
          pensionStandardRemuneration: 650_000,
          source: 'registration',
        },
        {
          effectiveMonth: '2026-02',
          healthGrade: 20,
          pensionGrade: 19,
          healthStandardRemuneration: 260_000,
          pensionStandardRemuneration: 260_000,
          source: 'registration',
        },
      ],
    });

    const prior = resolveOccasionalRevisionPriorGrades(employee, '2026-02', '2026-05');

    expect(prior.source).toBe('grade_history');
    expect(prior.healthGrade).toBe(50);
    expect(prior.pensionGrade).toBe(32);
    expect(prior.healthGrade).not.toBe(17);
    expect(prior.healthGrade).not.toBe(employee.healthGrade);
  });

  it('uses revision applied in changeMonth when application and new change overlap in the same month', () => {
    const aprilRevisionEntry: RevisionHistoryEntry = {
      id: 'occ-april',
      applicableMonth: '2026-04',
      type: '随時改定',
      changeMonth: '2026-01',
      beforeHealthGrade: 50,
      beforeHealthAmount: 1_390_000,
      beforePensionGrade: 32,
      beforePensionAmount: 650_000,
      afterHealthGrade: 20,
      afterHealthAmount: 260_000,
      afterPensionGrade: 19,
      afterPensionAmount: 260_000,
      averageAmount: 260_000,
      updatedAt: '2026-04-01T00:00:00.000Z',
    };
    const employee = createEmployee({
      healthGrade: 20,
      pensionGrade: 19,
      healthStandardRemuneration: 260_000,
      pensionStandardRemuneration: 260_000,
      revisionHistory: [aprilRevisionEntry],
      gradeHistory: [
        {
          effectiveMonth: '2026-03',
          healthGrade: 50,
          pensionGrade: 32,
          healthStandardRemuneration: 1_390_000,
          pensionStandardRemuneration: 650_000,
          source: 'registration',
        },
      ],
    });

    const prior = resolveOccasionalRevisionPriorGrades(employee, '2026-04', '2026-07');

    expect(prior.source).toBe('revision_history');
    expect(prior.healthGrade).toBe(20);
    expect(prior.pensionGrade).toBe(19);
    expect(prior.healthGrade).not.toBe(50);
  });

  it('uses revisionHistory at applicationMonth - 1 when revision exists between change and application', () => {
    const annualHistoryEntry: RevisionHistoryEntry = {
      id: 'annual-1',
      applicableMonth: '2026-09',
      type: '算定基礎',
      targetYear: 2026,
      beforeHealthGrade: 18,
      beforeHealthAmount: 220_000,
      beforePensionGrade: 15,
      beforePensionAmount: 220_000,
      afterHealthGrade: 41,
      afterHealthAmount: 880_000,
      afterPensionGrade: 32,
      afterPensionAmount: 650_000,
      averageAmount: 880_000,
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const employee = createEmployee({
      healthGrade: 41,
      pensionGrade: 32,
      healthStandardRemuneration: 880_000,
      pensionStandardRemuneration: 650_000,
      revisionHistory: [annualHistoryEntry],
    });

    const prior = resolveOccasionalRevisionPriorGrades(employee, '2026-07', '2026-10');

    expect(prior.source).toBe('revision_history');
    expect(prior.healthGrade).toBe(41);
    expect(prior.pensionGrade).toBe(32);
  });

  it('falls back to employee master for occasional revision when no history exists', () => {
    const employee = createEmployee({
      healthGrade: 41,
      pensionGrade: 32,
      healthStandardRemuneration: 880_000,
      pensionStandardRemuneration: 650_000,
      revisionHistory: [],
      gradeHistory: [],
    });

    const prior = resolveOccasionalRevisionPriorGrades(employee, '2026-07', '2026-10');

    expect(prior.source).toBe('employee_master');
    expect(prior.healthGrade).toBe(41);
  });

  it('uses effective grades at June (July 1) for annual determination prior grades', () => {
    const employee = createEmployee({
      healthGrade: 41,
      pensionGrade: 32,
      healthStandardRemuneration: 880_000,
      pensionStandardRemuneration: 650_000,
      revisionHistory: [],
      gradeHistory: [
        {
          effectiveMonth: '2026-03',
          healthGrade: 23,
          pensionGrade: 20,
          healthStandardRemuneration: 320_000,
          pensionStandardRemuneration: 300_000,
          source: 'registration',
        },
        {
          effectiveMonth: '2026-06',
          healthGrade: 41,
          pensionGrade: 32,
          healthStandardRemuneration: 880_000,
          pensionStandardRemuneration: 650_000,
          source: 'registration',
        },
      ],
    });

    const prior = resolveAnnualDeterminationPriorGrades(employee, 2026);

    expect(prior.source).toBe('grade_history');
    expect(prior.healthGrade).toBe(41);
    expect(prior.pensionGrade).toBe(32);
    expect(prior.healthStandard).toBe(880_000);
  });
});
