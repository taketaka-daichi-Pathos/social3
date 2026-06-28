import { LeaveRecord } from '@features/employees/models/leave-record.model';
import { Dependent } from '@features/dependents/models/dependent.model';
import {
  EmployeeGradeHistoryEntry,
  EmployeeSalaryHistoryEntry,
} from '@features/employees/models/employee-salary-history.model';
import { EmployeeRegistrationFormData } from '@features/onboarding/models/employee-registration.model';
import { BonusHistoryEntry } from '@features/payroll/models/bonus-history.model';
import { RevisionHistoryEntry } from '@features/revision/models/revision-history.model';

export type EmployeeStatus = 'active' | 'retired';
export interface EmployeeAllowance {
  name: string;
  amount: number | null;
}

export interface Employee extends Omit<EmployeeRegistrationFormData, 'healthGrade' | 'pensionGrade'> {
  id: string;
  companyOwnerUid: string;
  authUid: string | null;
  loginEmail: string | null;
  /** 連絡用メール（管理者アカウント紐付け判定に使用） */
  email: string | null;
  resignationDate: string | null;
  status: EmployeeStatus;
  retirementReason: string | null;
  postRetirementAddress: string | null;
  postRetirementEmail: string | null;
  insuranceCardReturnCommitment: boolean | null;
  createdAt: string;
  allowances: EmployeeAllowance[];
  /** 従業員マスタの健康保険等級（算定・随時改定の変更前等級参照用） */
  healthGrade: number | null;
  /** 従業員マスタの厚生年金等級 */
  pensionGrade: number | null;
  /** 算定基礎適用予定の健康保険等級（9月度給与保存時にマスターへ反映） */
  scheduledHealthGrade: number | null;
  /** 算定基礎適用予定の厚生年金等級 */
  scheduledPensionGrade: number | null;
  /** 算定基礎適用予定の健康保険標準報酬月額 */
  scheduledHealthStandardRemuneration: number | null;
  /** 算定基礎適用予定の厚生年金標準報酬月額 */
  scheduledPensionStandardRemuneration: number | null;
  /** 算定基礎の適用予定月（YYYY-MM。例: 2025-09） */
  scheduledAnnualDeterminationMonth: string | null;
  revisionHistory: RevisionHistoryEntry[];
  bonusHistory: BonusHistoryEntry[];
  leaveRecords: LeaveRecord[];
  dependents: Dependent[];
  /** 従業員タスクで提出された扶養家族情報（管理者確認待ち） */
  pendingDependentSubmission?: Dependent | null;
  /** 管理者確認：健康保険被保険者証の回収済み（isInsuranceCardReturned） */
  insuranceCardReturned: boolean | null;
  /** 郵便番号（法定帳票出力用） */
  postalCode?: string;
  /** 住所（法定帳票出力用） */
  address?: string;
  /** 登録時に確定した月次給与実績（証憑） */
  salaryHistory?: EmployeeSalaryHistoryEntry[];
  /** 登録時に確定した等級履歴 */
  gradeHistory?: EmployeeGradeHistoryEntry[];
  /** 登録フローでロックした給与履歴の最終月（YYYY-MM） */
  registrationPayrollLockedThrough?: string;
}
export type EmployeeListTab = 'pre' | 'active' | 'retired';
