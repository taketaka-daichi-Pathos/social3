import { EmployeeTaskRequestedField } from '@features/employee-portal/models/employee-task.model';

/** 従業員への扶養家族情報・証明書類提出依頼で入力を求める項目 */
export const DEPENDENT_INFO_REQUEST_FIELDS: readonly EmployeeTaskRequestedField[] = [
  'dependentLastName',
  'dependentFirstName',
  'dependentLastNameKana',
  'dependentFirstNameKana',
  'dependentBirthDate',
  'dependentRelationship',
  'dependentDependencyStartDate',
  'dependentDocumentSubmission',
];
