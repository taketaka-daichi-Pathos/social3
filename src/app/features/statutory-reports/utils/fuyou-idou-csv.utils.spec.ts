import { Dependent } from '@features/dependents/models/dependent.model';
import { Employee } from '@features/employees/models/employee.model';
import { CompanySettings } from '@features/settings/models/company-settings.model';
import {
  FUYOU_IDOU_BLOCK_OFFSET,
  FUYOU_IDOU_FIELD_COUNT,
  FUYOU_IDOU_FORM_CODE,
  generateFuyouIdouData,
} from '@features/statutory-reports/utils/fuyou-idou-csv.utils';
import { splitDependentsForFuyouIdou } from '@features/statutory-reports/utils/fuyou-idou-data.utils';

function createMockCompany(overrides: Partial<CompanySettings> = {}): CompanySettings {
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
    ...overrides,
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
    birthDate: '1985-03-10',
    gender: 'male',
    hireDate: '2020-04-01',
    myNumber: '123456789012',
    postalCode: '1000001',
    address: '東京都千代田区1-1',
    hasDependents: true,
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

function createMockDependent(overrides: Partial<Dependent> = {}): Dependent {
  return {
    lastName: '田中',
    firstName: '花子',
    lastNameKana: 'タナカ',
    firstNameKana: 'ハナコ',
    romanName: '',
    birthDate: '1990-04-15',
    relationship: 'spouse',
    livingArrangement: 'cohabiting',
    dependencyStartDate: '2020-04-01',
    hasDisability: false,
    occupation: 'unemployed',
    currentSituation: 'other',
    gender: 'female',
    myNumber: '210987654321',
    changeDate: '2025-06-01',
    changeReason: '1',
    ...overrides,
  };
}

describe('fuyou-idou-csv.utils', () => {
  it('139項目のデータレコードを生成する', () => {
    const company = createMockCompany();
    const employee = createMockEmployee();
    const spouse = createMockDependent();
    const child = createMockDependent({
      lastName: '田中',
      firstName: '次郎',
      lastNameKana: 'タナカ',
      firstNameKana: 'ジロウ',
      birthDate: '2015-08-20',
      relationship: 'child',
      gender: 'male',
      myNumber: '',
      basicPensionNumber: '1234567890',
    });

    const csvLine = generateFuyouIdouData(employee, company, [spouse, child]);
    const fields = csvLine.split(',');

    expect(fields.length).toBe(FUYOU_IDOU_FIELD_COUNT);
    expect(fields[FUYOU_IDOU_BLOCK_OFFSET.FORM]).toBe(FUYOU_IDOU_FORM_CODE);
    expect(fields[FUYOU_IDOU_BLOCK_OFFSET.PREFECTURE]).toBe('13');
    expect(fields[FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_NAME_KANJI]).toBe('田中\u3000一郎');
    expect(fields[FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_MYNUMBER]).toBe('123456789012');
    expect(fields[FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_POSTAL]).toBe('1000001');
    expect(fields[FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_ADDRESS]).toBe('東京都千代田区1-1');
    expect(fields[FUYOU_IDOU_BLOCK_OFFSET.SPOUSE_START]).toBe('タナカ ハナコ');
    expect(fields[FUYOU_IDOU_BLOCK_OFFSET.SPOUSE_START + 1]).toBe('田中\u3000花子');
    expect(fields[FUYOU_IDOU_BLOCK_OFFSET.OTHER1_START]).toBe('タナカ ジロウ');
    expect(fields[FUYOU_IDOU_BLOCK_OFFSET.OTHER1_START + 5]).toBe('2');
  });

  it('配偶者とその他被扶養者を分割する', () => {
    const spouse = createMockDependent({ relationship: 'spouse' });
    const child1 = createMockDependent({ relationship: 'child', firstName: 'A' });
    const child2 = createMockDependent({ relationship: 'child', firstName: 'B' });
    const child3 = createMockDependent({ relationship: 'child', firstName: 'C' });
    const child4 = createMockDependent({ relationship: 'child', firstName: 'D' });

    const result = splitDependentsForFuyouIdou([child1, spouse, child2, child3, child4]);

    expect(result.spouse).toBe(spouse);
    expect(result.others.length).toBe(3);
    expect(result.others.map((row) => row.firstName)).toEqual(['A', 'B', 'C']);
  });
});
