import { Employee } from '@features/employees/models/employee.model';
import { CompanySettings } from '@features/settings/models/company-settings.model';
import { ChildcareLeaveData } from '@features/statutory-reports/models/egov-export.model';
import {
  generateIkujiKyugyoData,
  IKUJI_KYUGYO_FIELD_COUNT,
  IKUJI_KYUGYO_FORM_CODE,
} from '@features/statutory-reports/utils/ikuji-kyugyo-csv.utils';

function createMockCompany(): CompanySettings {
  return {
    companyId: 'test-company',
    companyName: 'テスト株式会社',
    employerLastName: '山田',
    employerFirstName: '太郎',
    employerLastNameKana: 'ヤマダ',
    employerFirstNameKana: 'タロウ',
    postalCode: '100-0001',
    prefecture: '東京都',
    cityAddress: '千代田区1-1',
    phoneNumber: '03-1234-5678',
    prefectureCode: '13',
    districtCode: '13',
    referenceMark: '1431312121',
    officeNumber: '12345',
    healthInsuranceRate: null,
    longTermCareInsuranceRate: null,
    allowances: [],
  };
}

function createMockEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    companyOwnerUid: 'owner-1',
    authUid: null,
    loginEmail: null,
    employeeNumber: '001',
    registrationType: 'existing',
    lastName: '田中',
    firstName: '一郎',
    lastNameKana: 'タナカ',
    firstNameKana: 'イチロウ',
    birthDate: '1988-03-10',
    gender: 'male',
    hireDate: '2018-04-01',
    myNumber: '123456789012',
    hasDependents: false,
    insuredPersonNumber: '1234567',
    baseSalary: 350000,
    healthStandardRemuneration: 350000,
    pensionStandardRemuneration: 350000,
    applicableStartMonth: '2018-04',
    resignationDate: null,
    status: 'active',
    createdAt: '2018-04-01T00:00:00.000Z',
    allowances: [],
    healthGrade: 22,
    pensionGrade: 20,
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

describe('ikuji-kyugyo-csv.utils', () => {
  it('56項目の新規申出データレコードを生成する', () => {
    const company = createMockCompany();
    const employee = createMockEmployee();
    const childcareData: ChildcareLeaveData = {
      leaveStartDate: new Date(2025, 3, 1),
      expectedLeaveEndDate: new Date(2026, 2, 28),
      children: [
        {
          nameKana: 'タナカ ハナコ',
          nameKanji: '田中　花子',
          birthDate: new Date(2025, 0, 15),
        },
      ],
      isExtension: false,
      isTermination: false,
    };

    const record = generateIkujiKyugyoData(employee, company, childcareData);
    const fields = record.split(',');

    expect(fields.length).toBe(IKUJI_KYUGYO_FIELD_COUNT);
    expect(fields[0]).toBe(IKUJI_KYUGYO_FORM_CODE);
    expect(fields[1]).toBe('13');
    expect(fields[7]).toBe('123456789012');
    expect(fields[12]).toBe('タナカ ハナコ');
    expect(fields[13]).toBe('田中　花子');
    expect(fields[18]).toBe('5');
    expect(fields[19]).toBe('070401');
    expect(fields[20]).toBe('5');
    expect(fields[21]).toBe('080228');
  });

  it('終了届フラグと実際の終了日を出力する', () => {
    const company = createMockCompany();
    const employee = createMockEmployee();
    const childcareData: ChildcareLeaveData = {
      leaveStartDate: new Date(2024, 9, 1),
      expectedLeaveEndDate: new Date(2025, 8, 30),
      children: [
        {
          nameKana: 'スズキ タロウ',
          nameKanji: '鈴木　太郎',
          birthDate: new Date(2024, 4, 20),
        },
      ],
      isExtension: false,
      isTermination: true,
      actualEndDate: new Date(2025, 5, 15),
    };

    const fields = generateIkujiKyugyoData(employee, company, childcareData).split(',');

    expect(fields[23]).toBe('5');
    expect(fields[24]).toBe('070615');
    expect(fields[25]).toBe('1');
  });
});
