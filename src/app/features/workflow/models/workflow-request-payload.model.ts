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

/** 基本情報登録 payload */
export interface BasicInfoWorkflowRequestPayload {
  currentAddress: string;
  bankName: string;
  accountNumber: string;
}

/** 住所変更申請 payload */
export interface AddressChangeWorkflowRequestPayload {
  postalCode: string;
  address: string;
}

/** 通勤交通費（定期代）変更申請 payload */
export interface CommuteChangeWorkflowRequestPayload {
  commuteRoute: string;
  commutePassAmount: number | null;
}

/** 給与振込口座変更申請 payload */
export interface BankAccountWorkflowRequestPayload {
  bankName: string;
  bankBranchName: string;
  bankAccountType: string;
  bankAccountNumber: string;
}
