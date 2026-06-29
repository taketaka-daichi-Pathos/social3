import { BonusHistoryEntry } from '@features/payroll/models/bonus-history.model';
import { parseYearMonthKey } from '@features/payroll/utils/compensation.utils';

export interface BonusHistoryFiscalYearGroup {
  fiscalYear: number;
  label: string;
  rows: BonusHistoryEntry[];
}

function formatDateToIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizePaymentDate(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate();
    if (!Number.isNaN(date.getTime())) {
      return formatDateToIsoDate(date);
    }
  }

  const trimmed = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

export function normalizeBonusPaymentDate(value: unknown): string {
  return normalizePaymentDate(value);
}

export function hasBonusHistoryForPaymentDate(
  bonusHistory: BonusHistoryEntry[] | undefined,
  paymentDate: string
): boolean {
  const normalized = normalizePaymentDate(paymentDate);
  if (!normalized) {
    return false;
  }

  return (bonusHistory ?? []).some(
    (entry) => normalizePaymentDate(entry.paymentDate) === normalized
  );
}

export function findBonusHistoryForPaymentDate(
  bonusHistory: BonusHistoryEntry[] | undefined,
  paymentDate: string
): BonusHistoryEntry | undefined {
  const normalized = normalizePaymentDate(paymentDate);
  if (!normalized) {
    return undefined;
  }

  return (bonusHistory ?? []).find(
    (entry) => normalizePaymentDate(entry.paymentDate) === normalized
  );
}

export function calculateHistoryStandardBonusAmount(bonusAmount: number): number {
  const amount = Math.max(0, Math.round(Number(bonusAmount) || 0));
  if (amount <= 0) {
    return 0;
  }

  return Math.floor(amount / 1000) * 1000;
}

export function parseBonusHistory(value: unknown): BonusHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((row) => {
      const item = row as Record<string, unknown>;
      const paymentMonth = String(item['paymentMonth'] ?? '').trim();
      if (!/^\d{4}-\d{2}$/.test(paymentMonth)) {
        return null;
      }

      const bonusAmount = Number(item['bonusAmount'] ?? 0);

      return {
        id: String(item['id'] ?? crypto.randomUUID()),
        paymentMonth,
        paymentDate: normalizePaymentDate(item['paymentDate']),
        fixedWagesAtPayment: Number(item['fixedWagesAtPayment'] ?? 0),
        bonusAmount,
        standardBonusAmount: calculateHistoryStandardBonusAmount(bonusAmount),
        savedAt: String(item['savedAt'] ?? ''),
      } satisfies BonusHistoryEntry;
    })
    .filter((entry): entry is BonusHistoryEntry => entry != null)
    .sort((a, b) => {
      const dateCompare = (b.paymentDate || b.paymentMonth).localeCompare(
        a.paymentDate || a.paymentMonth
      );
      if (dateCompare !== 0) {
        return dateCompare;
      }

      return b.paymentMonth.localeCompare(a.paymentMonth);
    });
}

export function createBonusHistoryEntry(data: {
  paymentMonth: string;
  paymentDate: string;
  fixedWagesAtPayment: number;
  bonusAmount: number;
  standardBonusAmount?: number;
}): BonusHistoryEntry {
  const bonusAmount = Math.max(0, Math.round(Number(data.bonusAmount) || 0));
  const fixedWagesAtPayment = Math.max(0, Math.round(Number(data.fixedWagesAtPayment) || 0));
  const standardBonusAmount =
    data.standardBonusAmount != null && Number.isFinite(Number(data.standardBonusAmount))
      ? Math.max(0, Math.round(Number(data.standardBonusAmount)))
      : calculateHistoryStandardBonusAmount(bonusAmount);

  return {
    id: crypto.randomUUID(),
    paymentMonth: data.paymentMonth,
    paymentDate: normalizePaymentDate(data.paymentDate),
    fixedWagesAtPayment,
    bonusAmount,
    standardBonusAmount,
    savedAt: new Date().toISOString(),
  };
}

export function resolveFiscalYearFromYearMonth(yearMonth: string): number {
  const { year, month } = parseYearMonthKey(yearMonth);
  return month >= 4 ? year : year - 1;
}

export function resolveFiscalYearFromPaymentDate(paymentDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paymentDate);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 4 ? year : year - 1;
}

export function resolveFiscalYearForBonusHistory(entry: Pick<BonusHistoryEntry, 'paymentMonth' | 'paymentDate'>): number {
  return (
    resolveFiscalYearFromPaymentDate(entry.paymentDate) ??
    resolveFiscalYearFromYearMonth(entry.paymentMonth)
  );
}

export function formatFiscalYearLabel(fiscalYear: number): string {
  return `${fiscalYear}年度`;
}

export function resolveTargetMonthFromPaymentDate(paymentDate: string): string | null {
  const match = /^(\d{4}-\d{2})-\d{2}$/.exec(paymentDate.trim());
  return match ? match[1] : null;
}

export function formatPaymentDateLabel(paymentDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paymentDate);
  if (!match) {
    return paymentDate || '—';
  }

  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日 支給`;
}

export function groupBonusHistoryByPaymentDate<T extends BonusHistoryEntry>(
  rows: T[]
): Array<{ paymentDate: string; label: string; rows: T[] }> {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const paymentDate = row.paymentDate || '';
    const bucket = groups.get(paymentDate) ?? [];
    bucket.push(row);
    groups.set(paymentDate, bucket);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftKey = left || '0000-00-00';
      const rightKey = right || '0000-00-00';
      return rightKey.localeCompare(leftKey);
    })
    .map(([paymentDate, groupedRows]) => ({
      paymentDate,
      label: paymentDate ? formatPaymentDateLabel(paymentDate) : '支給日未設定',
      rows: groupedRows.sort((a, b) => {
        const numberCompare = String(
          (a as BonusHistoryEntry & { employeeNumber?: string }).employeeNumber ?? ''
        ).localeCompare(
          String((b as BonusHistoryEntry & { employeeNumber?: string }).employeeNumber ?? '')
        );
        if (numberCompare !== 0) {
          return numberCompare;
        }

        return b.paymentMonth.localeCompare(a.paymentMonth);
      }),
    }));
}

export function groupBonusHistoryByFiscalYear<T extends BonusHistoryEntry>(
  rows: T[]
): Array<{ fiscalYear: number; label: string; rows: T[] }> {
  const groups = new Map<number, T[]>();

  for (const row of rows) {
    const fiscalYear = resolveFiscalYearForBonusHistory(row);
    const bucket = groups.get(fiscalYear) ?? [];
    bucket.push(row);
    groups.set(fiscalYear, bucket);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right - left)
    .map(([fiscalYear, groupedRows]) => ({
      fiscalYear,
      label: formatFiscalYearLabel(fiscalYear),
      rows: groupedRows.sort((a, b) => {
        const dateCompare = (b.paymentDate || b.paymentMonth).localeCompare(
          a.paymentDate || a.paymentMonth
        );
        if (dateCompare !== 0) {
          return dateCompare;
        }

        return b.paymentMonth.localeCompare(a.paymentMonth);
      }),
    }));
}
