import { HEALTH_INSURANCE_RATE_PERIODS } from '@features/settings/models/health-insurance-rate.master';
import { normalizeYearMonthKey } from '@features/payroll/utils/system-operation-month.utils';

/**
 * 協会けんぽマスターの最古適用月（令和4年度 = 2022-03-01 改定）。
 * 手動追加可能な「過去遡及」はこの月より前（2022-03 以前）。
 */
export const STATUTORY_MASTER_EARLIEST_MONTH =
  HEALTH_INSURANCE_RATE_PERIODS[0]?.effectiveFrom.slice(0, 7) ?? '2022-03';

/** 手動追加を禁止する法定マスター保持期間の開始月（2022-04 〜） */
export const STATUTORY_MASTER_MANUAL_ENTRY_FORBIDDEN_FROM = '2022-04';

/** 手動追加を禁止する法定マスター保持期間の終了月（〜 2027-03） */
export const STATUTORY_MASTER_MANUAL_ENTRY_FORBIDDEN_TO = '2027-03';

/** 手動追加を禁止する法定マスター保持期間の終了月の翌月（2027-04 以降は手動追加可） */
export const STATUTORY_MASTER_MANUAL_ENTRY_ALLOWED_FROM = '2027-04';

export const STATUTORY_MASTER_MANUAL_ENTRY_RESTRICTION_HINT =
  '※2022年4月〜2027年3月までの健康保険・介護保険料率はシステムで保持・確定しているため変更できません。独自料率の追加は、それ以前の過去月、または2027年4月以降でのみ可能です。';

export const STATUTORY_MASTER_MANUAL_ENTRY_ERROR_MESSAGE =
  '※2022年4月〜2027年3月は法定料率マスター保持期間のため、独自料率の適用開始月として指定できません。2022年3月以前、または2027年4月以降を指定してください。';

/** YYYY-MM が法定マスター保持期間（手動追加禁止帯）に含まれるか */
export function isWithinStatutoryMasterManualEntryForbiddenPeriod(
  applicableMonth: string | null | undefined
): boolean {
  const normalized = normalizeYearMonthKey(applicableMonth);
  if (!normalized) {
    return false;
  }

  return (
    normalized >= STATUTORY_MASTER_MANUAL_ENTRY_FORBIDDEN_FROM &&
    normalized <= STATUTORY_MASTER_MANUAL_ENTRY_FORBIDDEN_TO
  );
}

/** ユーザーの手動入力として適用開始月が許可されるか */
export function isManualInsuranceRateApplicableMonthAllowed(
  applicableMonth: string | null | undefined
): boolean {
  return !isWithinStatutoryMasterManualEntryForbiddenPeriod(applicableMonth);
}

/** システム初期生成（systemStartDate による初回履歴）として許可されるか */
export function isSystemSeedInsuranceRateApplicableMonth(
  applicableMonth: string | null | undefined,
  systemStartDate: string | null | undefined
): boolean {
  const normalizedMonth = normalizeYearMonthKey(applicableMonth);
  const normalizedStart = normalizeYearMonthKey(systemStartDate);
  return (
    normalizedMonth != null &&
    normalizedStart != null &&
    normalizedMonth === normalizedStart
  );
}

/** 初回履歴の適用開始月（systemStartDate を YYYY-MM に正規化） */
export function resolveInitialInsuranceRateApplicableMonth(
  systemStartDate: string | null | undefined,
  fallbackMonth: string
): string {
  return normalizeYearMonthKey(systemStartDate) ?? normalizeYearMonthKey(fallbackMonth) ?? fallbackMonth.trim();
}
