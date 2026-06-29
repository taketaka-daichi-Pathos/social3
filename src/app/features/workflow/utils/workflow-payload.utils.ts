import {
  AddDependentWorkflowRequestPayload,
  LeaveWorkflowRequestKind,
  LeaveWorkflowRequestPayload,
} from '@features/workflow/models/workflow-request-payload.model';
import { WorkflowRequest, WorkflowRequestType } from '@features/workflow/models/workflow-request.model';
import {
  dependentLivingArrangementLabel,
  dependentOccupationLabel,
  dependentRelationshipLabel,
  dependentSituationLabel,
} from '@features/dependents/utils/dependent-display.utils';
import {
  DependentCurrentSituation,
  DependentLivingArrangement,
  DependentOccupation,
  DependentRelationship,
} from '@features/dependents/models/dependent.model';

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => asString(item)).filter(Boolean);
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
    documentUrls: asStringArray(payload['documentUrls']),
  };
}

export function extractLeaveDocumentUrls(payload: Record<string, unknown>): string[] {
  return parseLeaveWorkflowPayload(payload).documentUrls;
}

export function parseAddDependentWorkflowPayload(
  payload: Record<string, unknown>
): AddDependentWorkflowRequestPayload {
  return {
    lastName: asString(payload['lastName']),
    firstName: asString(payload['firstName']),
    lastNameKana: asString(payload['lastNameKana']),
    firstNameKana: asString(payload['firstNameKana']),
    birthDate: asString(payload['birthDate']),
    relationship: asString(payload['relationship']),
    livingArrangement: asString(payload['livingArrangement']),
    dependencyStartDate: asString(payload['dependencyStartDate']),
    hasDisability: asBoolean(payload['hasDisability']),
    occupation: asString(payload['occupation']),
    currentSituation: asString(payload['currentSituation']),
    documentUrls: asStringArray(payload['documentUrls']),
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
      const relationship = parsed.relationship as DependentRelationship;
      const livingArrangement = parsed.livingArrangement as DependentLivingArrangement;
      const occupation = parsed.occupation as DependentOccupation;
      const currentSituation = parsed.currentSituation as DependentCurrentSituation;

      return [
        { label: '姓', value: parsed.lastName || '—' },
        { label: '名', value: parsed.firstName || '—' },
        { label: 'セイ', value: parsed.lastNameKana || '—' },
        { label: 'メイ', value: parsed.firstNameKana || '—' },
        { label: '生年月日', value: parsed.birthDate || '—' },
        {
          label: '続柄',
          value: parsed.relationship
            ? dependentRelationshipLabel(relationship)
            : '—',
        },
        {
          label: '同居・別居',
          value: parsed.livingArrangement
            ? dependentLivingArrangementLabel(livingArrangement)
            : '—',
        },
        { label: '扶養開始日', value: parsed.dependencyStartDate || '—' },
        { label: '障害の有無', value: parsed.hasDisability ? 'あり' : 'なし' },
        {
          label: '職業',
          value: parsed.occupation ? dependentOccupationLabel(occupation) : '—',
        },
        {
          label: '現在の状況',
          value: parsed.currentSituation
            ? dependentSituationLabel(currentSituation)
            : '—',
        },
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
  };

  const label = labels[type] ?? '申請';
  return `${employeeName}さんの【${label}】に伴う帳票出力`;
}
