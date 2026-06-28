import { resolveCompanyInsuranceRatesForPrefecture } from '@features/settings/utils/company-insurance-rate.utils';

describe('company-insurance-rate.utils', () => {
  it('都道府県名から健康保険料率（%）を解決する', () => {
    const rates = resolveCompanyInsuranceRatesForPrefecture('東京都', '2026-06-01');

    expect(rates.healthInsuranceRate).toBe(9.85);
    expect(rates.longTermCareInsuranceRate).toBeGreaterThan(0);
  });

  it('都道府県未指定時はデフォルト料率を返す', () => {
    const rates = resolveCompanyInsuranceRatesForPrefecture('', '2026-06-01');

    expect(rates.healthInsuranceRate).toBeGreaterThan(0);
    expect(rates.longTermCareInsuranceRate).toBeGreaterThan(0);
  });
});
