import { Employee } from '@features/employees/models/employee.model';
import { PayrollEntry } from '@features/payroll/models/compensation.model';
import {
  buildPayrollLookupByEmployeeId,
  buildSanteiDataFromPayroll,
  resolveDefaultSanteiTargetYear,
} from '@features/statutory-reports/utils/santei-data.utils';

function createMockEmployee(overrides: Partial<Employee> = {}): Employee {
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
    insuredPersonNumber: '7654321',
    baseSalary: 300000,
    healthStandardRemuneration: 280000,
    pensionStandardRemuneration: 280000,
    applicableStartMonth: '2024-09',
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

function createPayrollEntry(overrides: Partial<PayrollEntry> = {}): PayrollEntry {
  return {
    employeeId: 'emp-1',
    employeeNumber: '001',
    employeeName: '田中 花子',
    baseSalary: 300000,
    allowances: [],
    nonFixedWages: 10000,
    baseDays: 30,
    adjustmentAmount: 0,
    totalPayment: 310000,
    locked: true,
    ...overrides,
  };
}

describe('santei-data.utils', () => {
  describe('resolveDefaultSanteiTargetYear', () => {
    it('4月以降は当年を返す', () => {
      expect(resolveDefaultSanteiTargetYear(new Date(2026, 5, 1))).toBe(2026);
    });

    it('1〜3月は前年度を返す', () => {
      expect(resolveDefaultSanteiTargetYear(new Date(2026, 1, 1))).toBe(2025);
    });
  });

  describe('buildPayrollLookupByEmployeeId', () => {
    it('年月と従業員IDで給与エントリを参照できる', () => {
      const entry = createPayrollEntry();
      const lookup = buildPayrollLookupByEmployeeId([
        { targetMonth: '2025-04', entries: [entry] },
      ]);

      expect(lookup.get('2025-04')?.get('emp-1')).toEqual(entry);
    });
  });

  describe('buildSanteiDataFromPayroll', () => {
    it('4〜6月の給与実績から SanteiData を組み立てる', () => {
      const employee = createMockEmployee();
      const payrollByMonth = new Map<string, PayrollEntry | undefined>([
        ['2025-04', createPayrollEntry({ baseDays: 30, nonFixedWages: 0, totalPayment: 300000 })],
        ['2025-05', createPayrollEntry({ baseDays: 31, nonFixedWages: 0, totalPayment: 300000 })],
        ['2025-06', createPayrollEntry({ baseDays: 30, nonFixedWages: 20000, totalPayment: 320000 })],
      ]);

      const santeiData = buildSanteiDataFromPayroll(employee, 2025, payrollByMonth);

      expect(santeiData.targetYear).toBe(2025);
      expect(santeiData.applicationMonth).toBe('2025-09');
      expect(santeiData.months[0]).toEqual({
        paymentMonth: '04',
        baseDays: 30,
        currencyAmount: 300000,
        kindAmount: 0,
      });
      expect(santeiData.months[2].currencyAmount).toBe(320000);
      expect(santeiData.previousHealthStandardRemuneration).toBe(280000);
      expect(santeiData.previousRevisionMonth).toBe('2024-09');
    });

    it('給与未登録月は0で埋める', () => {
      const employee = createMockEmployee();
      const payrollByMonth = new Map<string, PayrollEntry | undefined>([
        ['2025-04', undefined],
        ['2025-05', undefined],
        ['2025-06', undefined],
      ]);

      const santeiData = buildSanteiDataFromPayroll(employee, 2025, payrollByMonth);

      expect(santeiData.months.every((month) => month.baseDays === 0)).toBeTrue();
      expect(santeiData.months.every((month) => month.currencyAmount === 0)).toBeTrue();
    });
  });
});
