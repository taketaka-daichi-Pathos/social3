import { EmployeeAllowance } from '@features/employees/models/employee.model';

export type EmployeeRegistrationType = 'new' | 'existing';

export type EmployeeGender = 'male' | 'female';

/** 社会保険上の労働区分（算定基礎等の支払基礎日数基準判定用） */
export type SocialInsuranceType = 'general' | 'short_time_worker' | 'part_time_special';

export const SOCIAL_INSURANCE_TYPE_OPTIONS: ReadonlyArray<{
  value: SocialInsuranceType;
  label: string;
}> = [
  { value: 'general', label: '一般の被保険者（通常のフルタイム等）' },
  { value: 'short_time_worker', label: '短時間就労者（一般パート・3/4以上等）' },
  { value: 'part_time_special', label: '短時間労働者（特定適用拡大パート・11日基準等）' },
];

/** 過去給与履歴の1行分（既存社員登録用） */
export interface PayrollHistoryRow {
  targetMonth: string;
  fixedWages: number;
  nonFixedWages: number;
  baseDays: number;
  healthGrade: number;
  pensionGrade: number;
}

export interface EmployeeRegistrationFormData {
  employeeNumber: string;
  registrationType: EmployeeRegistrationType;
  socialInsuranceType: SocialInsuranceType;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: string;
  gender: EmployeeGender;
  hireDate: string;
  myNumber: string;
  hasDependents: boolean;
  insuredPersonNumber: string;
  baseSalary: number;
  /** 新入社員登録時の手当詳細 */
  allowances?: EmployeeAllowance[];
  healthStandardRemuneration: number;
  pensionStandardRemuneration: number;
  /** 健康保険等級（新入社員はフォーム全体、既存社員は最新月の等級をマスターへ） */
  healthGrade: number;
  /** 厚生年金等級 */
  pensionGrade: number;
  /** 給与・保険料の適用開始年月（YYYY-MM）。既存社員はシステム利用開始月 */
  applicableStartMonth: string;
  /** 既存社員：入社月に応じた直近6ヶ月以内の月次履歴 */
  payrollHistoryRows?: PayrollHistoryRow[];
}

export type EmployeeRegistrationField = keyof Omit<
  EmployeeRegistrationFormData,
  'payrollHistoryRows' | 'allowances'
>;

export function isSocialInsuranceType(value: unknown): value is SocialInsuranceType {
  return value === 'general' || value === 'short_time_worker' || value === 'part_time_special';
}
