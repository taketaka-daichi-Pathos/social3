export interface CompanyAllowance {
  name: string;
  amount: number | null;
}

export const DEFAULT_COMPANY_ALLOWANCES: readonly CompanyAllowance[] = [
  { name: '家族手当', amount: null },
  { name: '家賃手当', amount: null },
  { name: '固定残業代', amount: null },
  { name: '交通費（定期代）', amount: null },
];

export interface CompanySettings {
  companyId: string;
  companyName: string;
  ownerName: string;
  postalCode: string;
  prefecture: string;
  cityAddress: string;
  phoneNumber: string;
  prefectureCode: string;
  districtCode: string;
  referenceMark: string;
  officeNumber: string;
  healthInsuranceRate: number | null;
  longTermCareInsuranceRate: number | null;
  allowances: CompanyAllowance[];
}

export type CompanySettingsFormField = Exclude<keyof CompanySettings, 'allowances'>;

export type CompanySettingsTab = 'basic' | 'rates' | 'allowances';
