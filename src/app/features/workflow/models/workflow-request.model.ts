/** 申請・依頼の種別 */
export type WorkflowRequestType =
  | 'childcare_leave'
  | 'maternity_leave'
  | 'add_dependent'
  | 'onboarding'
  | 'retirement'
  | 'dependent_info';

/** 申請・依頼のステータス */
export type WorkflowRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';

/** 申請・依頼レコード（companies/{uid}/requests） */
export interface WorkflowRequest {
  id: string;
  type: WorkflowRequestType;
  /** 申請者または依頼送信者（従業員ID または管理者UID） */
  requesterId: string;
  /** 対象従業員ID */
  targetEmployeeId: string;
  status: WorkflowRequestStatus;
  /** 詳細データ（帳票項目・入力内容など） */
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowRequestInput {
  type: WorkflowRequestType;
  requesterId: string;
  targetEmployeeId: string;
  status?: WorkflowRequestStatus;
  payload?: Record<string, unknown>;
}

export interface UpdateWorkflowRequestInput {
  status?: WorkflowRequestStatus;
  payload?: Record<string, unknown>;
}
