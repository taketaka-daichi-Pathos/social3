/** Firestore コレクション名の一元管理 */
export const FirestoreCollections = {
  users: 'users',
  organizations: 'organizations',
  companies: 'companies',
  employees: 'employees',
  payrolls: 'payrolls',
  bonuses: 'bonuses',
  monthlyLocks: 'monthlyLocks',
} as const;

export const FirestoreCompanySubcollections = {
  insuranceRateHistory: 'insuranceRateHistory',
  employeeTasks: 'employee_tasks',
  requests: 'requests',
  adminTodos: 'admin_todos',
} as const;

export type FirestoreCollectionName =
  (typeof FirestoreCollections)[keyof typeof FirestoreCollections];
