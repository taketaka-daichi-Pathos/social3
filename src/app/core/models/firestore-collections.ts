/** Firestore コレクション名の一元管理 */
export const FirestoreCollections = {
  users: 'users',
  organizations: 'organizations',
  companies: 'companies',
  employees: 'employees',
  payrolls: 'payrolls',
  bonuses: 'bonuses',
} as const;

export type FirestoreCollectionName =
  (typeof FirestoreCollections)[keyof typeof FirestoreCollections];
