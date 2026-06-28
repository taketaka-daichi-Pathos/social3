/** 産休・育休申請 payload */
export type LeaveWorkflowRequestKind = 'maternity' | 'childcare';

export interface LeaveWorkflowRequestPayload {
  leaveKind: LeaveWorkflowRequestKind;
  plannedStartDate: string;
  plannedEndDate: string;
}

/** 扶養追加申請 payload */
export interface AddDependentWorkflowRequestPayload {
  familyMemberName: string;
  birthDate: string;
  relationship: string;
  reason: string;
}

/** 基本情報登録 payload */
export interface BasicInfoWorkflowRequestPayload {
  currentAddress: string;
  bankName: string;
  accountNumber: string;
}
