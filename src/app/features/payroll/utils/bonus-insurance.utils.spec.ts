import { CompanySettings } from '@features/settings/models/company-settings.model';
import {
  parseTargetYearMonth,
  resolvePayrollInsuranceRates,
} from '@features/payroll/utils/bonus-insurance.utils';

function createCompany(
  overrides: Partial<CompanySettings> = {}
): CompanySettings {
  return {
    companyId: '12345',
    companyName: 'テスト株式会社',
    employerLastName: '山田',
    employerFirstName: '太郎',
    employerLastNameKana: 'ヤマダ',
    employerFirstNameKana: 'タロウ',
    postalCode: '1000001',
    prefecture: '東京都',
    cityAddress: '千代田区',
    phoneNumber: '0312345678',
    prefectureCode: '13',
    districtCode: '001',
    referenceMark: '1',
    officeNumber: '12345',
    healthInsuranceRate: 9.85,
    longTermCareInsuranceRate: 1.62,
    insuranceRateHistory: [],
    allowances: [],
    ...overrides,
  };
}

describe('resolvePayrollInsuranceRates', () => {
  it('uses master rates for the target year-month instead of latest company saved rates', () => {
    const company = createCompany();

    const rates202504 = resolvePayrollInsuranceRates(company, { targetYear: 2025, targetMonth: 4 });
    const rates202604 = resolvePayrollInsuranceRates(company, { targetYear: 2026, targetMonth: 4 });

    expect(rates202504.healthRate).toBeCloseTo(0.0991, 6);
    expect(rates202504.longTermCareRate).toBeCloseTo(0.0159, 6);
    expect(rates202604.healthRate).toBeCloseTo(0.0985, 6);
    expect(rates202604.longTermCareRate).toBeCloseTo(0.0162, 6);
  });

  it('prefers company rate history when an applicable entry exists', () => {
    const company = createCompany({
      insuranceRateHistory: [
        {
          id: 'history-1',
          applicableMonth: '2025-03',
          healthInsuranceRate: 10.5,
          careInsuranceRate: 1.7,
          updatedAt: null,
        },
      ],
    });

    const rates = resolvePayrollInsuranceRates(company, { targetYear: 2025, targetMonth: 4 });

    expect(rates.healthRate).toBeCloseTo(0.105, 6);
    expect(rates.longTermCareRate).toBeCloseTo(0.017, 6);
  });

  it('accepts YYYY-MM string targets', () => {
    const company = createCompany({ prefecture: '大阪府' });

    const rates = resolvePayrollInsuranceRates(company, '2024-04-01');

    expect(rates.healthRate).toBeCloseTo(0.1034, 6);
    expect(rates.longTermCareRate).toBeCloseTo(0.016, 6);
  });
});

describe('parseTargetYearMonth', () => {
  it('parses valid year-month keys', () => {
    expect(parseTargetYearMonth('2025-04')).toEqual({ targetYear: 2025, targetMonth: 4 });
  });

  it('returns null for invalid values', () => {
    expect(parseTargetYearMonth('2025-13')).toBeNull();
    expect(parseTargetYearMonth('invalid')).toBeNull();
  });
});
