import {
  HEALTH_INSURANCE_GRADES,
  matchInsuranceGrade,
  PENSION_INSURANCE_GRADES,
} from '@core/models/insurance-grade.model';
import { Employee } from '@features/employees/models/employee.model';
import { PayrollMonthSnapshot } from '@features/revision/models/revision.model';
import {
  resolvePriorGradesForReferenceMonth,
  resolvePriorGradesFromPayrollSnapshot,
} from '@features/revision/utils/revision-prior-grade.utils';

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
});
