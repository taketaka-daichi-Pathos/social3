import {
  AddDependentWorkflowRequestPayload,
  BasicInfoWorkflowRequestPayload,
  LeaveWorkflowRequestKind,
  LeaveWorkflowRequestPayload,
} from '@features/workflow/models/workflow-request-payload.model';
import { WorkflowRequest, WorkflowRequestType } from '@features/workflow/models/workflow-request.model';

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

const LEAVE_KIND_LABELS: Record<LeaveWorkflowRequestKind, string> = {
  maternity: '産休',
  childcare: '育休',
};

export function leaveWorkflowRequestKindLabel(kind: LeaveWorkflowRequestKind): string {
  return LEAVE_KIND_LABELS[kind] ?? kind;
}

function parseLeaveKind(value: unknown): LeaveWorkflowRequestKind | null {
  return value === 'maternity' || value === 'childcare' ? value : null;
}

export function parseLeaveWorkflowPayload(
  payload: Record<string, unknown>
): LeaveWorkflowRequestPayload {
  const leaveKind = parseLeaveKind(payload['leaveKind']) ?? 'childcare';

  return {
    leaveKind,
    plannedStartDate: asString(payload['plannedStartDate']),
    plannedEndDate: asString(payload['plannedEndDate']),
  };
}

export function parseAddDependentWorkflowPayload(
  payload: Record<string, unknown>
): AddDependentWorkflowRequestPayload {
  return {
    familyMemberName: asString(payload['familyMemberName']),
    birthDate: asString(payload['birthDate']),
    relationship: asString(payload['relationship']),
    reason: asString(payload['reason']),
  };
}

export function parseBasicInfoWorkflowPayload(
  payload: Record<string, unknown>
): BasicInfoWorkflowRequestPayload {
  return {
    currentAddress: asString(payload['currentAddress']),
    bankName: asString(payload['bankName']),
    accountNumber: asString(payload['accountNumber']),
  };
}

export interface WorkflowPayloadDisplayRow {
  label: string;
  value: string;
}

export function buildWorkflowPayloadDisplayRows(
  type: WorkflowRequestType,
  payload: Record<string, unknown>
): WorkflowPayloadDisplayRow[] {
  switch (type) {
    case 'childcare_leave':
    case 'maternity_leave': {
      const parsed = parseLeaveWorkflowPayload(payload);
      return [
        { label: '休業の種類', value: leaveWorkflowRequestKindLabel(parsed.leaveKind) },
        { label: '開始予定日', value: parsed.plannedStartDate || '—' },
        { label: '終了予定日', value: parsed.plannedEndDate || '—' },
      ];
    }
    case 'add_dependent': {
      const parsed = parseAddDependentWorkflowPayload(payload);
      return [
        { label: '家族氏名', value: parsed.familyMemberName || '—' },
        { label: '生年月日', value: parsed.birthDate || '—' },
        { label: '続柄', value: parsed.relationship || '—' },
        { label: '追加理由', value: parsed.reason || '—' },
      ];
    }
    case 'basic_info': {
      const parsed = parseBasicInfoWorkflowPayload(payload);
      return [
        { label: '現住所', value: parsed.currentAddress || '—' },
        { label: '金融機関名', value: parsed.bankName || '—' },
        { label: '口座番号', value: parsed.accountNumber || '—' },
      ];
    }
    default:
      return Object.entries(payload).map(([label, value]) => ({
        label,
        value: asString(value),
      }));
  }
}

export function buildAdminTodoTitleForRequest(
  employeeName: string,
  type: WorkflowRequest['type']
): string {
  const labels: Partial<Record<WorkflowRequestType, string>> = {
    childcare_leave: '育休申請',
    maternity_leave: '産休申請',
    add_dependent: '扶養追加申請',
    basic_info: '基本情報登録',
  };

  const label = labels[type] ?? '申請';
  return `${employeeName}さんの【${label}】に伴う帳票出力`;
}
