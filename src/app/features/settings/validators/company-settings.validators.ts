/** 郵便番号: 123-4567 */
export const POSTAL_CODE_PATTERN = /^\d{3}-\d{4}$/;

/** 電話番号: 03-1234-5678 等 */
export const PHONE_NUMBER_PATTERN = /^\d{1,4}-\d{1,4}-\d{4}$/;

/** 都道府県コード: 2桁 */
export const PREFECTURE_CODE_PATTERN = /^\d{2}$/;

/** 郡市区符号: 2桁 */
export const DISTRICT_CODE_PATTERN = /^\d{2}$/;

/** 事業所番号: 1〜5桁 */
export const OFFICE_NUMBER_PATTERN = /^\d{1,5}$/;

/** 会社ID: 5桁 */
export const COMPANY_ID_PATTERN = /^\d{5}$/;

export const POSTAL_CODE_DIGIT_COUNT = 7;

/** 5桁のランダムな会社IDを生成 */
export function generateRandomCompanyId(): string {
  return String(Math.floor(Math.random() * 100_000)).padStart(5, '0');
}
