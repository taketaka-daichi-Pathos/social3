import {
  InsuranceRateHistoryEntry,
  InsuranceRateHistoryInput,
} from '@features/settings/models/insurance-rate-history.model';

/** 対象月時点で有効な最新の料率履歴（適用開始月の降順で最初にマッチしたエントリ） */
export function findApplicableInsuranceRateHistory(
  history: InsuranceRateHistoryEntry[] | undefined,
  targetYearMonth: string
): InsuranceRateHistoryEntry | null {
  const normalizedTarget = targetYearMonth.trim();

  for (const entry of sortInsuranceRateHistoryDesc(history ?? [])) {
    const month = entry.applicableMonth.trim();
    if (!month || month > normalizedTarget) {
      continue;
    }

    return entry;
  }

  return null;
}

export function sortInsuranceRateHistoryDesc(
  history: InsuranceRateHistoryEntry[]
): InsuranceRateHistoryEntry[] {
  return [...history].sort((left, right) =>
    right.applicableMonth.localeCompare(left.applicableMonth)
  );
}

export function shouldAppendInsuranceRateHistory(
  history: InsuranceRateHistoryEntry[],
  entry: InsuranceRateHistoryInput
): boolean {
  const existingForMonth = history.find((row) => row.applicableMonth === entry.applicableMonth);
  if (!existingForMonth) {
    return true;
  }

  return (
    existingForMonth.healthInsuranceRate !== entry.healthInsuranceRate ||
    existingForMonth.careInsuranceRate !== entry.careInsuranceRate
  );
}

export function formatApplicableMonthLabel(applicableMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(applicableMonth.trim());
  if (!match) {
    return applicableMonth;
  }

  return `${match[1]}年${Number(match[2])}月`;
}
