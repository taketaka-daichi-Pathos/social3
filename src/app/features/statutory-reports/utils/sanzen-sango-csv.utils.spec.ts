import { Employee } from '@features/employees/models/employee.model';
import { CompanySettings } from '@features/settings/models/company-settings.model';
import { MaternityLeaveData } from '@features/statutory-reports/models/egov-export.model';
import {
  generateSanzenSangoData,
  SANZEN_SANGO_FIELD_COUNT,
  SANZEN_SANGO_FORM_CODE,
} from '@features/statutory-reports/utils/sanzen-sango-csv.utils';

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

describe('sanzen-sango-csv.utils', () => {
  it('33項目の新規申出データレコードを生成する', () => {
    const company = createMockCompany();
    const employee = createMockEmployee();
    const maternityData: MaternityLeaveData = {
      expectedDeliveryDate: new Date(2025, 5, 15),
      deliveryType: '1',
      leaveStartDate: new Date(2025, 4, 1),
      expectedLeaveEndDate: new Date(2025, 8, 30),
    };

    const csvLine = generateSanzenSangoData(employee, company, maternityData);
    const fields = csvLine.split(',');

    expect(fields.length).toBe(SANZEN_SANGO_FIELD_COUNT);
    expect(fields[0]).toBe(SANZEN_SANGO_FORM_CODE);
    expect(fields[1]).toBe('13');
    expect(fields[6]).toBe('田中\u3000花子');
    expect(fields[11]).toBe('1');
    expect(fields[16]).toBe('');
    expect(fields[17]).toBe('');
    expect(fields[20]).toBe('');
  });

  it('変更・終了用フィールドをマッピングする', () => {
    const company = createMockCompany();
    const employee = createMockEmployee();
    const maternityData: MaternityLeaveData = {
      expectedDeliveryDate: new Date(2025, 5, 15),
      deliveryType: '2',
      leaveStartDate: new Date(2025, 4, 1),
      expectedLeaveEndDate: new Date(2025, 8, 30),
      actualDeliveryDate: new Date(2025, 5, 10),
      isChangeOrEnd: true,
      changedExpectedDeliveryDate: new Date(2025, 5, 20),
      changedExpectedLeaveEndDate: new Date(2025, 9, 15),
      leaveEndDate: new Date(2025, 9, 1),
    };

    const fields = generateSanzenSangoData(employee, company, maternityData).split(',');

    expect(fields[11]).toBe('2');
    expect(fields[16]).not.toBe('');
    expect(fields[20]).not.toBe('');
    expect(fields[24]).not.toBe('');
  });
});
