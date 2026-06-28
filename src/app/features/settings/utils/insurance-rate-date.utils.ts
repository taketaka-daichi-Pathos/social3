function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date を YYYY-MM-DD 形式に正規化（タイムゾーンずれを避ける） */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseInsuranceRateTargetDate(targetDate: Date | string): Date | null {
  if (targetDate instanceof Date) {
    return Number.isNaN(targetDate.getTime()) ? null : targetDate;
  }

  const trimmed = targetDate.trim();
  const yearMonthMatch = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (yearMonthMatch) {
    const year = Number(yearMonthMatch[1]);
    const month = Number(yearMonthMatch[2]) - 1;
    const date = new Date(year, month, 1);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const isoDate = parseIsoDate(trimmed);
  if (isoDate) {
    return isoDate;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 対象年月（YYYY-MM）を料率判定用の日付（当月1日）に変換する */
export function toRateTargetDateFromYearMonth(targetYearMonth: string): string {
  return `${targetYearMonth.trim()}-01`;
}

/** 対象日から YYYY-MM を抽出する */
export function extractYearMonthKey(targetDate: Date | string): string {
  if (typeof targetDate === 'string') {
    const trimmed = targetDate.trim();
    const yearMonthMatch = /^(\d{4}-\d{2})/.exec(trimmed);
    if (yearMonthMatch) {
      return yearMonthMatch[1];
    }
  }

  const parsed = parseInsuranceRateTargetDate(targetDate);
  if (!parsed) {
    return formatDateKey(new Date()).slice(0, 7);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}

/** YYYY-MM-DD 文字列同士を辞書順で比較（a < b なら負、a > b なら正） */
export function compareDateKeys(left: string, right: string): number {
  return left.localeCompare(right);
}
