import { AdminTodoTargetTab } from '@features/workflow/models/admin-todo.model';

export interface MainNavItem {
  label: string;
  route: string;
  /** admin_todos の targetTab と紐づけ、未完了 TODO がある場合に赤ポチを表示 */
  adminTodoTargetTab?: AdminTodoTargetTab;
}

export interface ActionButtonConfig {
  label: string;
  icon: string;
  variant: 'outline' | 'success' | 'danger' | 'primary-dark';
}

export interface PayrollSubNavItem {
  label: string;
  id: 'monthly' | 'bonus';
}
