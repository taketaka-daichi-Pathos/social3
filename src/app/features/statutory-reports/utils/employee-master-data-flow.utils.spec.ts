import { Dependent } from '@features/dependents/models/dependent.model';
import { Employee } from '@features/employees/models/employee.model';
import { LeaveRecord } from '@features/employees/models/leave-record.model';
import { buildChildcareLeaveDataFromEmployee } from '@features/statutory-reports/utils/childcare-leave-data.utils';
import {
  buildFuyouIdouExportTarget,
  employeeHasFuyouIdouDependents,
} from '@features/statutory-reports/utils/fuyou-idou-data.utils';
import { buildMaternityLeaveDataFromEmployee } from '@features/statutory-reports/utils/maternity-leave-data.utils';

function createBaseEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    companyOwnerUid: 'owner-1',
    authUid: null,
    loginEmail: null,
    employeeNumber: '001',
    registrationType: 'existing',
    lastName: '山田',
    firstName: '太郎',
    lastNameKana: 'ヤマダ',
    firstNameKana: 'タロウ',
    birthDate: '1990-01-01',
    gender: 'male',
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

describe('employee master data flow for statutory reports', () => {
  it('扶養タブで保存した dependents を被扶養者異動届の出力対象にそのまま利用する', () => {
    const dependents: Dependent[] = [
      {
        lastName: '山田',
        firstName: '花子',
        lastNameKana: 'ヤマダ',
        firstNameKana: 'ハナコ',
        romanName: '',
        birthDate: '1992-05-10',
        relationship: 'spouse',
        livingArrangement: 'cohabiting',
        dependencyStartDate: '2020-04-01',
        hasDisability: false,
        occupation: 'unemployed',
        currentSituation: 'other',
        gender: 'female',
        myNumber: '',
        basicPensionNumber: '',
        changeDate: '',
        changeReason: '',
        annualIncome: null,
        postalCode: '',
        address: '',
      },
    ];

    const employee = createBaseEmployee({ dependents, hasDependents: true });
    const target = buildFuyouIdouExportTarget(employee);

    expect(employeeHasFuyouIdouDependents(employee)).toBe(true);
    expect(target.dependents).toHaveLength(1);
    expect(target.dependents[0].firstName).toBe('花子');
  });

  it('育休・産休タブで保存した leaveRecords を各休業届 CSV 生成に利用する', () => {
    const leaveRecords: LeaveRecord[] = [
      {
        type: 'maternity',
        startDate: '2025-06-01',
        endDate: '2025-12-31',
        expectedDeliveryDate: '2025-06-15',
        deliveryType: '1',
      },
      {
        type: 'childcare',
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        children: [
          {
            nameKana: 'ヤマダ アキラ',
            nameKanji: '山田　明',
            birthDate: '2025-06-20',
          },
        ],
      },
    ];

    const employee = createBaseEmployee({ gender: 'female', leaveRecords });
    const maternityData = buildMaternityLeaveDataFromEmployee(employee);
    const childcareData = buildChildcareLeaveDataFromEmployee(employee);

    expect(maternityData?.expectedDeliveryDate).toEqual(new Date(2025, 5, 15));
    expect(maternityData?.deliveryType).toBe('1');
    expect(childcareData?.children[0].nameKanji).toBe('山田　明');
    expect(childcareData?.leaveStartDate).toEqual(new Date(2026, 0, 1));
  });
});
