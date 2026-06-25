/** 令和6年度 協会けんぽ（東京都）等級テーブル（抜粋・拡張用） */
export interface KenpoGradeRow {
  grade: number;
  standardMonthlyRemuneration: number;
  /** 報酬月額の下限（円以上） */
  minRemuneration: number;
  /** 報酬月額の上限（円未満） */
  maxRemuneration: number;
}

/**
 * 代表的な等級（3〜7等級: 月額73,000円〜114,000円未満）
 * 全等級は今後この配列へ追記する
 */
export const TOKYO_KENPO_GRADES_R6: readonly KenpoGradeRow[] = [
  { grade: 3, standardMonthlyRemuneration: 78_000, minRemuneration: 73_000, maxRemuneration: 83_000 },
  { grade: 4, standardMonthlyRemuneration: 88_000, minRemuneration: 83_000, maxRemuneration: 93_000 },
  { grade: 5, standardMonthlyRemuneration: 98_000, minRemuneration: 93_000, maxRemuneration: 101_000 },
  { grade: 6, standardMonthlyRemuneration: 104_000, minRemuneration: 101_000, maxRemuneration: 107_000 },
  { grade: 7, standardMonthlyRemuneration: 110_000, minRemuneration: 107_000, maxRemuneration: 114_000 },
];
