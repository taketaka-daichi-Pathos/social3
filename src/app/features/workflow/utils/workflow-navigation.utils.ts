import { AdminTodo, AdminTodoTargetTab } from '@features/workflow/models/admin-todo.model';
import {
  WorkflowRequest,
  WorkflowRequestType,
} from '@features/workflow/models/workflow-request.model';

const REQUEST_TYPE_LABELS: Record<WorkflowRequestType, string> = {
  childcare_leave: '育児休業',
  maternity_leave: '産前産後休業',
  add_dependent: '扶養追加',
  onboarding: '入社手続き',
  retirement: '退職手続き',
  dependent_info: '扶養家族情報',
};

const REQUEST_STATUS_LABELS: Record<WorkflowRequest['status'], string> = {
  pending: '対応待ち',
  approved: '承認済み',
  rejected: '却下',
  completed: '処理済み',
};

export function isLeaveWorkflowRequestType(type: WorkflowRequestType): boolean {
  return type === 'maternity_leave' || type === 'childcare_leave';
}

export function isAddDependentWorkflowRequestType(type: WorkflowRequestType): boolean {
  return type === 'add_dependent';
}

const ADMIN_TODO_TAB_ROUTES: Record<AdminTodoTargetTab, string> = {
  'legal-forms': '/statutory-reports',
  employees: '/employees',
  dependents: '/dependents',
  leave: '/leave',
  retirement: '/retirement',
  payroll: '/payroll',
  revision: '/revision',
};

export function workflowRequestTypeLabel(type: WorkflowRequestType): string {
  return REQUEST_TYPE_LABELS[type] ?? type;
}

export function workflowRequestStatusLabel(status: WorkflowRequest['status']): string {
  return REQUEST_STATUS_LABELS[status] ?? status;
}

export function resolveWorkflowRequestRoute(request: WorkflowRequest): string {
  switch (request.type) {
    case 'childcare_leave':
    case 'maternity_leave':
      return '/leave';
    case 'add_dependent':
    case 'dependent_info':
      return '/dependents';
    case 'retirement':
      return '/retirement';
    case 'onboarding':
      return '/employees';
    default:
      return '/employees';
  }
}

export function resolveAdminTodoRoute(todo: AdminTodo): string {
  return ADMIN_TODO_TAB_ROUTES[todo.targetTab] ?? '/employees';
}

export function buildWorkflowRequestBellMessage(request: WorkflowRequest): string {
  return `${workflowRequestTypeLabel(request.type)}（${workflowRequestStatusLabel(request.status)}）`;
}
