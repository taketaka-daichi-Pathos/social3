/** 令和6年度 厚生年金保険 等級テーブル（抜粋・拡張用） */
export interface PensionGradeRow {
  grade: number;
  standardMonthlyRemuneration: number;
  minRemuneration: number;
  maxRemuneration: number;
}

export const TOKYO_PENSION_GRADES_R6: readonly PensionGradeRow[] = [
  { grade: 1, standardMonthlyRemuneration: 78_000, minRemuneration: 73_000, maxRemuneration: 83_000 },
  { grade: 2, standardMonthlyRemuneration: 88_000, minRemuneration: 83_000, maxRemuneration: 93_000 },
  { grade: 3, standardMonthlyRemuneration: 98_000, minRemuneration: 93_000, maxRemuneration: 101_000 },
  { grade: 4, standardMonthlyRemuneration: 104_000, minRemuneration: 101_000, maxRemuneration: 107_000 },
  { grade: 5, standardMonthlyRemuneration: 110_000, minRemuneration: 107_000, maxRemuneration: 114_000 },
];
