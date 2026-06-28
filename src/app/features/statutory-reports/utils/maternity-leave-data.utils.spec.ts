import { Employee } from '@features/employees/models/employee.model';
import {
  buildMaternityLeaveDataFromEmployee,
  employeeHasMaternityLeaveRecord,
  hasCompleteMaternityLeaveForExport,
} from '@features/statutory-reports/utils/maternity-leave-data.utils';

function createEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    companyOwnerUid: 'owner-1',
    authUid: null,
    loginEmail: null,
    employeeNumber: '001',
    registrationType: 'existing',
    lastName: '田中',
    firstName: '花子',
    lastNameKana: 'タナカ',
    firstNameKana: 'ハナコ',
    birthDate: '1990-04-15',
    gender: 'female',
    hireDate: '2020-04-01',
    myNumber: '123456789012',
    hasDependents: false,
    insuredPersonNumber: '1234567',
    baseSalary: 300000,
    healthStandardRemuneration: 300000,
    pensionStandardRemuneration: 300000,
    applicableStartMonth: '2020-04',
    resignationDate: null,
    status: 'active',
    createdAt: '2020-04-01T00:00:00.000Z',
    allowances: [],
    healthGrade: 20,
    pensionGrade: 18,
    scheduledHealthGrade: null,
    scheduledPensionGrade: null,
    scheduledHealthStandardRemuneration: null,
    scheduledPensionStandardRemuneration: null,
    scheduledAnnualDeterminationMonth: null,
    revisionHistory: [],
    bonusHistory: [],
    leaveRecords: [],
    dependents: [],
    insuranceCardReturned: null,
    ...overrides,
  };
}

describe('maternity-leave-data.utils', () => {
  it('産休レコードから MaternityLeaveData を組み立てる', () => {
    const employee = createEmployee({
      leaveRecords: [
        {
          type: 'maternity',
          startDate: '2025-05-01',
          endDate: '2025-09-30',
          expectedDeliveryDate: '2025-06-15',
          deliveryType: '2',
        },
      ],
    });

    const data = buildMaternityLeaveDataFromEmployee(employee);

    expect(data).not.toBeNull();
    expect(data?.deliveryType).toBe('2');
    expect(data?.expectedDeliveryDate.getFullYear()).toBe(2025);
    expect(employeeHasMaternityLeaveRecord(employee)).toBe(true);
    expect(hasCompleteMaternityLeaveForExport(employee)).toBe(true);
  });

  it('出産予定日または出産種別がない場合は出力不可', () => {
    const employee = createEmployee({
      leaveRecords: [
        {
          type: 'maternity',
          startDate: '2025-05-01',
          endDate: '2025-09-30',
        },
      ],
    });

    expect(employeeHasMaternityLeaveRecord(employee)).toBe(true);
    expect(hasCompleteMaternityLeaveForExport(employee)).toBe(false);
    expect(buildMaternityLeaveDataFromEmployee(employee)).toBeNull();
  });

  it('産休レコードがない場合は null', () => {
    const employee = createEmployee();
    expect(buildMaternityLeaveDataFromEmployee(employee)).toBeNull();
  });
});
