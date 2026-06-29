/** 社会保険（e-Gov等）専用の都道府県コード。一般的な JIS コードとは異なります。 */
export const SOCIAL_INSURANCE_PREFECTURE_CODES: Readonly<Record<string, string>> = {
  北海道: '01',
  青森県: '02',
  岩手県: '03',
  宮城県: '04',
  秋田県: '05',
  山形県: '06',
  福島県: '07',
  茨城県: '08',
  栃木県: '09',
  群馬県: '10',
  埼玉県: '11',
  千葉県: '12',
  東京都: '21',
  神奈川県: '31',
  新潟県: '32',
  富山県: '33',
  石川県: '34',
  福井県: '35',
  山梨県: '36',
  長野県: '37',
  岐阜県: '38',
  静岡県: '39',
  愛知県: '41',
  三重県: '42',
  滋賀県: '51',
  京都府: '52',
  大阪府: '53',
  兵庫県: '54',
  奈良県: '55',
  和歌山県: '56',
  鳥取県: '57',
  島根県: '58',
  岡山県: '59',
  広島県: '60',
  山口県: '61',
  徳島県: '71',
  香川県: '72',
  愛媛県: '73',
  高知県: '74',
  福岡県: '75',
  佐賀県: '76',
  長崎県: '77',
  熊本県: '78',
  大分県: '79',
  宮崎県: '80',
  鹿児島県: '81',
  沖縄県: '82',
};

export function resolveSocialInsurancePrefectureCode(prefectureName: string): string {
  const normalized = prefectureName.trim();
  if (!normalized) {
    return '';
  }

  return SOCIAL_INSURANCE_PREFECTURE_CODES[normalized] ?? '';
}
