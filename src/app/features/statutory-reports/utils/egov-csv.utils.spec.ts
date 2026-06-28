import { Employee } from '@features/employees/models/employee.model';
import { CompanySettings } from '@features/settings/models/company-settings.model';
import { SanteiData } from '@features/statutory-reports/models/egov-export.model';
import { GeppenData } from '@features/statutory-reports/models/egov-export.model';
import { revisionYearMonthToDate } from '@features/statutory-reports/utils/geppen-data.utils';
import {
  buildMediaManagementRecord,
  buildOfficeIdentificationRecord,
  generateEgovHeader,
  generateSanteiKisoData,
  generateGeppenData,
  generateShikakuSoshitsuData,
  generateSyouyoData,
  resolveQualificationLossDate,
} from '@features/statutory-reports/utils/egov-csv.utils';

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
    firstName: '花子',
    lastNameKana: 'タナカ',
    firstNameKana: 'ハナコ',
    birthDate: '1990-04-15',
    gender: 'female',
    hireDate: '2020-04-01',
    myNumber: '123456789012',
    hasDependents: false,
    insuredPersonNumber: '',
    baseSalary: 300000,
    healthStandardRemuneration: 300000,
    pensionStandardRemuneration: 300000,
    applicableStartMonth: '2020-04',
    resignationDate: '2025-06-30',
    status: 'retired',
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

function createMockSanteiData(overrides: Partial<SanteiData> = {}): SanteiData {
  return {
    targetYear: 2025,
    months: [
      { paymentMonth: '04', baseDays: 30, currencyAmount: 300000, kindAmount: 0 },
      { paymentMonth: '05', baseDays: 31, currencyAmount: 300000, kindAmount: 0 },
      { paymentMonth: '06', baseDays: 30, currencyAmount: 310000, kindAmount: 0 },
    ],
    ...overrides,
  };
}

describe('egov-csv.utils', () => {
  describe('buildMediaManagementRecord', () => {
    it('6項目をカンマ区切りで出力する', () => {
      const company = createMockCompany();
      const record = buildMediaManagementRecord(company, '20260627', '001');

      expect(record).toBe('13,13,1431312121,001,20260627,22223');
      expect(record.split(',').length).toBe(6);
    });
  });

  describe('buildOfficeIdentificationRecord', () => {
    it('先頭カンマ付きの媒体連番を出力する', () => {
      expect(buildOfficeIdentificationRecord('001')).toBe(',001');
    });
  });

  describe('generateEgovHeader', () => {
    it('公式仕様どおりの5行構成で出力する', () => {
      const company = createMockCompany();
      const header = generateEgovHeader(company, '20260627', '001');
      const lines = header.split('\r\n');

      expect(lines).toHaveSize(5);
      expect(lines[0]).toBe('13,13,1431312121,001,20260627,22223');
      expect(lines[1]).toBe('[kanri]');
      expect(lines[2]).toBe(',001');
      expect(lines[3]).toBe(
        '13,13,1431312121,12345,0000,1000001,東京都千代田区1-1,テスト株式会社,山田\u3000太郎,03,1234,5678'
      );
      expect(lines[4]).toBe('[data]');
    });
  });

  describe('resolveQualificationLossDate', () => {
    it('退職日の翌日を返す', () => {
      const lossDate = resolveQualificationLossDate('2025-06-30');
      expect(lossDate?.getFullYear()).toBe(2025);
      expect(lossDate?.getMonth()).toBe(6);
      expect(lossDate?.getDate()).toBe(1);
    });
  });

  describe('generateShikakuSoshitsuData', () => {
    it('27項目の資格喪失届データレコードを生成する', () => {
      const company = createMockCompany();
      const employee = createMockEmployee();
      const record = generateShikakuSoshitsuData(employee, company);
      const fields = record.split(',');

      expect(fields).toHaveSize(27);
      expect(fields[0]).toBe('2221700');
      expect(fields[10]).toBe('123456789012');
      expect(fields[13]).toBe('9');
      expect(fields[14]).toBe('070701');
      expect(fields[15]).toBe('1');
      expect(fields[16]).toBe('9');
      expect(fields[17]).toBe('070630');
    });
  });

  describe('generateSanteiKisoData', () => {
    it('53項目の算定基礎届データレコードを生成する', () => {
      const company = createMockCompany();
      const employee = createMockEmployee({
        insuredPersonNumber: '1234567',
        applicableStartMonth: '2024-09',
      });
      const santeiData = createMockSanteiData();
      const record = generateSanteiKisoData(employee, company, santeiData);
      const fields = record.split(',');

      expect(fields).toHaveSize(53);
      expect(fields[0]).toBe('2222700');
      expect(fields[1]).toBe('13');
      expect(fields[3]).toBe('1431312121');
      expect(fields[4]).toBe('1234567');
      expect(fields[7]).toBe('7');
      expect(fields[8]).toBe('020415');
      expect(fields[9]).toBe('9');
      expect(fields[10]).toBe('07');
      expect(fields[11]).toBe('09');
      expect(fields[12]).toBe('300000');
      expect(fields[13]).toBe('300000');
      expect(fields[14]).toBe('6');
      expect(fields[15]).toBe('06');
      expect(fields[16]).toBe('09');
      expect(fields[21]).toBe('04');
      expect(fields[22]).toBe('05');
      expect(fields[23]).toBe('06');
      expect(fields[24]).toBe('30');
      expect(fields[27]).toBe('300000');
      expect(fields[29]).toBe('310000');
      expect(fields[33]).toBe('300000');
      expect(fields[35]).toBe('310000');
      expect(fields[36]).toBe('910000');
      expect(fields[37]).toBe('303333');
      expect(fields[39]).toBe('123456789012');
    });
  });

  describe('generateGeppenData', () => {
    it('49項目の月額変更届データレコードを生成する', () => {
      const company = createMockCompany();
      const employee = createMockEmployee({
        insuredPersonNumber: '7654321',
        applicableStartMonth: '2024-09',
        resignationDate: null,
        status: 'active',
      });
      const geppenData: GeppenData = {
        revisionDate: revisionYearMonthToDate('2025-09'),
        months: [
          { paymentMonth: '06', baseDays: 30, currencyAmount: 300000, kindAmount: 0 },
          { paymentMonth: '07', baseDays: 31, currencyAmount: 300000, kindAmount: 0 },
          { paymentMonth: '08', baseDays: 31, currencyAmount: 320000, kindAmount: 0 },
        ],
        previousHealthStandardRemuneration: 280000,
        previousPensionStandardRemuneration: 280000,
        previousRevisionMonth: '2024-09',
        salaryChangeMonth: '06',
        salaryChangeCategory: '1',
      };
      const record = generateGeppenData(employee, company, geppenData);
      const fields = record.split(',');

      expect(fields).toHaveSize(49);
      expect(fields[0]).toBe('2221703');
      expect(fields[4]).toBe('7654321');
      expect(fields[9]).toBe('9');
      expect(fields[10]).toBe('07');
      expect(fields[11]).toBe('09');
      expect(fields[12]).toBe('280000');
      expect(fields[17]).toBe('06');
      expect(fields[18]).toBe('1');
      expect(fields[21]).toBe('06');
      expect(fields[23]).toBe('08');
      expect(fields[36]).toBe('920000');
      expect(fields[37]).toBe('306667');
      expect(fields[48]).toBe('');
    });
  });

  describe('generateSyouyoData', () => {
    it('21項目の賞与支払届データレコードを生成する', () => {
      const company = createMockCompany();
      const employee = createMockEmployee({
        insuredPersonNumber: '7654321',
        resignationDate: null,
        status: 'active',
      });
      const record = generateSyouyoData(employee, company, {
        paymentDate: new Date(2025, 11, 10),
        currencyAmount: 500000,
        kindAmount: 0,
        totalAmount: 500000,
      });
      const fields = record.split(',');

      expect(fields).toHaveSize(21);
      expect(fields[0]).toBe('2227700');
      expect(fields[4]).toBe('7654321');
      expect(fields[9]).toBe('9');
      expect(fields[10]).toBe('071210');
      expect(fields[11]).toBe('500000');
      expect(fields[12]).toBe('0');
      expect(fields[13]).toBe('500000');
      expect(fields[14]).toBe('123456789012');
      expect(fields[20]).toBe('');
    });
  });
});
