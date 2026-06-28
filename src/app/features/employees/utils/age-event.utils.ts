import { Dependent } from '@features/dependents/models/dependent.model';
import {
  compareYearMonths,
  toYearMonthKeyFromParts,
} from '@features/payroll/utils/compensation.utils';

/** 被扶養者（異動）届の喪失理由コード */
export const FUYOU_IDOU_LOSS_CHANGE_REASON = '2';

export type AgeMilestoneEvent =
  | 'CARE_START_40'
  | 'CARE_STOP_65'
  | 'PENSION_STOP_70'
  | 'HEALTH_STOP_75';

export interface AgeBasedPremiumFlags {
  includeLongTermCare: boolean;
  exemptHealth: boolean;
  exemptPension: boolean;
}

function parseBirthDate(birthDate: string): Date | null {
  const trimmed = birthDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDayBeforeBirthdayMonth(birthDate: string, yearsToAdd: number): string | null {
  const birth = parseBirthDate(birthDate);
  if (!birth) {
    return null;
  }

  const dayBefore = new Date(
    birth.getFullYear() + yearsToAdd,
    birth.getMonth(),
    birth.getDate() - 1
  );

  return toYearMonthKeyFromParts(dayBefore.getFullYear(), dayBefore.getMonth() + 1);
}

function getBirthdayMonth(birthDate: string, yearsToAdd: number): string | null {
  const birth = parseBirthDate(birthDate);
  if (!birth) {
    return null;
  }

  return toYearMonthKeyFromParts(birth.getFullYear() + yearsToAdd, birth.getMonth() + 1);
}

/** 40歳到達月（誕生日の前日が属する月）— 介護保険料徴収開始 */
export function getCareInsuranceStartMonth(birthDate: string): string | null {
  return getDayBeforeBirthdayMonth(birthDate, 40);
}

/** 65歳到達月（誕生日の前日が属する月）— 介護保険料徴収停止 */
export function getCareInsuranceLossMonth(birthDate: string): string | null {
  return getDayBeforeBirthdayMonth(birthDate, 65);
}

/** 70歳到達月（誕生日当日が属する月）— 厚生年金保険料徴収停止 */
export function getPensionInsuranceLossMonth(birthDate: string): string | null {
  return getBirthdayMonth(birthDate, 70);
}

/** 75歳到達月（誕生日当日が属する月）— 健康保険・介護保険料徴収停止 */
export function getHealthInsuranceLossMonth(birthDate: string): string | null {
  return getBirthdayMonth(birthDate, 75);
}

/** 75歳の誕生日（YYYY-MM-DD） */
export function get75thBirthday(birthDate: string): string | null {
  const birth = parseBirthDate(birthDate);
  if (!birth) {
    return null;
  }

  return formatIsoDate(new Date(birth.getFullYear() + 75, birth.getMonth(), birth.getDate()));
}

export function isOnOrAfterYearMonth(targetYearMonth: string, eventMonth: string | null): boolean {
  return eventMonth != null && compareYearMonths(targetYearMonth, eventMonth) >= 0;
}

export function isBeforeYearMonth(targetYearMonth: string, eventMonth: string | null): boolean {
  return eventMonth != null && compareYearMonths(targetYearMonth, eventMonth) < 0;
}

/**
 * 対象年月における保険料徴収フラグ。
 * 40歳未満（到達月前）は介護0、65歳到達月以降は介護0、70歳到達月以降は厚年0、75歳到達月以降は健保・介護0。
 */
export function resolveAgeBasedPremiumFlags(
  birthDate: string,
  targetYearMonth: string
): AgeBasedPremiumFlags {
  if (!birthDate.trim() || !targetYearMonth.trim()) {
    return { includeLongTermCare: false, exemptHealth: false, exemptPension: false };
  }

  const careStartMonth = getCareInsuranceStartMonth(birthDate);
  const careLossMonth = getCareInsuranceLossMonth(birthDate);
  const pensionLossMonth = getPensionInsuranceLossMonth(birthDate);
  const healthLossMonth = getHealthInsuranceLossMonth(birthDate);

  const exemptHealth = isOnOrAfterYearMonth(targetYearMonth, healthLossMonth);
  const exemptPension = isOnOrAfterYearMonth(targetYearMonth, pensionLossMonth);
  const includeLongTermCare =
    isOnOrAfterYearMonth(targetYearMonth, careStartMonth) &&
    isBeforeYearMonth(targetYearMonth, careLossMonth) &&
    !exemptHealth;

  return { includeLongTermCare, exemptHealth, exemptPension };
}

/** 対象年月に新たに発生した年齢イベント */
export function detectAgeEventsForMonth(
  birthDate: string,
  targetYearMonth: string
): AgeMilestoneEvent[] {
  if (!birthDate.trim() || !targetYearMonth.trim()) {
    return [];
  }

  const events: AgeMilestoneEvent[] = [];

  if (getCareInsuranceStartMonth(birthDate) === targetYearMonth) {
    events.push('CARE_START_40');
  }

  if (getCareInsuranceLossMonth(birthDate) === targetYearMonth) {
    events.push('CARE_STOP_65');
  }

  if (getPensionInsuranceLossMonth(birthDate) === targetYearMonth) {
    events.push('PENSION_STOP_70');
  }

  if (getHealthInsuranceLossMonth(birthDate) === targetYearMonth) {
    events.push('HEALTH_STOP_75');
  }

  return events;
}

/** 75歳到達に伴う被扶養者（異動）届（喪失）用データ */
export function mapDependentsForHealthInsuranceLoss(
  birthDate: string,
  dependents: Dependent[]
): Dependent[] {
  const changeDate = get75thBirthday(birthDate);
  if (!changeDate || dependents.length === 0) {
    return dependents;
  }

  return dependents.map((dependent) => ({
    ...dependent,
    changeDate,
    changeReason: FUYOU_IDOU_LOSS_CHANGE_REASON,
  }));
}

/** 75歳到達月以降か（法定帳票・扶養異動届用） */
export function hasReachedHealthInsuranceLossMonth(
  birthDate: string,
  referenceYearMonth: string
): boolean {
  return isOnOrAfterYearMonth(referenceYearMonth, getHealthInsuranceLossMonth(birthDate));
}

/** 70歳到達月以降か（70歳以上被用者該当届用） */
export function hasReachedPensionInsuranceLossMonth(
  birthDate: string,
  referenceYearMonth: string
): boolean {
  return isOnOrAfterYearMonth(referenceYearMonth, getPensionInsuranceLossMonth(birthDate));
}
