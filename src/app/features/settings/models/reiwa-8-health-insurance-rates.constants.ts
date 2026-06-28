/** 令和8年度（2026年度）協会けんぽ 都道府県別健康保険料率（%） */
export const REIWA_8_HEALTH_INSURANCE_RATES: { [key: string]: number } = {
  北海道: 10.28,
  青森県: 9.85,
  岩手県: 9.51,
  宮城県: 10.1,
  秋田県: 10.01,
  山形県: 9.75,
  福島県: 9.5,
  茨城県: 9.52,
  栃木県: 9.82,
  群馬県: 9.68,
  埼玉県: 9.67,
  千葉県: 9.73,
  東京都: 9.85,
  神奈川県: 9.92,
  新潟県: 9.21,
  富山県: 9.59,
  石川県: 9.7,
  福井県: 9.71,
  山梨県: 9.55,
  長野県: 9.63,
  岐阜県: 9.8,
  静岡県: 9.61,
  愛知県: 9.93,
  三重県: 9.77,
  滋賀県: 9.88,
  京都府: 9.89,
  大阪府: 10.13,
  兵庫県: 10.12,
  奈良県: 9.91,
  和歌山県: 10.06,
  鳥取県: 9.86,
  島根県: 9.94,
  岡山県: 10.05,
  広島県: 9.78,
  山口県: 10.15,
  徳島県: 10.24,
  香川県: 10.02,
  愛媛県: 9.98,
  高知県: 10.05,
  福岡県: 10.11,
  佐賀県: 10.55,
  長崎県: 10.06,
  熊本県: 10.08,
  大分県: 10.08,
  宮崎県: 9.77,
  鹿児島県: 10.13,
  沖縄県: 9.44,
};

export const REIWA_8_PREFECTURE_NAMES = Object.keys(
  REIWA_8_HEALTH_INSURANCE_RATES
) as readonly string[];

export function getReiwa8HealthInsuranceRate(prefecture: string): number | null {
  const normalized = prefecture.trim();
  if (!normalized) {
    return null;
  }

  const rate = REIWA_8_HEALTH_INSURANCE_RATES[normalized];
  return rate ?? null;
}
