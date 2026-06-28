export type RevisionHistoryType = '算定基礎' | '随時改定';

export interface RevisionHistoryEntry {
  id: string;
  applicableMonth: string;
  type: RevisionHistoryType;
  /** 算定基礎の対象年 */
  targetYear?: number;
  /** 随時改定の変動月 */
  changeMonth?: string;
  beforeHealthGrade: number;
  beforeHealthAmount: number;
  beforePensionGrade: number;
  beforePensionAmount: number;
  afterHealthGrade: number;
  afterHealthAmount: number;
  afterPensionGrade: number;
  afterPensionAmount: number;
  /** 算定・随時改定の平均報酬月額（適用時スナップショット） */
  averageAmount?: number | null;
  updatedAt: string;
}
