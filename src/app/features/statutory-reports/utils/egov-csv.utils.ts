import { Employee } from '@features/employees/models/employee.model';
import { calculateEmployeeFixedWages } from '@features/payroll/utils/compensation.utils';
import { Company, GeppenData, SanteiData, SyouyoData } from '@features/statutory-reports/models/egov-export.model';
import {
  toJapaneseEraDateParts,
  toJapaneseEraYearMonthParts,
} from '@features/statutory-reports/utils/japanese-era.utils';

const CRLF = '\r\n';
const SHIKAKU_SHUTOKU_FORM_CODE = '2220700';
const SHIKAKU_SOSHITSU_FORM_CODE = '2221700';
const SANTEI_KISO_FORM_CODE = '2222700';
const GEPPEN_FORM_CODE = '2221703';
const SYOUYO_FORM_CODE = '2227700';
/** 資格喪失届：退職による喪失原因コード */
const SHIKAKU_SOSHITSU_LOSS_REASON_RETIREMENT = '1';
/** 媒体管理レコードの代表者署名コード（e-Gov 仕様固定値） */
export const EGOV_MEDIA_REPRESENTATIVE_SIGNATURE_CODE = '22223';

function normalizeMediaSeq(mediaSeq: string): string {
  return mediaSeq.replace(/\D/g, '').padStart(3, '0').slice(-3);
}

function normalizeCreationDate(creationDate: string): string {
  return creationDate.replace(/\D/g, '').slice(0, 8);
}

function padNumericCode(value: string, length: number): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return ''.padStart(length, '0');
  }

  return digits.padStart(length, '0').slice(-length);
}

/** 電話番号を局番1・局番2・局番3 の3フィールドに分割する */
export function splitPhoneNumberForEgov(phoneNumber: string): [string, string, string] {
  const hyphenParts = phoneNumber.split(/[-‐－]/).map((part) => part.replace(/\D/g, ''));
  if (hyphenParts.length >= 3 && hyphenParts.every((part) => part.length > 0)) {
    return [hyphenParts[0], hyphenParts[1], hyphenParts[2]];
  }

  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
  }

  if (digits.length === 10 && digits.startsWith('0')) {
    if (digits.startsWith('03') || digits.startsWith('06')) {
      return [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6)];
    }

    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  }

  return ['', '', ''];
}

function stripPostalCodeHyphen(postalCode: string): string {
  return postalCode.replace(/\D/g, '').slice(0, 7);
}

function normalizeMyNumber(value: string): string {
  return value.replace(/\D/g, '');
}

function splitBasicPensionNumber(value: string): { symbol: string; number: string } {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10) {
    return {
      symbol: digits.slice(0, 4),
      number: digits.slice(4, 10),
    };
  }

  return { symbol: '', number: '' };
}

function parseIsoDateLocal(value: string): Date {
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`日付を解析できません: ${value}`);
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** 退職日の翌日（資格喪失日）を算出する */
export function resolveQualificationLossDate(resignationDate: string | null): Date | null {
  if (!resignationDate?.trim()) {
    return null;
  }

  const nextDay = parseIsoDateLocal(resignationDate);
  nextDay.setDate(nextDay.getDate() + 1);
  return nextDay;
}

function mapEmployeeMyNumberFields(employee: Employee): {
  myNumber: string;
  pensionSymbol: string;
  pensionNumber: string;
} {
  const myNumber = normalizeMyNumber(employee.myNumber);
  const hasMyNumber = myNumber.length === 12;
  const basicPension = hasMyNumber
    ? { symbol: '', number: '' }
    : splitBasicPensionNumber(employee.insuredPersonNumber);

  return {
    myNumber: hasMyNumber ? myNumber : '',
    pensionSymbol: hasMyNumber ? '' : basicPension.symbol,
    pensionNumber: hasMyNumber ? '' : basicPension.number,
  };
}

function mapGenderCode(gender: Employee['gender']): string {
  if (gender === 'male') {
    return '1';
  }

  if (gender === 'female') {
    return '2';
  }

  return '';
}

function buildOfficeInfoRecord(company: Company): string {
  const [tel1, tel2, tel3] = splitPhoneNumberForEgov(company.phoneNumber);
  const postalCode = stripPostalCodeHyphen(company.postalCode);
  const address = `${company.prefecture}${company.cityAddress}`;
  const representative = `${company.employerLastName}\u3000${company.employerFirstName}`;

  return [
    padNumericCode(company.prefectureCode, 2),
    padNumericCode(company.districtCode, 2),
    company.referenceMark.trim(),
    company.officeNumber.trim(),
    '0000',
    postalCode,
    address,
    company.companyName.trim(),
    representative,
    tel1,
    tel2,
    tel3,
  ].join(',');
}

/**
 * 媒体管理レコード（CSV 1行目）を生成する。
 * 都道府県コード,市区町村コード,事業所記号,媒体連番,作成年月日,代表者署名コード
 */
export function buildMediaManagementRecord(
  company: Company,
  creationDate: string,
  mediaSeq: string
): string {
  return [
    padNumericCode(company.prefectureCode, 2),
    padNumericCode(company.districtCode, 2),
    company.referenceMark.trim(),
    normalizeMediaSeq(mediaSeq),
    normalizeCreationDate(creationDate),
    EGOV_MEDIA_REPRESENTATIVE_SIGNATURE_CODE,
  ].join(',');
}

/**
 * 事業所識別符号（CSV 3行目）を生成する。
 * 先頭カンマ + 媒体連番（例: ,001）
 */
export function buildOfficeIdentificationRecord(mediaSeq: string): string {
  return `,${normalizeMediaSeq(mediaSeq)}`;
}

/**
 * e-Gov CSV の 1〜5 行目（媒体管理レコード〜[data]）を生成する。
 */
export function generateEgovHeader(company: Company, creationDate: string, mediaSeq: string): string {
  return [
    buildMediaManagementRecord(company, creationDate, mediaSeq),
    '[kanri]',
    buildOfficeIdentificationRecord(mediaSeq),
    buildOfficeInfoRecord(company),
    '[data]',
  ].join(CRLF);
}

/**
 * 被保険者資格取得届（様式コード 2220700）のデータレコード 1 行を生成する。
 */
export function generateShikakuShutokuData(employee: Employee, company: Company): string {
  const birthEra = toJapaneseEraDateParts(employee.birthDate);
  const hireEra = toJapaneseEraDateParts(employee.hireDate);
  const myNumberFields = mapEmployeeMyNumberFields(employee);
  const fixedWages = calculateEmployeeFixedWages(employee);
  const currencyRemuneration = String(fixedWages);
  const kindRemuneration = '0';
  const totalRemuneration = String(fixedWages);

  const fields: string[] = [
    SHIKAKU_SHUTOKU_FORM_CODE, // idx 0 / 1項目: 様式コード
    padNumericCode(company.prefectureCode, 2), // idx 1 / 2項目: 都道府県コード
    padNumericCode(company.districtCode, 2), // idx 2 / 3項目: 年金事務所コード
    company.referenceMark.trim(), // idx 3 / 4項目: 事業所記号
    company.officeNumber.trim(), // idx 4 / 5項目: 整理記号
    '', // idx 5 / 6項目: 被保険者整理番号
    `${employee.lastNameKana.trim()} ${employee.firstNameKana.trim()}`, // idx 6 / 7項目: 氏名（カナ）
    `${employee.lastName.trim()}\u3000${employee.firstName.trim()}`, // idx 7 / 8項目: 氏名（漢字）
    birthEra.eraCode, // idx 8 / 9項目: 生年月日の元号
    birthEra.warekiYymmdd, // idx 9 / 10項目: 生年月日（和暦 YYMMDD）
    mapGenderCode(employee.gender), // idx 10 / 11項目: 種別
    '1', // idx 11 / 12項目: 取得区分（健保・厚年）
    myNumberFields.myNumber, // idx 12 / 13項目: 個人番号または基礎年金番号
    myNumberFields.pensionSymbol, // idx 13 / 14項目: 基礎年金番号・記号
    myNumberFields.pensionNumber, // idx 14 / 15項目: 基礎年金番号・番号
    '', // idx 15 / 16項目: 健保番号
    '', // idx 16 / 17項目: 郵便番号 // TODO: 従業員住所マスタ未実装
    hireEra.eraCode, // idx 17 / 18項目: 資格取得年月日の元号
    hireEra.warekiYymmdd, // idx 18 / 19項目: 資格取得年月日（和暦 YYMMDD）
    employee.hasDependents ? '1' : '0', // idx 19 / 20項目: 被扶養者の有無
    currencyRemuneration, // idx 20 / 21項目: 報酬月額（通貨）
    kindRemuneration, // idx 21 / 22項目: 報酬月額（現物）
    totalRemuneration, // idx 22 / 23項目: 報酬月額（合計）
    '', // idx 23 / 24項目 // TODO: 資格取得区分詳細フラグ
    '', // idx 24 / 25項目 // TODO: 短時間労働者フラグ
    '', // idx 25 / 26項目 // TODO: 二以上事業所勤務フラグ
    '', // idx 26 / 27項目 // TODO: 備考
    '', // idx 27 / 28項目 // TODO: 住所（都道府県）
    '', // idx 28 / 29項目 // TODO: 住所（市区町村）
    '', // idx 29 / 30項目 // TODO: 住所（番地）
    '', // idx 30 / 31項目 // TODO: 住所（方書）
    '', // idx 31 / 32項目 // TODO: 届出意思確認フラグ
    '', // idx 32 / 33項目 // TODO: その他項目1
    '', // idx 33 / 34項目 // TODO: その他項目2
  ];

  if (fields.length !== 34) {
    throw new Error(`資格取得届データレコードは34項目必要です（現在: ${fields.length}）`);
  }

  return fields.join(',');
}

/**
 * 被保険者資格喪失届（様式コード 2221700）のデータレコード 1 行を生成する。
 */
export function generateShikakuSoshitsuData(employee: Employee, company: Company): string {
  const birthEra = toJapaneseEraDateParts(employee.birthDate);
  const myNumberFields = mapEmployeeMyNumberFields(employee);
  const lossDate = resolveQualificationLossDate(employee.resignationDate);
  const lossEra = lossDate ? toJapaneseEraDateParts(lossDate) : { eraCode: '', warekiYymmdd: '' };
  const resignationEra = employee.resignationDate
    ? toJapaneseEraDateParts(employee.resignationDate)
    : { eraCode: '', warekiYymmdd: '' };

  const fields: string[] = [
    SHIKAKU_SOSHITSU_FORM_CODE, // idx 0 / 1項目: 様式コード
    padNumericCode(company.prefectureCode, 2), // idx 1 / 2項目: 都道府県コード
    padNumericCode(company.districtCode, 2), // idx 2 / 3項目: 年金事務所コード
    company.referenceMark.trim(), // idx 3 / 4項目: 事業所記号
    company.officeNumber.trim(), // idx 4 / 5項目: 整理記号
    '', // idx 5 / 6項目: 被保険者整理番号
    `${employee.lastNameKana.trim()} ${employee.firstNameKana.trim()}`, // idx 6 / 7項目: 氏名（カナ）
    `${employee.lastName.trim()}\u3000${employee.firstName.trim()}`, // idx 7 / 8項目: 氏名（漢字）
    birthEra.eraCode, // idx 8 / 9項目: 生年月日の元号
    birthEra.warekiYymmdd, // idx 9 / 10項目: 生年月日（和暦 YYMMDD）
    myNumberFields.myNumber, // idx 10 / 11項目: 個人番号または基礎年金番号
    myNumberFields.pensionSymbol, // idx 11 / 12項目: 基礎年金番号・記号
    myNumberFields.pensionNumber, // idx 12 / 13項目: 基礎年金番号・番号
    lossEra.eraCode, // idx 13 / 14項目: 資格喪失年月日の元号
    lossEra.warekiYymmdd, // idx 14 / 15項目: 資格喪失年月日（和暦 YYMMDD）
    employee.resignationDate ? SHIKAKU_SOSHITSU_LOSS_REASON_RETIREMENT : '', // idx 15 / 16項目: 喪失原因
    resignationEra.eraCode, // idx 16 / 17項目: 退職年月日の元号
    resignationEra.warekiYymmdd, // idx 17 / 18項目: 退職年月日（和暦 YYMMDD）
    '', // idx 18 / 19項目 // TODO: 備考
    '', // idx 19 / 20項目 // TODO: 70歳以上被用者該当フラグ
    '', // idx 20 / 21項目 // TODO: 70歳以上被用者不該当フラグ
    '', // idx 21 / 22項目 // TODO: その他フラグ1
    '', // idx 22 / 23項目 // TODO: その他フラグ2
    '', // idx 23 / 24項目 // TODO: その他フラグ3
    '', // idx 24 / 25項目 // TODO: その他項目1
    '', // idx 25 / 26項目 // TODO: その他項目2
    '', // idx 26 / 27項目 // TODO: その他項目3
  ];

  if (fields.length !== 27) {
    throw new Error(`資格喪失届データレコードは27項目必要です（現在: ${fields.length}）`);
  }

  return fields.join(',');
}

function formatEgovAmount(value: number): string {
  return String(Math.max(0, Math.round(value)));
}

function resolveYearMonthFirstDay(yearMonth: string): string {
  const trimmed = yearMonth.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (match) {
    return `${match[1]}-${match[2]}-01`;
  }

  return trimmed;
}

function resolveSanteiApplicationMonth(santeiData: SanteiData): string {
  return santeiData.applicationMonth?.trim() || `${santeiData.targetYear}-09`;
}

function resolveSanteiPreviousRevisionMonth(
  employee: Employee,
  santeiData: SanteiData
): string | null {
  const explicit = santeiData.previousRevisionMonth?.trim();
  if (explicit) {
    return explicit;
  }

  const applicableStartMonth = employee.applicableStartMonth?.trim();
  return applicableStartMonth || null;
}

function computeThreeMonthTotals(
  months: ReadonlyArray<{ currencyAmount: number; kindAmount: number }>
): {
  monthlyTotals: number[];
  grandTotal: number;
  averageAmount: number;
} {
  const monthlyTotals = months.map((month) => month.currencyAmount + month.kindAmount);
  const grandTotal = monthlyTotals.reduce((sum, amount) => sum + amount, 0);
  const averageAmount = Math.round(grandTotal / months.length);

  return { monthlyTotals, grandTotal, averageAmount };
}

function computeSanteiMonthlyTotals(santeiData: SanteiData): {
  monthlyTotals: number[];
  grandTotal: number;
  averageAmount: number;
} {
  return computeThreeMonthTotals(santeiData.months);
}

function resolvePreviousRevisionEra(previousRevisionMonth: string | null): {
  eraCode: string;
  warekiYear: string;
  month: string;
} {
  if (!previousRevisionMonth) {
    return { eraCode: '', warekiYear: '', month: '' };
  }

  return toJapaneseEraYearMonthParts(resolveYearMonthFirstDay(previousRevisionMonth));
}

/**
 * 被保険者標準報酬月額算定基礎届（様式コード 2222700）のデータレコード 1 行を生成する。
 */
export function generateSanteiKisoData(
  employee: Employee,
  company: Company,
  santeiData: SanteiData
): string {
  const birthEra = toJapaneseEraDateParts(employee.birthDate);
  const applicationEra = toJapaneseEraYearMonthParts(
    resolveYearMonthFirstDay(resolveSanteiApplicationMonth(santeiData))
  );
  const previousRevisionMonth = resolveSanteiPreviousRevisionMonth(employee, santeiData);
  const previousRevisionEra = resolvePreviousRevisionEra(previousRevisionMonth);
  const myNumberFields = mapEmployeeMyNumberFields(employee);
  const { monthlyTotals, grandTotal, averageAmount } = computeSanteiMonthlyTotals(santeiData);

  const previousHealthStandard =
    santeiData.previousHealthStandardRemuneration ?? employee.healthStandardRemuneration ?? 0;
  const previousPensionStandard =
    santeiData.previousPensionStandardRemuneration ?? employee.pensionStandardRemuneration ?? 0;

  const fields: string[] = [
    SANTEI_KISO_FORM_CODE, // idx 0: 様式コード
    padNumericCode(company.prefectureCode, 2), // idx 1: 都道府県コード
    padNumericCode(company.districtCode, 2), // idx 2: 年金事務所コード（郡市区符号）
    company.referenceMark.trim(), // idx 3: 事業所記号
    employee.insuredPersonNumber.trim(), // idx 4: 被保険者整理番号
    `${employee.lastNameKana.trim()} ${employee.firstNameKana.trim()}`, // idx 5: 氏名（カナ）
    `${employee.lastName.trim()}\u3000${employee.firstName.trim()}`, // idx 6: 氏名（漢字）
    birthEra.eraCode, // idx 7: 生年月日の元号
    birthEra.warekiYymmdd, // idx 8: 生年月日（和暦 YYMMDD）
    applicationEra.eraCode, // idx 9: 適用年月の元号
    applicationEra.warekiYear, // idx 10: 適用年月の年
    applicationEra.month, // idx 11: 適用年月の月
    formatEgovAmount(previousHealthStandard), // idx 12: 従前の標準報酬月額（健保）
    formatEgovAmount(previousPensionStandard), // idx 13: 従前の標準報酬月額（厚年）
    previousRevisionEra.eraCode, // idx 14: 従前の改定月の元号
    previousRevisionEra.warekiYear, // idx 15: 従前の改定月の年
    previousRevisionEra.month, // idx 16: 従前の改定月の月
    santeiData.salaryChangeMonth?.trim() ?? '', // idx 17: 昇(降)給月
    santeiData.salaryChangeCategory?.trim() ?? '', // idx 18: 昇(降)給区分
    santeiData.retroactivePaymentMonth?.trim() ?? '', // idx 19: 遡及支払月
    santeiData.retroactivePaymentAmount != null
      ? formatEgovAmount(santeiData.retroactivePaymentAmount)
      : '', // idx 20: 遡及支払額
    santeiData.months[0].paymentMonth, // idx 21: 給与支給月（4月）
    santeiData.months[1].paymentMonth, // idx 22: 給与支給月（5月）
    santeiData.months[2].paymentMonth, // idx 23: 給与支給月（6月）
    formatEgovAmount(santeiData.months[0].baseDays), // idx 24: 基礎日数（4月）
    formatEgovAmount(santeiData.months[1].baseDays), // idx 25: 基礎日数（5月）
    formatEgovAmount(santeiData.months[2].baseDays), // idx 26: 基礎日数（6月）
    formatEgovAmount(santeiData.months[0].currencyAmount), // idx 27: 通貨（4月）
    formatEgovAmount(santeiData.months[1].currencyAmount), // idx 28: 通貨（5月）
    formatEgovAmount(santeiData.months[2].currencyAmount), // idx 29: 通貨（6月）
    formatEgovAmount(santeiData.months[0].kindAmount), // idx 30: 現物（4月）
    formatEgovAmount(santeiData.months[1].kindAmount), // idx 31: 現物（5月）
    formatEgovAmount(santeiData.months[2].kindAmount), // idx 32: 現物（6月）
    formatEgovAmount(monthlyTotals[0]), // idx 33: 合計（4月）
    formatEgovAmount(monthlyTotals[1]), // idx 34: 合計（5月）
    formatEgovAmount(monthlyTotals[2]), // idx 35: 合計（6月）
    formatEgovAmount(grandTotal), // idx 36: 総計
    formatEgovAmount(averageAmount), // idx 37: 平均額
    santeiData.correctedAverageAmount != null
      ? formatEgovAmount(santeiData.correctedAverageAmount)
      : '', // idx 38: 修正平均額
    myNumberFields.myNumber, // idx 39: 個人番号または基礎年金番号
    myNumberFields.pensionSymbol, // idx 40: 基礎年金番号・記号
    myNumberFields.pensionNumber, // idx 41: 基礎年金番号・番号
    '', // idx 42: 備考欄項目1
    '', // idx 43: 備考欄項目2
    '', // idx 44: 備考欄項目3
    '', // idx 45: 備考欄項目4
    '', // idx 46: 備考欄項目5
    '', // idx 47: 備考欄項目6
    '', // idx 48: 備考欄項目7
    '', // idx 49: 備考欄項目8
    '', // idx 50: 70歳算定基礎月
    '', // idx 51: 各種フラグ1
    '', // idx 52: 各種フラグ2
  ];

  if (fields.length !== 53) {
    throw new Error(`算定基礎届データレコードは53項目必要です（現在: ${fields.length}）`);
  }

  return fields.join(',');
}

/**
 * 被保険者報酬月額変更届（様式コード 2221703）のデータレコード 1 行を生成する。
 */
export function generateGeppenData(
  employee: Employee,
  company: Company,
  geppenData: GeppenData
): string {
  const birthEra = toJapaneseEraDateParts(employee.birthDate);
  const revisionEra = toJapaneseEraYearMonthParts(geppenData.revisionDate);
  const previousRevisionMonth = geppenData.previousRevisionMonth?.trim() || null;
  const previousRevisionEra = resolvePreviousRevisionEra(previousRevisionMonth);
  const myNumberFields = mapEmployeeMyNumberFields(employee);
  const { monthlyTotals, grandTotal, averageAmount } = computeThreeMonthTotals(geppenData.months);

  const previousHealthStandard =
    geppenData.previousHealthStandardRemuneration ?? employee.healthStandardRemuneration ?? 0;
  const previousPensionStandard =
    geppenData.previousPensionStandardRemuneration ?? employee.pensionStandardRemuneration ?? 0;

  const fields: string[] = [
    GEPPEN_FORM_CODE, // idx 0: 様式コード
    padNumericCode(company.prefectureCode, 2), // idx 1: 都道府県コード
    padNumericCode(company.districtCode, 2), // idx 2: 年金事務所コード（郡市区符号）
    company.referenceMark.trim(), // idx 3: 事業所記号
    employee.insuredPersonNumber.trim(), // idx 4: 被保険者整理番号
    `${employee.lastNameKana.trim()} ${employee.firstNameKana.trim()}`, // idx 5: 氏名（カナ）
    `${employee.lastName.trim()}\u3000${employee.firstName.trim()}`, // idx 6: 氏名（漢字）
    birthEra.eraCode, // idx 7: 生年月日の元号
    birthEra.warekiYymmdd, // idx 8: 生年月日（和暦 YYMMDD）
    revisionEra.eraCode, // idx 9: 改定年月の元号
    revisionEra.warekiYear, // idx 10: 改定年月の年
    revisionEra.month, // idx 11: 改定年月の月
    formatEgovAmount(previousHealthStandard), // idx 12: 従前の標準報酬月額（健保）
    formatEgovAmount(previousPensionStandard), // idx 13: 従前の標準報酬月額（厚年）
    previousRevisionEra.eraCode, // idx 14: 従前の改定月の元号
    previousRevisionEra.warekiYear, // idx 15: 従前の改定月の年
    previousRevisionEra.month, // idx 16: 従前の改定月の月
    geppenData.salaryChangeMonth?.trim() ?? '', // idx 17: 昇(降)給月
    geppenData.salaryChangeCategory?.trim() ?? '', // idx 18: 昇(降)給区分
    geppenData.retroactivePaymentMonth?.trim() ?? '', // idx 19: 遡及支払月
    geppenData.retroactivePaymentAmount != null
      ? formatEgovAmount(geppenData.retroactivePaymentAmount)
      : '', // idx 20: 遡及支払額
    geppenData.months[0].paymentMonth, // idx 21: 給与支給月（前三ヶ月）
    geppenData.months[1].paymentMonth, // idx 22: 給与支給月（前二ヶ月）
    geppenData.months[2].paymentMonth, // idx 23: 給与支給月（前一ヶ月）
    formatEgovAmount(geppenData.months[0].baseDays), // idx 24: 基礎日数（前三ヶ月）
    formatEgovAmount(geppenData.months[1].baseDays), // idx 25: 基礎日数（前二ヶ月）
    formatEgovAmount(geppenData.months[2].baseDays), // idx 26: 基礎日数（前一ヶ月）
    formatEgovAmount(geppenData.months[0].currencyAmount), // idx 27: 通貨（前三ヶ月）
    formatEgovAmount(geppenData.months[1].currencyAmount), // idx 28: 通貨（前二ヶ月）
    formatEgovAmount(geppenData.months[2].currencyAmount), // idx 29: 通貨（前一ヶ月）
    formatEgovAmount(geppenData.months[0].kindAmount), // idx 30: 現物（前三ヶ月）
    formatEgovAmount(geppenData.months[1].kindAmount), // idx 31: 現物（前二ヶ月）
    formatEgovAmount(geppenData.months[2].kindAmount), // idx 32: 現物（前一ヶ月）
    formatEgovAmount(monthlyTotals[0]), // idx 33: 合計（前三ヶ月）
    formatEgovAmount(monthlyTotals[1]), // idx 34: 合計（前二ヶ月）
    formatEgovAmount(monthlyTotals[2]), // idx 35: 合計（前一ヶ月）
    formatEgovAmount(grandTotal), // idx 36: 総計
    formatEgovAmount(averageAmount), // idx 37: 平均額
    geppenData.correctedAverageAmount != null
      ? formatEgovAmount(geppenData.correctedAverageAmount)
      : '', // idx 38: 修正平均額
    myNumberFields.myNumber, // idx 39: 個人番号または基礎年金番号
    myNumberFields.pensionSymbol, // idx 40: 基礎年金番号・課所符号
    myNumberFields.pensionNumber, // idx 41: 基礎年金番号・一連番号
    '', // idx 42: 備考欄項目1
    '', // idx 43: 備考欄項目2
    '', // idx 44: 備考欄項目3
    '', // idx 45: 備考欄項目4
    '', // idx 46: 備考欄項目5
    '', // idx 47: 備考欄
    geppenData.over70EmployeeOnlyFlag?.trim() ?? '', // idx 48: 70歳以上被用者届のみ提出フラグ
  ];

  if (fields.length !== 49) {
    throw new Error(`月額変更届データレコードは49項目必要です（現在: ${fields.length}）`);
  }

  return fields.join(',');
}

/**
 * 被保険者賞与支払届（様式コード 2227700）のデータレコード 1 行を生成する。
 */
export function generateSyouyoData(
  employee: Employee,
  company: Company,
  syouyoData: SyouyoData
): string {
  const birthEra = toJapaneseEraDateParts(employee.birthDate);
  const paymentEra = toJapaneseEraDateParts(syouyoData.paymentDate);
  const myNumberFields = mapEmployeeMyNumberFields(employee);

  const fields: string[] = [
    SYOUYO_FORM_CODE, // idx 0: 様式コード
    padNumericCode(company.prefectureCode, 2), // idx 1: 都道府県コード
    padNumericCode(company.districtCode, 2), // idx 2: 年金事務所コード（郡市区符号）
    company.referenceMark.trim(), // idx 3: 事業所記号
    employee.insuredPersonNumber.trim(), // idx 4: 被保険者整理番号
    `${employee.lastNameKana.trim()} ${employee.firstNameKana.trim()}`, // idx 5: 氏名（カナ）
    `${employee.lastName.trim()}\u3000${employee.firstName.trim()}`, // idx 6: 氏名（漢字）
    birthEra.eraCode, // idx 7: 生年月日の元号
    birthEra.warekiYymmdd, // idx 8: 生年月日（和暦 YYMMDD）
    paymentEra.eraCode, // idx 9: 賞与支払年月日の元号
    paymentEra.warekiYymmdd, // idx 10: 賞与支払年月日（和暦 YYMMDD）
    formatEgovAmount(syouyoData.currencyAmount), // idx 11: 通貨によるものの額
    formatEgovAmount(syouyoData.kindAmount), // idx 12: 現物によるものの額
    formatEgovAmount(syouyoData.totalAmount), // idx 13: 合計
    myNumberFields.myNumber, // idx 14: 個人番号または基礎年金番号
    myNumberFields.pensionSymbol, // idx 15: 基礎年金番号・課所符号
    myNumberFields.pensionNumber, // idx 16: 基礎年金番号・一連番号
    '', // idx 17: 備考欄項目1
    '', // idx 18: 備考欄項目2
    '', // idx 19: 備考欄項目3
    syouyoData.over70EmployeeOnlyFlag?.trim() ?? '', // idx 20: 70歳以上被用者届のみ提出フラグ
  ];

  if (fields.length !== 21) {
    throw new Error(`賞与支払届データレコードは21項目必要です（現在: ${fields.length}）`);
  }

  return fields.join(',');
}

export function joinEgovCsvLines(...lines: string[]): string {
  return lines.join(CRLF);
}

export function formatEgovCreationDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
