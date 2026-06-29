/** 産休・育休申請 payload */
export type LeaveWorkflowRequestKind = 'maternity' | 'childcare';

export interface LeaveWorkflowRequestPayload {
  leaveKind: LeaveWorkflowRequestKind;
  plannedStartDate: string;
  plannedEndDate: string;
  documentUrls: string[];
}

/** 扶養追加申請 payload */
export interface AddDependentWorkflowRequestPayload {
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: string;
  relationship: string;
  livingArrangement: string;
  dependencyStartDate: string;
  hasDisability: boolean;
  occupation: string;
  currentSituation: string;
  documentUrls: string[];
}
