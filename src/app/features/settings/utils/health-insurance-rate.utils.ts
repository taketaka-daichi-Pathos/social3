import {
  DEFAULT_HEALTH_INSURANCE_RATE_PERCENT,
  HEALTH_INSURANCE_RATE_PERIODS,
  HEALTH_INSURANCE_RATES_BY_PREFECTURE,
} from '@features/settings/models/health-insurance-rate.master';
import { getReiwa8HealthInsuranceRate } from '@features/settings/models/reiwa-8-health-insurance-rates.constants';
import {
  compareDateKeys,
  formatDateKey,
  parseInsuranceRateTargetDate,
  toRateTargetDateFromYearMonth,
} from '@features/settings/utils/insurance-rate-date.utils';

export { toRateTargetDateFromYearMonth };

const REIWA8_EFFECTIVE_FROM = '2026-03-01';

function findApplicablePeriodIndex(targetDate: Date): number {
  const targetKey = formatDateKey(targetDate);

  if (compareDateKeys(targetKey, REIWA8_EFFECTIVE_FROM) >= 0) {
    return HEALTH_INSURANCE_RATE_PERIODS.length - 1;
  }

  for (let index = HEALTH_INSURANCE_RATE_PERIODS.length - 1; index >= 0; index -= 1) {
    const period = HEALTH_INSURANCE_RATE_PERIODS[index];
    if (compareDateKeys(targetKey, period.effectiveFrom) < 0) {
      continue;
    }

    if (period.effectiveTo == null || compareDateKeys(targetKey, period.effectiveTo) <= 0) {
      return index;
    }
  }

  return -1;
}

/**
 * 対象日時点で有効な健康保険料率（%）を返す。
 * 計算時は 100 で割って小数に変換すること。
 */
export function getHealthInsuranceRate(prefecture: string, targetDate: Date | string): number {
  const parsedDate = parseInsuranceRateTargetDate(targetDate);
  if (!parsedDate) {
    console.warn('[Debug] getHealthInsuranceRate: targetDate の解析に失敗', targetDate);
    return DEFAULT_HEALTH_INSURANCE_RATE_PERCENT;
  }

  const periodIndex = findApplicablePeriodIndex(parsedDate);
  const normalizedPrefecture = prefecture.trim();
  const prefectureRates = HEALTH_INSURANCE_RATES_BY_PREFECTURE[normalizedPrefecture] ?? null;

  console.log('[Debug] getHealthInsuranceRate マスター引き当て:', {
    prefecture: normalizedPrefecture,
    targetDate,
    periodIndex,
    selectedPeriod: periodIndex >= 0 ? HEALTH_INSURANCE_RATE_PERIODS[periodIndex] : null,
    prefectureRates,
  });

  if (periodIndex === HEALTH_INSURANCE_RATE_PERIODS.length - 1) {
    const rate = getReiwa8HealthInsuranceRate(normalizedPrefecture) ?? DEFAULT_HEALTH_INSURANCE_RATE_PERCENT;
    console.log('[Debug] getHealthInsuranceRate 令和8年度料率:', rate);
    return rate;
  }

  const rates = prefectureRates;
  if (!rates) {
    console.warn('[Debug] getHealthInsuranceRate: 都道府県未登録', normalizedPrefecture);
    return DEFAULT_HEALTH_INSURANCE_RATE_PERCENT;
  }

  if (periodIndex < 0) {
    console.log('[Debug] getHealthInsuranceRate 最古期間フォールバック:', rates[0]);
    return rates[0];
  }

  const rate = rates[periodIndex] ?? rates[rates.length - 1];
  console.log('[Debug] getHealthInsuranceRate 決定料率(%):', rate);
  return rate;
}
