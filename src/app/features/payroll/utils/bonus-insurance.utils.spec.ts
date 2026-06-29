import { CompanySettings } from '@features/settings/models/company-settings.model';
import { CompensationEntry, CompensationRecord } from '@features/payroll/models/compensation.model';
import {
  calculateBonusInsurancePremiums,
  getSameMonthExistingStandardBonusTotal,
  parseTargetYearMonth,
  PENSION_BONUS_STANDARD_CAP,
  resolvePayrollInsuranceRates,
  resolvePensionBonusStandard,
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
    systemStartDate: '2025-04',
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

describe('resolvePensionBonusStandard', () => {
  it('applies the monthly pension cap against existing same-month bonuses', () => {
    expect(resolvePensionBonusStandard(800_000, 1_000_000)).toBe(500_000);
    expect(resolvePensionBonusStandard(800_000, 1_500_000)).toBe(0);
    expect(resolvePensionBonusStandard(800_000, 0)).toBe(800_000);
  });

  it('does not exceed the statutory monthly cap even without prior bonuses', () => {
    expect(resolvePensionBonusStandard(2_000_000, 0)).toBe(PENSION_BONUS_STANDARD_CAP);
  });
});

describe('getSameMonthExistingStandardBonusTotal', () => {
  it('sums only bonuses paid before the current payment date in the same month', () => {
    const record: CompensationRecord = {
      targetMonth: '2026-07',
      entries: [
        {
          employeeId: 'emp-1',
          locked: true,
          paymentDate: '2026-07-10',
          bonusAmount: 1_000_000,
          standardBonusAmount: 1_000_000,
        } as CompensationEntry,
        {
          employeeId: 'emp-1',
          locked: true,
          paymentDate: '2026-07-25',
          bonusAmount: 200_000,
          standardBonusAmount: 200_000,
        } as CompensationEntry,
        {
          employeeId: 'emp-2',
          locked: true,
          paymentDate: '2026-07-15',
          bonusAmount: 500_000,
          standardBonusAmount: 500_000,
        } as CompensationEntry,
      ],
    };

    const recordsByMonth = new Map<string, CompensationRecord>([['2026-07', record]]);

    expect(
      getSameMonthExistingStandardBonusTotal('emp-1', '2026-07', recordsByMonth, '2026-07-25')
    ).toBe(1_000_000);
    expect(
      getSameMonthExistingStandardBonusTotal('emp-1', '2026-07', recordsByMonth, '2026-07-10')
    ).toBe(0);
    expect(getSameMonthExistingStandardBonusTotal('emp-1', '2026-07', recordsByMonth)).toBe(
      1_200_000
    );
    expect(getSameMonthExistingStandardBonusTotal('emp-2', '2026-07', recordsByMonth)).toBe(
      500_000
    );
  });

  it('does not let later bonuses erase earlier pension cap allocation in the same month', () => {
    const record: CompensationRecord = {
      targetMonth: '2026-01',
      entries: [
        {
          employeeId: 'emp-1',
          locked: true,
          paymentDate: '2026-01-01',
          bonusAmount: 30_000,
          standardBonusAmount: 30_000,
        } as CompensationEntry,
        {
          employeeId: 'emp-1',
          locked: true,
          paymentDate: '2026-01-02',
          bonusAmount: 3_000_000,
          standardBonusAmount: 3_000_000,
        } as CompensationEntry,
      ],
    };
    const recordsByMonth = new Map<string, CompensationRecord>([['2026-01', record]]);
    const rates = {
      healthRate: 0.1,
      longTermCareRate: 0.02,
      pensionRate: 0.183,
    };

    const first = calculateBonusInsurancePremiums(
      30_000,
      0,
      true,
      rates,
      getSameMonthExistingStandardBonusTotal(
        'emp-1',
        '2026-01',
        recordsByMonth,
        '2026-01-01'
      )
    );
    const second = calculateBonusInsurancePremiums(
      3_000_000,
      30_000,
      true,
      rates,
      getSameMonthExistingStandardBonusTotal(
        'emp-1',
        '2026-01',
        recordsByMonth,
        '2026-01-02'
      )
    );

    expect(first.pensionStandardBonus).toBe(30_000);
    expect(second.pensionStandardBonus).toBe(1_470_000);
    expect(first.pensionStandardBonus + second.pensionStandardBonus).toBe(1_500_000);
  });
});

describe('calculateBonusInsurancePremiums', () => {
  const rates = {
    healthRate: 0.1,
    longTermCareRate: 0.02,
    pensionRate: 0.183,
  };

  it('allocates remaining monthly pension cap when prior bonuses exist in the same month', () => {
    const result = calculateBonusInsurancePremiums(800_000, 0, true, rates, 1_000_000);

    expect(result.pensionStandardBonus).toBe(500_000);
    expect(result.healthStandardBonus).toBe(800_000);
  });
});
