import { getCurrentCareInsuranceRate } from '@features/settings/utils/care-insurance-rate.utils';
import {
  REIWA_8_HEALTH_INSURANCE_RATES,
  REIWA_8_PREFECTURE_NAMES,
  getReiwa8HealthInsuranceRate,
} from '@features/settings/models/reiwa-8-health-insurance-rates.constants';

export interface PrefectureInsuranceRate {
  name: string;
  rate: number;
}

/** 都道府県別 健康保険料率（令和8年度マスター） */
export const PREFECTURE_INSURANCE_RATES: readonly PrefectureInsuranceRate[] =
  REIWA_8_PREFECTURE_NAMES.map((name) => ({
    name,
    rate: REIWA_8_HEALTH_INSURANCE_RATES[name],
  }));

/** 介護保険料率（全国一律・現在日時点の最新料率） */
export const LONG_TERM_CARE_INSURANCE_RATE = getCurrentCareInsuranceRate();

export function findHealthInsuranceRate(prefectureName: string): number | null {
  return getReiwa8HealthInsuranceRate(prefectureName);
}
