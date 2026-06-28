import { Employee } from '@features/employees/models/employee.model';
import { PayrollEntry } from '@features/payroll/models/compensation.model';
import {
  buildGeppenDataFromPayroll,
  resolveGeppenPayrollYearMonths,
} from '@features/statutory-reports/utils/geppen-data.utils';

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
    nonFixedWages: 0,
    baseDays: 30,
    adjustmentAmount: 0,
    totalPayment: 300000,
    locked: true,
    ...overrides,
  };
}

describe('geppen-data.utils', () => {
  describe('resolveGeppenPayrollYearMonths', () => {
    it('改定年月の前三ヶ月〜前一ヶ月を返す', () => {
      expect(resolveGeppenPayrollYearMonths('2025-09')).toEqual([
        '2025-06',
        '2025-07',
        '2025-08',
      ]);
    });
  });

  describe('buildGeppenDataFromPayroll', () => {
    it('改定年月に基づき GeppenData を組み立てる', () => {
      const employee = createMockEmployee();
      const payrollByMonth = new Map<string, PayrollEntry | undefined>([
        ['2025-05', createPayrollEntry({ baseSalary: 280000, totalPayment: 280000 })],
        ['2025-06', createPayrollEntry({ baseSalary: 320000, totalPayment: 320000 })],
        ['2025-07', createPayrollEntry({ baseDays: 31, totalPayment: 320000 })],
        ['2025-08', createPayrollEntry({ baseDays: 31, totalPayment: 320000 })],
      ]);

      const geppenData = buildGeppenDataFromPayroll(employee, '2025-09', payrollByMonth);

      expect(geppenData.revisionDate.getFullYear()).toBe(2025);
      expect(geppenData.revisionDate.getMonth()).toBe(8);
      expect(geppenData.months[0].paymentMonth).toBe('06');
      expect(geppenData.months[2].paymentMonth).toBe('08');
      expect(geppenData.salaryChangeMonth).toBe('06');
      expect(geppenData.salaryChangeCategory).toBe('1');
      expect(geppenData.previousHealthStandardRemuneration).toBe(280000);
    });
  });
});
