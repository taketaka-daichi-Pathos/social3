import { getCareInsuranceRate } from '@features/settings/utils/care-insurance-rate.utils';
import { getHealthInsuranceRate } from '@features/settings/utils/health-insurance-rate.utils';

export interface ResolvedCompanyInsuranceRates {
  /** 健康保険料率（%表記。例: 9.85） */
  healthInsuranceRate: number;
  /** 介護保険料率（%表記） */
  longTermCareInsuranceRate: number;
}

/**
 * 都道府県と対象日から、会社マスターに保存する健康保険・介護保険料率（%）を解決する。
 * 新規企業登録・会社設定画面のマスター参照と同じロジック。
 */
export function resolveCompanyInsuranceRatesForPrefecture(
  prefectureName: string,
  targetDate: Date | string = new Date()
): ResolvedCompanyInsuranceRates {
  const normalized = prefectureName.trim();

  return {
    healthInsuranceRate: getHealthInsuranceRate(normalized, targetDate),
    longTermCareInsuranceRate: getCareInsuranceRate(targetDate),
  };
}
