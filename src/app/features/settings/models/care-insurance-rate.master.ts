/** 介護保険料率の適用期間（全国一律） */
export interface CareInsuranceRatePeriod {
  label: string;
  /** 適用開始日（YYYY-MM-DD・この日を含む） */
  effectiveFrom: string;
  /** 適用終了日（YYYY-MM-DD・この日を含む。null は以降継続） */
  effectiveTo: string | null;
  /** 介護保険料率（%） */
  ratePercent: number;
}

export const CARE_INSURANCE_RATE_PERIODS: readonly CareInsuranceRatePeriod[] = [
  {
    label: '平成21年3月',
    effectiveFrom: '2009-03-01',
    effectiveTo: '2010-02-28',
    ratePercent: 1.19,
  },
  {
    label: '平成22年3月',
    effectiveFrom: '2010-03-01',
    effectiveTo: '2011-02-28',
    ratePercent: 1.5,
  },
  {
    label: '平成23年3月',
    effectiveFrom: '2011-03-01',
    effectiveTo: '2012-02-29',
    ratePercent: 1.51,
  },
  {
    label: '平成24年3月',
    effectiveFrom: '2012-03-01',
    effectiveTo: '2014-02-28',
    ratePercent: 1.55,
  },
  {
    label: '平成26年3月',
    effectiveFrom: '2014-03-01',
    effectiveTo: '2015-03-31',
    ratePercent: 1.72,
  },
  {
    label: '平成27年4月',
    effectiveFrom: '2015-04-01',
    effectiveTo: '2017-02-28',
    ratePercent: 1.58,
  },
  {
    label: '平成29年3月',
    effectiveFrom: '2017-03-01',
    effectiveTo: '2018-02-28',
    ratePercent: 1.65,
  },
  {
    label: '平成30年3月',
    effectiveFrom: '2018-03-01',
    effectiveTo: '2019-02-28',
    ratePercent: 1.57,
  },
  {
    label: '平成31年3月',
    effectiveFrom: '2019-03-01',
    effectiveTo: '2020-02-29',
    ratePercent: 1.73,
  },
  {
    label: '令和2年3月',
    effectiveFrom: '2020-03-01',
    effectiveTo: '2021-02-28',
    ratePercent: 1.79,
  },
  {
    label: '令和3年3月',
    effectiveFrom: '2021-03-01',
    effectiveTo: '2022-02-28',
    ratePercent: 1.8,
  },
  {
    label: '令和4年3月',
    effectiveFrom: '2022-03-01',
    effectiveTo: '2023-02-28',
    ratePercent: 1.64,
  },
  {
    label: '令和5年3月',
    effectiveFrom: '2023-03-01',
    effectiveTo: '2024-02-28',
    ratePercent: 1.82,
  },
  {
    label: '令和6年3月',
    effectiveFrom: '2024-03-01',
    effectiveTo: '2025-02-28',
    ratePercent: 1.6,
  },
  {
    label: '令和7年3月',
    effectiveFrom: '2025-03-01',
    effectiveTo: '2026-02-28',
    ratePercent: 1.59,
  },
  {
    label: '令和8年3月',
    effectiveFrom: '2026-03-01',
    effectiveTo: null,
    ratePercent: 1.62,
  },
];

/** マスター開始日より前、または判定不能時のフォールバック料率（%） */
export const DEFAULT_CARE_INSURANCE_RATE_PERCENT = 1.62;

/** マスター最古期間の料率（%） */
export const OLDEST_CARE_INSURANCE_RATE_PERCENT =
  CARE_INSURANCE_RATE_PERIODS[0]?.ratePercent ?? DEFAULT_CARE_INSURANCE_RATE_PERCENT;
