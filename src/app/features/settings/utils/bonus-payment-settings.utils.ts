import { isValidIsoDate } from '@core/utils/text-normalize.utils';
import { BonusPaymentSetting } from '@features/settings/models/company-settings.model';
import { normalizeYearMonthKey } from '@features/payroll/utils/system-operation-month.utils';

export const BONUS_PAYMENT_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** YYYY-MM-DD を正規化。不正な日付は null */
export function normalizeBonusPaymentSettingDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !BONUS_PAYMENT_DATE_PATTERN.test(trimmed)) {
    return null;
  }

  return isValidIsoDate(trimmed) ? trimmed : null;
}

/** システム利用開始年月（YYYY-MM）の月初日（YYYY-MM-01）を返す */
export function resolveMinBonusPaymentDateFromSystemStart(
  systemStartDate: string | null | undefined
): string | null {
  const normalizedMonth = normalizeYearMonthKey(systemStartDate);
  if (!normalizedMonth) {
    return null;
  }

  const [year, month] = normalizedMonth.split('-');
  return `${year}-${month}-01`;
}

export function isBonusPaymentDateBeforeSystemStart(
  paymentDate: string,
  systemStartDate: string | null | undefined
): boolean {
  const normalizedPaymentDate = normalizeBonusPaymentSettingDate(paymentDate);
  const minDate = resolveMinBonusPaymentDateFromSystemStart(systemStartDate);
  if (!normalizedPaymentDate || !minDate) {
    return false;
  }

  return normalizedPaymentDate < minDate;
}

export function normalizeBonusPaymentSettings(value: unknown): BonusPaymentSetting[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((row) => {
      const item = row as Record<string, unknown>;
      const name = String(item['name'] ?? '').trim();
      const rawDate = String(item['paymentDate'] ?? item['paymentMonthDay'] ?? '').trim();
      const paymentDate = normalizeBonusPaymentSettingDate(rawDate);
      if (!name || !paymentDate) {
        return null;
      }

      return {
        id: String(item['id'] ?? crypto.randomUUID()),
        name,
        paymentDate,
      } satisfies BonusPaymentSetting;
    })
    .filter((entry): entry is BonusPaymentSetting => entry != null);
}

export function bonusPaymentSettingsFromFormValues(
  rows: Array<{ id: string; name: string; paymentDate: string }>
): BonusPaymentSetting[] {
  return rows
    .map((row) => {
      const name = row.name.trim();
      const paymentDate = normalizeBonusPaymentSettingDate(row.paymentDate);
      if (!name || !paymentDate) {
        return null;
      }

      return {
        id: row.id.trim() || crypto.randomUUID(),
        name,
        paymentDate,
      } satisfies BonusPaymentSetting;
    })
    .filter((entry): entry is BonusPaymentSetting => entry != null);
}

export function formatBonusPaymentSettingLabel(
  setting: Pick<BonusPaymentSetting, 'name' | 'paymentDate'>
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(setting.paymentDate);
  if (!match) {
    return setting.name;
  }

  const month = Number(match[2]);
  const day = Number(match[3]);
  return `${match[1]}年${setting.name}（${month}月${day}日）`;
}

/** 賞与入力画面のテンプレート表示用（例: 夏季賞与 (06-11)） */
export function formatBonusTemplateLabel(
  setting: Pick<BonusPaymentSetting, 'name' | 'paymentDate'>
): string {
  const monthDay = extractMonthDayFromBonusPaymentDate(setting.paymentDate);
  if (!monthDay) {
    return setting.name;
  }

  return `${setting.name} (${monthDay})`;
}

export function extractMonthDayFromBonusPaymentDate(paymentDate: string): string | null {
  const normalized = normalizeBonusPaymentSettingDate(paymentDate);
  if (!normalized) {
    return null;
  }

  return normalized.slice(5);
}

export function composeBonusPaymentDateFromYearAndMonthDay(
  year: string | number,
  monthDay: string
): string {
  const yearNumber = Number(year);
  const normalizedMonthDay = extractMonthDayFromBonusPaymentDate(`2000-${monthDay}`) ?? monthDay;
  if (!Number.isInteger(yearNumber) || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(normalizedMonthDay)) {
    return '';
  }

  const composed = `${yearNumber}-${normalizedMonthDay}`;
  return normalizeBonusPaymentSettingDate(composed) ?? '';
}

export function composeBonusPaymentDateFromYearAndSetting(
  year: string | number,
  setting: Pick<BonusPaymentSetting, 'paymentDate'>
): string {
  const monthDay = extractMonthDayFromBonusPaymentDate(setting.paymentDate);
  if (!monthDay) {
    return '';
  }

  return composeBonusPaymentDateFromYearAndMonthDay(year, monthDay);
}

export function getBonusPaymentYearOptionsFromSystemStart(
  systemStartDate: string | null | undefined,
  futureYears = 5
): number[] {
  const normalizedMonth = normalizeYearMonthKey(systemStartDate);
  const currentYear = new Date().getFullYear();
  const startYear = normalizedMonth ? Number(normalizedMonth.slice(0, 4)) : currentYear;
  const endYear = Math.max(startYear + futureYears, currentYear + futureYears);
  const years: number[] = [];

  for (let year = startYear; year <= endYear; year++) {
    years.push(year);
  }

  return years;
}

export function resolveBonusPaymentSelectionFromDate(
  paymentDate: string,
  settings: BonusPaymentSetting[]
): { year: string; settingId: string } | null {
  const normalized = normalizeBonusPaymentSettingDate(paymentDate);
  if (!normalized) {
    return null;
  }

  const year = normalized.slice(0, 4);
  const monthDay = normalized.slice(5);
  const exactMatch = settings.find((row) => row.paymentDate === normalized);
  const templateMatch = settings.find(
    (row) => extractMonthDayFromBonusPaymentDate(row.paymentDate) === monthDay
  );
  const setting = exactMatch ?? templateMatch;
  if (!setting) {
    return null;
  }

  return {
    year,
    settingId: setting.id,
  };
}

export function sortBonusPaymentSettings(settings: BonusPaymentSetting[]): BonusPaymentSetting[] {
  return [...settings].sort((left, right) => left.paymentDate.localeCompare(right.paymentDate));
}
