import { Employee } from '@features/employees/models/employee.model';
import {
  AnnualDeterminationResult,
  OccasionalRevisionResult,
} from '@features/revision/models/revision.model';
import {
  collectPayrollMonthsForPendingRevisionCheck,
  hasPendingInsuranceUpdatesForMonth,
  hasPendingRevisionApplicationForMonth,
  isAnnualDeterminationAwaitingApply,
  isAnnualRevisionPendingApplication,
  isOccasionalRevisionAwaitingApply,
  isOccasionalRevisionPendingApplication,
  PENDING_INSURANCE_UPDATES_BLOCK_MESSAGE,
} from '@features/payroll/utils/pending-revision-application.utils';

function createEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    companyOwnerUid: 'owner-1',
    authUid: null,
    loginEmail: null,
    email: null,
    resignationDate: null,
    status: 'active',
    employeeNumber: '001',
    lastName: '山田',
    firstName: '太郎',
    lastNameKana: 'ヤマダ',
    firstNameKana: 'タロウ',
    birthDate: '1990-01-01',
    hireDate: '2020-04-01',
    gender: 'male',
    registrationType: 'new',
    baseSalary: 300000,
    allowances: [],
    revisionHistory: [],
    ...overrides,
  } as Employee;
}

function createAnnualRow(
  overrides: Partial<AnnualDeterminationResult> = {}
): AnnualDeterminationResult {
  return {
    employeeId: 'emp-1',
    employeeName: '山田 太郎',
    employeeNumber: '001',
    targetYear: 2025,
    status: 'eligible',
    exclusionReasons: [],
    exclusionLabels: [],
    occasionalPriorityApplicationMonth: null,
    validMonths: ['2025-04', '2025-05', '2025-06'],
    monthDetails: [],
    frequentBonusAdjustment: {
      applied: false,
      bonusPaymentCount: 0,
      bonusTotalAmount: 0,
      monthlyBonusAllocation: 0,
      assessmentPeriodFrom: '',
      assessmentPeriodTo: '',
      payrollOnlyAverage: null,
    },
    averagePayment: 320000,
    currentHealthStandard: 300000,
    currentPensionStandard: 300000,
    currentHealthGrade: 22,
    currentPensionGrade: 18,
    proposedHealthStandard: 320000,
    proposedPensionStandard: 320000,
    proposedHealthGrade: 23,
    proposedPensionGrade: 19,
    applicationMonth: '2025-09',
    hasGradeChange: true,
    ...overrides,
  };
}

function createOccasionalRow(
  overrides: Partial<OccasionalRevisionResult> = {}
): OccasionalRevisionResult {
  return {
    employeeId: 'emp-1',
    employeeName: '山田 太郎',
    employeeNumber: '001',
    changeMonth: '2025-06',
    status: 'eligible',
    isFixedWageChanged: true,
    isEligible: true,
    ineligibleReason: null,
    exclusionReasons: [],
    exclusionLabels: [],
    targetMonths: ['2025-06', '2025-07', '2025-08'],
    monthDetails: [],
    frequentBonusAdjustment: {
      applied: false,
      bonusPaymentCount: 0,
      bonusTotalAmount: 0,
      monthlyBonusAllocation: 0,
      assessmentPeriodFrom: '',
      assessmentPeriodTo: '',
      payrollOnlyAverage: null,
    },
    averagePayment: 350000,
    currentHealthStandard: 300000,
    currentPensionStandard: 300000,
    currentHealthGrade: 22,
    currentPensionGrade: 18,
    proposedHealthStandard: 360000,
    proposedPensionStandard: 360000,
    proposedHealthGrade: 24,
    proposedPensionGrade: 20,
    gradeDifference: 2,
    applicationMonth: '2025-09',
    ...overrides,
  };
}

describe('pending-revision-application.utils', () => {
  it('exposes the payroll lock warning message', () => {
    expect(PENDING_INSURANCE_UPDATES_BLOCK_MESSAGE).toContain('社会保険改定');
    expect(PENDING_INSURANCE_UPDATES_BLOCK_MESSAGE).toContain('未処理');
  });

  it('detects pending annual revision for the application month', () => {
    const employee = createEmployee();
    const row = createAnnualRow();

    expect(isAnnualRevisionPendingApplication(row, employee)).toBe(true);
    expect(
      hasPendingInsuranceUpdatesForMonth({
        targetMonth: '2025-09',
        employees: [employee],
        annualResults: [row],
        occasionalResults: [],
      })
    ).toBe(true);
    expect(
      hasPendingRevisionApplicationForMonth({
        targetMonth: '2025-09',
        employees: [employee],
        annualResults: [row],
        occasionalResults: [],
      })
    ).toBe(true);
  });

  it('ignores annual revision outside September target month', () => {
    const employee = createEmployee();

    expect(
      hasPendingInsuranceUpdatesForMonth({
        targetMonth: '2025-08',
        employees: [employee],
        annualResults: [createAnnualRow({ applicationMonth: '2025-09' })],
        occasionalResults: [],
      })
    ).toBe(false);
  });

  it('ignores applied annual revision', () => {
    const employee = createEmployee({
      revisionHistory: [
        {
          id: 'history-1',
          applicableMonth: '2025-09',
          type: '算定基礎',
          targetYear: 2025,
          beforeHealthGrade: 22,
          beforeHealthAmount: 300000,
          beforePensionGrade: 18,
          beforePensionAmount: 300000,
          afterHealthGrade: 23,
          afterHealthAmount: 320000,
          afterPensionGrade: 19,
          afterPensionAmount: 320000,
          averageAmount: 320000,
          updatedAt: '2025-09-01T00:00:00.000Z',
        },
      ],
    });

    expect(isAnnualDeterminationAwaitingApply(createAnnualRow(), employee)).toBe(false);
    expect(isAnnualRevisionPendingApplication(createAnnualRow(), employee)).toBe(false);
  });

  it('detects pending occasional revision for the application month', () => {
    const employee = createEmployee();

    expect(
      hasPendingInsuranceUpdatesForMonth({
        targetMonth: '2025-09',
        employees: [employee],
        annualResults: [],
        occasionalResults: [createOccasionalRow()],
      })
    ).toBe(true);
  });

  it('detects pending occasional revision with pending status', () => {
    const employee = createEmployee();
    const row = createOccasionalRow({
      status: 'pending',
      isEligible: false,
      applicationMonth: '2025-08',
    });

    expect(isOccasionalRevisionPendingApplication(row, employee)).toBe(false);
    expect(isOccasionalRevisionAwaitingApply(row, employee)).toBe(true);
    expect(
      hasPendingInsuranceUpdatesForMonth({
        targetMonth: '2025-08',
        employees: [employee],
        annualResults: [],
        occasionalResults: [row],
      })
    ).toBe(true);
  });

  it('ignores excluded occasional revision', () => {
    const employee = createEmployee();

    expect(
      isOccasionalRevisionAwaitingApply(
        createOccasionalRow({ isEligible: false, status: 'excluded' }),
        employee
      )
    ).toBe(false);
  });

  it('collects payroll months for September application checks', () => {
    const months = collectPayrollMonthsForPendingRevisionCheck('2025-09');

    expect(months).toContain('2025-04');
    expect(months).toContain('2025-06');
    expect(months).toContain('2025-09');
  });
});
