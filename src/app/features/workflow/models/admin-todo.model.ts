/** 管理者TODOが誘導する管理画面タブ */
export type AdminTodoTargetTab =
  | 'legal-forms'
  | 'employees'
  | 'dependents'
  | 'leave'
  | 'retirement'
  | 'payroll'
  | 'revision';

/** 管理者向けTODO（companies/{uid}/admin_todos） */
export interface AdminTodo {
  id: string;
  relatedRequestId: string;
  title: string;
  targetTab: AdminTodoTargetTab;
  isCompleted: boolean;
  createdAt: string;
}

export interface CreateAdminTodoInput {
  relatedRequestId: string;
  title: string;
  targetTab: AdminTodoTargetTab;
  isCompleted?: boolean;
}
