import { InsuranceRateHistoryEntry } from './insurance-rate-history.model';

export interface CompanyAllowance {  name: string;
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
  /** 管理者アカウントに紐づく従業員レコードID（任意） */
  linkedEmployeeId?: string | null;
  companyName: string;
  employerLastName: string;
  employerFirstName: string;
  employerLastNameKana: string;
  employerFirstNameKana: string;
  postalCode: string;
  prefecture: string;
  cityAddress: string;
  phoneNumber: string;
  prefectureCode: string;
  districtCode: string;
  referenceMark: string;
  officeNumber: string;
  /** システム利用開始年月（YYYY-MM）。登録時に確定し以降変更不可 */
  systemStartDate: string;
  healthInsuranceRate: number | null;
  longTermCareInsuranceRate: number | null;
  allowances: CompanyAllowance[];
  insuranceRateHistory?: InsuranceRateHistoryEntry[];
}
export type CompanySettingsFormField = Exclude<
  keyof CompanySettings,
  'allowances' | 'insuranceRateHistory'
>;

export type CompanySettingsTab = 'basic' | 'rates' | 'allowances';
