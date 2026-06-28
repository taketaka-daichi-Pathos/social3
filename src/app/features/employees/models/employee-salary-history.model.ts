/** 登録時に確定した月次給与実績（証憑・編集不可） */
export interface EmployeeSalaryHistoryEntry {
  targetMonth: string;
  fixedWages: number;
  nonFixedWages: number;
  baseDays: number;
  locked: true;
}

/** 登録時に確定した適用等級の履歴 */
export interface EmployeeGradeHistoryEntry {
  effectiveMonth: string;
  healthGrade: number;
  pensionGrade: number;
  healthStandardRemuneration: number;
  pensionStandardRemuneration: number;
  source: 'registration';
}
