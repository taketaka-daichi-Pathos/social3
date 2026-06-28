import { WorkflowRequest } from './workflow-request.model';

/** 通知ベルに表示するワークフロー通知 */
export interface WorkflowBellNotification {
  id: string;
  source: 'request' | 'admin_todo';
  title: string;
  message: string;
  route: string;
  createdAt: string;
  /** 管理者向け: 未承認申請の承認ダイアログ用 */
  request?: WorkflowRequest;
}
