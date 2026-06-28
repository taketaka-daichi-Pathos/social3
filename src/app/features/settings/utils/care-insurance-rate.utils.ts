import {
  CARE_INSURANCE_RATE_PERIODS,
  DEFAULT_CARE_INSURANCE_RATE_PERCENT,
  OLDEST_CARE_INSURANCE_RATE_PERCENT,
} from '@features/settings/models/care-insurance-rate.master';
import {
  compareDateKeys,
  formatDateKey,
  parseInsuranceRateTargetDate,
} from '@features/settings/utils/insurance-rate-date.utils';

function findApplicableCareRatePeriod(targetDate: Date) {
  const targetKey = formatDateKey(targetDate);

  for (let index = CARE_INSURANCE_RATE_PERIODS.length - 1; index >= 0; index -= 1) {
    const period = CARE_INSURANCE_RATE_PERIODS[index];
    if (compareDateKeys(targetKey, period.effectiveFrom) < 0) {
      continue;
    }

    if (period.effectiveTo == null || compareDateKeys(targetKey, period.effectiveTo) <= 0) {
      return period;
    }
  }

  return null;
}

/**
 * 対象日時点で有効な介護保険料率（%）を返す。
 * 計算時は 100 で割って小数に変換すること。
 */
export function getCareInsuranceRate(targetDate: Date | string): number {
  const parsedDate = parseInsuranceRateTargetDate(targetDate);
  if (!parsedDate) {
    console.warn('[Debug] getCareInsuranceRate: targetDate の解析に失敗', targetDate);
    return DEFAULT_CARE_INSURANCE_RATE_PERCENT;
  }

  const period = findApplicableCareRatePeriod(parsedDate);
  console.log('[Debug] getCareInsuranceRate マスター引き当て:', {
    targetDate,
    selectedPeriod: period,
    allPeriods: CARE_INSURANCE_RATE_PERIODS,
  });

  if (!period) {
    console.log('[Debug] getCareInsuranceRate 最古期間フォールバック:', OLDEST_CARE_INSURANCE_RATE_PERCENT);
    return OLDEST_CARE_INSURANCE_RATE_PERCENT;
  }

  console.log('[Debug] getCareInsuranceRate 決定料率(%):', period.ratePercent);
  return period.ratePercent;
}

/** 現在日時点の最新介護保険料率（%） */
export function getCurrentCareInsuranceRate(): number {
  return getCareInsuranceRate(new Date());
}
