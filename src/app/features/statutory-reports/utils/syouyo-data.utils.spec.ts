import { Employee } from '@features/employees/models/employee.model';
import {
  buildSyouyoDataFromBonusEntry,
  buildSyouyoDataFromEmployeeBonusHistory,
  hasEmployeeBonusForPaymentDate,
  resolveDefaultSyouyoPaymentDate,
} from '@features/statutory-reports/utils/syouyo-data.utils';

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
    bonusHistory: [
      {
        id: 'bonus-1',
        paymentMonth: '2025-12',
        paymentDate: '2025-12-10',
        fixedWagesAtPayment: 300000,
        bonusAmount: 500000,
        standardBonusAmount: 500000,
        savedAt: '2025-12-10T00:00:00.000Z',
      },
    ],
    leaveRecords: [],
    dependents: [],
    insuranceCardReturned: null,
    ...overrides,
  };
}

describe('syouyo-data.utils', () => {
  describe('resolveDefaultSyouyoPaymentDate', () => {
    it('従業員の最新賞与支給日を返す', () => {
      const employees = [createMockEmployee()];
      expect(resolveDefaultSyouyoPaymentDate(employees)).toBe('2025-12-10');
    });
  });

  describe('buildSyouyoDataFromBonusEntry', () => {
    it('賞与履歴から SyouyoData を組み立てる', () => {
      const syouyoData = buildSyouyoDataFromBonusEntry({
        id: 'bonus-1',
        paymentMonth: '2025-12',
        paymentDate: '2025-12-10',
        fixedWagesAtPayment: 300000,
        bonusAmount: 500000,
        standardBonusAmount: 500000,
        savedAt: '2025-12-10T00:00:00.000Z',
      });

      expect(syouyoData.currencyAmount).toBe(500000);
      expect(syouyoData.kindAmount).toBe(0);
      expect(syouyoData.totalAmount).toBe(500000);
      expect(syouyoData.paymentDate.getFullYear()).toBe(2025);
      expect(syouyoData.paymentDate.getMonth()).toBe(11);
      expect(syouyoData.paymentDate.getDate()).toBe(10);
    });
  });

  describe('buildSyouyoDataFromEmployeeBonusHistory', () => {
    it('指定日の賞与履歴を取得できる', () => {
      const employee = createMockEmployee();
      const syouyoData = buildSyouyoDataFromEmployeeBonusHistory(employee, '2025-12-10');

      expect(syouyoData?.totalAmount).toBe(500000);
      expect(hasEmployeeBonusForPaymentDate(employee, '2025-12-10')).toBeTrue();
      expect(hasEmployeeBonusForPaymentDate(employee, '2025-11-10')).toBeFalse();
    });
  });
});
