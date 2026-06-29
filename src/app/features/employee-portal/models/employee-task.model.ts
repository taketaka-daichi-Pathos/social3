/** 従業員タスクの種類（帳票・手続き単位） */
export type EmployeeTaskType =
  | 'SHIKAKU_SHUTOKU_INFO'
  | 'RETIREMENT_INFO'
  | 'MATERNITY_LEAVE_INFO_REQUEST'
  | 'CHILDCARE_LEAVE_INFO_REQUEST'
  | 'DEPENDENT_INFO_REQUEST';

/** 従業員タスクの状態 */
export type EmployeeTaskStatus = 'PENDING' | 'COMPLETED';

/** 従業員に入力を依頼する項目 */
export type EmployeeTaskRequestedField =
  | 'myNumber'
  | 'hireDate'
  | 'birthDate'
  | 'retirementDate'
  | 'insuranceCardReturned'
  | 'postRetirementAddress'
  | 'postRetirementEmail'
  | 'insuranceCardReturnCommitment'
  | 'expectedDeliveryDate'
  | 'deliveryType'
  | 'childcareChild1NameKana'
  | 'childcareChild1NameKanji'
  | 'childcareChild1BirthDate'
  | 'dependentLastName'
  | 'dependentFirstName'
  | 'dependentLastNameKana'
  | 'dependentFirstNameKana'
  | 'dependentBirthDate'
  | 'dependentRelationship'
  | 'dependentLivingArrangement'
  | 'dependentDependencyStartDate'
  | 'dependentHasDisability'
  | 'dependentOccupation'
  | 'dependentCurrentSituation'
  | 'dependentDocumentUpload';

export interface EmployeeTask {
  id: string;
  employeeId: string;
  taskType: EmployeeTaskType;
  status: EmployeeTaskStatus;
  requestedFields: EmployeeTaskRequestedField[];
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeTaskFieldValues {
  myNumber?: string;
  hireDate?: string;
  birthDate?: string;
  retirementDate?: string;
  insuranceCardReturned?: boolean;
  postRetirementAddress?: string;
  postRetirementEmail?: string;
  insuranceCardReturnCommitment?: boolean;
  expectedDeliveryDate?: string;
  deliveryType?: '1' | '2';
  childcareChild1NameKana?: string;
  childcareChild1NameKanji?: string;
  childcareChild1BirthDate?: string;
  dependentLastName?: string;
  dependentFirstName?: string;
  dependentLastNameKana?: string;
  dependentFirstNameKana?: string;
  dependentBirthDate?: string;
  dependentRelationship?: string;
  dependentLivingArrangement?: string;
  dependentDependencyStartDate?: string;
  dependentHasDisability?: boolean;
  dependentOccupation?: string;
  dependentCurrentSituation?: string;
  dependentDocumentUrls?: string[];
}

export interface CreateEmployeeTaskInput {
  employeeId: string;
  taskType: EmployeeTaskType;
  requestedFields: EmployeeTaskRequestedField[];
}
