export interface PrefectureInsuranceRate {
  name: string;
  rate: number;
}

/** 都道府県別 健康保険料率（協会けんぽ・令和6年度） */
export const PREFECTURE_INSURANCE_RATES: readonly PrefectureInsuranceRate[] = [
  { name: '北海道', rate: 10.28 },
  { name: '青森県', rate: 9.85 },
  { name: '岩手県', rate: 9.51 },
  { name: '宮城県', rate: 10.1 },
  { name: '秋田県', rate: 10.01 },
  { name: '山形県', rate: 9.75 },
  { name: '福島県', rate: 9.5 },
  { name: '茨城県', rate: 9.52 },
  { name: '栃木県', rate: 9.82 },
  { name: '群馬県', rate: 9.68 },
  { name: '埼玉県', rate: 9.67 },
  { name: '千葉県', rate: 9.73 },
  { name: '東京都', rate: 9.85 },
  { name: '神奈川県', rate: 9.92 },
  { name: '新潟県', rate: 9.21 },
  { name: '富山県', rate: 9.59 },
  { name: '石川県', rate: 9.7 },
  { name: '福井県', rate: 9.71 },
  { name: '山梨県', rate: 9.55 },
  { name: '長野県', rate: 9.63 },
  { name: '岐阜県', rate: 9.8 },
  { name: '静岡県', rate: 9.61 },
  { name: '愛知県', rate: 9.93 },
  { name: '三重県', rate: 9.77 },
  { name: '滋賀県', rate: 9.88 },
  { name: '京都府', rate: 9.89 },
  { name: '大阪府', rate: 10.13 },
  { name: '兵庫県', rate: 10.12 },
  { name: '奈良県', rate: 9.91 },
  { name: '和歌山県', rate: 10.06 },
  { name: '鳥取県', rate: 9.86 },
  { name: '島根県', rate: 9.94 },
  { name: '岡山県', rate: 10.05 },
  { name: '広島県', rate: 9.78 },
  { name: '山口県', rate: 10.15 },
  { name: '徳島県', rate: 10.24 },
  { name: '香川県', rate: 10.02 },
  { name: '愛媛県', rate: 9.98 },
  { name: '高知県', rate: 10.05 },
  { name: '福岡県', rate: 10.11 },
  { name: '佐賀県', rate: 10.55 },
  { name: '長崎県', rate: 10.06 },
  { name: '熊本県', rate: 10.08 },
  { name: '大分県', rate: 10.08 },
  { name: '宮崎県', rate: 9.77 },
  { name: '鹿児島県', rate: 10.13 },
  { name: '沖縄県', rate: 9.44 },
];

/** 介護保険料率（全国一律） */
export const LONG_TERM_CARE_INSURANCE_RATE = 1.62;

export function findHealthInsuranceRate(prefectureName: string): number | null {
  return PREFECTURE_INSURANCE_RATES.find((row) => row.name === prefectureName)?.rate ?? null;
}
