export const YEAR_SELECT_MIN_YEAR = 1980;

/** 現在年から先何年まで選択肢に含めるか */
export const YEAR_SELECT_FUTURE_YEARS = 4;

export function buildYearSelectOptions(
  selectedYear?: number,
  referenceYear = new Date().getFullYear()
): number[] {
  const normalizedSelected = selectedYear ?? referenceYear;
  const startYear = Math.min(YEAR_SELECT_MIN_YEAR, normalizedSelected);
  const endYear = Math.max(referenceYear + YEAR_SELECT_FUTURE_YEARS, normalizedSelected);
  const years: number[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }

  return years;
}
