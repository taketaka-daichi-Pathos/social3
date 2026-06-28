import { CompanySettings } from '@features/settings/models/company-settings.model';

const REQUIRED_EGOV_COMPANY_FIELDS: ReadonlyArray<{
  key: keyof Pick<
    CompanySettings,
    'prefectureCode' | 'districtCode' | 'referenceMark' | 'officeNumber' | 'companyName' | 'phoneNumber'
  >;
  label: string;
}> = [
  { key: 'prefectureCode', label: '都道府県コード' },
  { key: 'districtCode', label: '年金事務所コード' },
  { key: 'referenceMark', label: '事業所整理記号' },
  { key: 'officeNumber', label: '事業所番号' },
  { key: 'companyName', label: '会社名' },
  { key: 'phoneNumber', label: '電話番号' },
];

/** e-Gov CSV 出力に必要な会社マスタ項目が揃っているか検証する */
export function validateCompanyForEgovExport(company: CompanySettings | null): string | null {
  if (!company) {
    return '会社情報が取得できません。設定画面で会社情報を登録してください。';
  }

  const missingLabels = REQUIRED_EGOV_COMPANY_FIELDS.filter(({ key }) => !String(company[key] ?? '').trim()).map(
    ({ label }) => label
  );

  if (missingLabels.length > 0) {
    return `会社設定の以下の項目を入力してください: ${missingLabels.join('、')}`;
  }

  return null;
}
