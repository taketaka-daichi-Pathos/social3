import { Employee } from '@features/employees/models/employee.model';
import {
  expandPayrollLoadMonthsWithRegistrationHistory,
  mergeSalaryHistoryIntoPayrollSnapshots,
} from '@features/payroll/utils/payroll-engine-sync.utils';

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
    hireDate: '2024-01-01',
    registrationType: 'existing',
    applicableStartMonth: '2026-04',
    salaryHistory: [
      {
        targetMonth: '2026-03',
        fixedWages: 300000,
        nonFixedWages: 0,
        baseDays: 20,
        locked: true,
      },
    ],
    status: 'active',
    resignationDate: null,
    healthGrade: 20,
    pensionGrade: 18,
    healthStandardRemuneration: 300000,
    pensionStandardRemuneration: 300000,
    allowances: [],
    revisionHistory: [],
    bonusHistory: [],
    leaveRecords: [],
    dependents: [],
    ...overrides,
  } as Employee;
}

describe('expandPayrollLoadMonthsWithRegistrationHistory', () => {
  it('includes registration history months adjacent to the revision load range', () => {
    const employee = createEmployee({
      salaryHistory: [
        {
          targetMonth: '2025-11',
          fixedWages: 280000,
          nonFixedWages: 0,
          baseDays: 20,
          locked: true,
        },
      ],
    });

    const expanded = expandPayrollLoadMonthsWithRegistrationHistory(
      ['2025-12', '2026-01'],
      [employee],
      '2025-12',
      '2026-03'
    );

    expect(expanded).toContain('2025-11');
    expect(expanded).toContain('2025-12');
  });
});

describe('mergeSalaryHistoryIntoPayrollSnapshots', () => {
  it('fills missing payroll snapshots from salaryHistory', () => {
    const employee = createEmployee();
    const merged = mergeSalaryHistoryIntoPayrollSnapshots(new Map(), [employee]);

    expect(merged.get('emp-1')?.get('2026-03')?.yearMonth).toBe('2026-03');
    expect(merged.get('emp-1')?.get('2026-03')?.fixedWages).toBe(300000);
    expect(merged.get('emp-1')?.get('2026-03')?.locked).toBe(true);
  });

  it('does not overwrite existing payroll snapshots', () => {
    const employee = createEmployee();
    const existing = new Map<string, Map<string, import('@features/revision/models/revision.model').PayrollMonthSnapshot>>([
      [
        'emp-1',
        new Map([
          [
            '2026-03',
            {
              yearMonth: '2026-03',
              baseDays: 20,
              totalPayment: 350000,
              fixedWages: 350000,
              nonFixedWages: 0,
              adjustmentAmount: 0,
              adjustmentType: null,
              adjustmentTargetMonth: '',
              locked: true,
            },
          ],
        ]),
      ],
    ]);

    const merged = mergeSalaryHistoryIntoPayrollSnapshots(existing, [employee]);

    expect(merged.get('emp-1')?.get('2026-03')?.fixedWages).toBe(350000);
  });
});
