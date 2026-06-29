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
  basic_info: '基本情報入力',
  address_change: '住所変更',
  commute_change: '通勤交通費（定期代）変更',
  bank_account: '給与振込口座の登録・変更',
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

export function isChangeApplicationWorkflowRequestType(type: WorkflowRequestType): boolean {
  return (
    type === 'address_change' ||
    type === 'commute_change' ||
    type === 'bank_account' ||
    type === 'basic_info'
  );
}

export function isCommuteChangeWorkflowRequestType(type: WorkflowRequestType): boolean {
  return type === 'commute_change';
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
    case 'basic_info':
    case 'address_change':
    case 'commute_change':
    case 'bank_account':
      return '/applications';
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
