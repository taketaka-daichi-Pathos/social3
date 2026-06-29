export type DependentOccupation =
  | 'unemployed'
  | 'part_time'
  | 'student'
  | 'employee'
  | 'self_employed'
  | 'other';

export type DependentCurrentSituation =
  | 'student_over_16'
  | 'recently_unemployed'
  | 'ongoing_unemployed_or_part_time'
  | 'pension_recipient'
  | 'other';

export type DependentLivingArrangement = 'cohabiting' | 'separate';

export type DependentRelationship =
  | 'spouse'
  | 'child'
  | 'parent'
  | 'grandparent'
  | 'sibling'
  | 'other';

export interface Dependent {
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  /** 外国籍用（任意） */
  romanName: string;
  birthDate: string;
  relationship: DependentRelationship;
  livingArrangement: DependentLivingArrangement;
  /** 扶養開始日（事由発生日） YYYY-MM-DD */
  dependencyStartDate: string;
  hasDisability: boolean;
  occupation: DependentOccupation;
  currentSituation: DependentCurrentSituation;
  /** 性別（扶養異動届など e-Gov 出力用） */
  gender?: 'male' | 'female' | '';
  /** 個人番号（扶養異動届用） */
  myNumber?: string;
  /** 基礎年金番号（記号+番号を連結した文字列、または番号のみ） */
  basicPensionNumber?: string;
  /** 異動日 YYYY-MM-DD（未指定時は dependencyStartDate） */
  changeDate?: string;
  /** 異動理由コード */
  changeReason?: string;
  /** 年間収入（扶養異動届用） */
  annualIncome?: number | null;
  /** 郵便番号 */
  postalCode?: string;
  /** 住所 */
  address?: string;
  /** 従業員がアップロードした証明書類の URL */
  documentUrls?: string[];
}

export type DependentFormField = keyof Dependent;

export const DEPENDENT_OCCUPATION_OPTIONS: ReadonlyArray<{
  value: DependentOccupation;
  label: string;
}> = [
  { value: 'unemployed', label: '無職' },
  { value: 'part_time', label: 'パート・アルバイト' },
  { value: 'student', label: '学生' },
  { value: 'employee', label: '会社員' },
  { value: 'self_employed', label: '自営業' },
  { value: 'other', label: 'その他' },
];

export const DEPENDENT_SITUATION_OPTIONS: ReadonlyArray<{
  value: DependentCurrentSituation;
  label: string;
}> = [
  { value: 'student_over_16', label: '16歳以上の学生' },
  { value: 'recently_unemployed', label: '直近で退職/失業保険終了' },
  { value: 'ongoing_unemployed_or_part_time', label: '継続して無職/パート' },
  { value: 'pension_recipient', label: '年金受給者' },
  { value: 'other', label: 'その他' },
];

export const DEPENDENT_RELATIONSHIP_OPTIONS: ReadonlyArray<{
  value: DependentRelationship;
  label: string;
}> = [
  { value: 'spouse', label: '配偶者' },
  { value: 'child', label: '子' },
  { value: 'parent', label: '父母' },
  { value: 'grandparent', label: '祖父母' },
  { value: 'sibling', label: '兄弟姉妹' },
  { value: 'other', label: 'その他' },
];
