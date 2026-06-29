import {
  EmployeeTaskRequestedField,
  EmployeeTaskType,
} from '@features/employee-portal/models/employee-task.model';

export interface EmployeeTaskTypeDefinition {
  taskType: EmployeeTaskType;
  title: string;
  description: string;
}

export const EMPLOYEE_TASK_TYPE_DEFINITIONS: Record<EmployeeTaskType, EmployeeTaskTypeDefinition> = {
  SHIKAKU_SHUTOKU_INFO: {
    taskType: 'SHIKAKU_SHUTOKU_INFO',
    title: '資格取得届に必要な情報の入力',
    description: '被保険者資格取得届の提出に必要な情報を入力してください。',
  },
  RETIREMENT_INFO: {
    taskType: 'RETIREMENT_INFO',
    title: '退職に伴う手続きのお願い',
    description:
      '退職後の連絡先を入力し、健康保険被保険者証の返却についてご確認ください。',
  },
  MATERNITY_LEAVE_INFO_REQUEST: {
    taskType: 'MATERNITY_LEAVE_INFO_REQUEST',
    title: '産前産後休業の詳細情報の入力',
    description: '産前産後休業取得者申出書の提出に必要な出産予定日と出産種別を入力してください。',
  },
  CHILDCARE_LEAVE_INFO_REQUEST: {
    taskType: 'CHILDCARE_LEAVE_INFO_REQUEST',
    title: '育児休業の詳細情報の入力',
    description: '育児休業等取得者申出書の提出に必要な、養育する子の氏名と生年月日を入力してください。',
  },
  DEPENDENT_INFO_REQUEST: {
    taskType: 'DEPENDENT_INFO_REQUEST',
    title: '扶養家族情報・証明書類の提出',
    description:
      '扶養家族の基本情報を入力し、必要な証明書類の画像をアップロードしてください。担当者が内容を確認して登録します。',
  },
};

export const EMPLOYEE_TASK_FIELD_LABELS: Record<EmployeeTaskRequestedField, string> = {
  myNumber: 'マイナンバー',
  hireDate: '入社日',
  birthDate: '生年月日',
  retirementDate: '退職日',
  insuranceCardReturned: '健康保険被保険者証の返却',
  postRetirementAddress: '退職後の住所',
  postRetirementEmail: '退職後のメールアドレス',
  insuranceCardReturnCommitment: '健康保険被保険者証の返却確認',
  expectedDeliveryDate: '出産予定日',
  deliveryType: '出産種別',
  childcareChild1NameKana: '養育する子（1人目）氏名カナ',
  childcareChild1NameKanji: '養育する子（1人目）氏名漢字',
  childcareChild1BirthDate: '養育する子（1人目）生年月日',
  dependentLastName: '扶養家族の姓',
  dependentFirstName: '扶養家族の名',
  dependentLastNameKana: '扶養家族の姓（カナ）',
  dependentFirstNameKana: '扶養家族の名（カナ）',
  dependentBirthDate: '扶養家族の生年月日',
  dependentRelationship: '続柄',
  dependentLivingArrangement: '同居・別居',
  dependentDependencyStartDate: '扶養開始日（事由発生日）',
  dependentHasDisability: '障害の有無',
  dependentOccupation: '職業',
  dependentCurrentSituation: '現在の状況',
  dependentDocumentUpload: '証明書類のアップロード',
};

export function getEmployeeTaskTitle(taskType: EmployeeTaskType): string {
  return EMPLOYEE_TASK_TYPE_DEFINITIONS[taskType].title;
}

export function getEmployeeTaskDescription(taskType: EmployeeTaskType): string {
  return EMPLOYEE_TASK_TYPE_DEFINITIONS[taskType].description;
}
