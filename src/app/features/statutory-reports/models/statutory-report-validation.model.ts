import { EmployeeTaskRequestedField, EmployeeTaskType } from '@features/employee-portal/models/employee-task.model';
import { Employee } from '@features/employees/models/employee.model';
import { StatutoryReportMenuItem } from '@features/statutory-reports/models/statutory-report-menu.model';

export type StatutoryReportId = StatutoryReportMenuItem['id'];

/** 帳票出力に必要な従業員マスタ項目 */
export type StatutoryRequiredFieldKey =
  | 'myNumber'
  | 'hireDate'
  | 'birthDate'
  | 'resignationDate'
  | 'insuranceCardReturned'
  | 'maternityExpectedDeliveryDate'
  | 'maternityDeliveryType'
  | 'childcareChildrenInfo';

export interface StatutoryReportDefinition {
  /** CSV 出力が実装済みか */
  exportImplemented: boolean;
  /** 出力に必要な項目 */
  requiredFields: StatutoryRequiredFieldKey[];
  /** 不足時に発行するタスク種別 */
  taskType: EmployeeTaskType | null;
  /** 帳票必須項目 → タスク依頼項目の対応 */
  taskFieldMapping: Partial<Record<StatutoryRequiredFieldKey, EmployeeTaskRequestedField>>;
  /** 対象者候補の絞り込み */
  filterCandidates: (employee: Employee) => boolean;
}

export const STATUTORY_REQUIRED_FIELD_LABELS: Record<StatutoryRequiredFieldKey, string> = {
  myNumber: 'マイナンバー',
  hireDate: '入社日',
  birthDate: '生年月日',
  resignationDate: '退職日',
  insuranceCardReturned: '健康保険被保険者証の返却',
  maternityExpectedDeliveryDate: '出産予定日',
  maternityDeliveryType: '出産種別',
  childcareChildrenInfo: '養育する子の情報',
};

export interface EmployeeReportReadiness {
  employeeId: string;
  ready: boolean;
  missingFields: StatutoryRequiredFieldKey[];
  missingLabels: string[];
}
