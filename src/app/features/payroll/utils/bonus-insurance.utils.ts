import { SocialInsurancePremiumBreakdown } from '@core/models/social-insurance.model';
import { roundEmployeeDeductionShare, multiplyAmountByInsuranceRateDecimal } from '@core/services/social-insurance-calculator.service';
import { CompanySettings } from '@features/settings/models/company-settings.model';
import { getReiwa8HealthInsuranceRate } from '@features/settings/models/reiwa-8-health-insurance-rates.constants';
import { DEFAULT_HEALTH_INSURANCE_RATE_PERCENT, HEALTH_INSURANCE_RATE_PERIODS, HEALTH_INSURANCE_RATES_BY_PREFECTURE } from '@features/settings/models/health-insurance-rate.master';
import { CARE_INSURANCE_RATE_PERIODS } from '@features/settings/models/care-insurance-rate.master';
import { getCurrentCareInsuranceRate } from '@features/settings/utils/care-insurance-rate.utils';
import { resolveCompanyInsuranceRatesForPrefecture } from '@features/settings/utils/company-insurance-rate.utils';
import { findApplicableInsuranceRateHistory } from '@features/settings/utils/insurance-rate-history.utils';
import {
  extractYearMonthKey,
  toRateTargetDateFromYearMonth,
} from '@features/settings/utils/insurance-rate-date.utils';
import { BonusHistoryEntry } from '@features/payroll/models/bonus-history.model';
import { CompensationEntry, CompensationRecord } from '@features/payroll/models/compensation.model';
import { listFiscalYearMonthsUpTo } from '@features/payroll/utils/compensation.utils';
import { resolveFiscalYearForBonusHistory } from '@features/payroll/utils/bonus-history.utils';

export const BONUS_AMOUNT_ROUND_UNIT = 1000;
export const PENSION_BONUS_STANDARD_CAP = 1_500_000;
export const HEALTH_LTC_BONUS_FISCAL_CAP = 5_730_000;
export const DEFAULT_PENSION_INSURANCE_RATE = 0.183;

export interface InsuranceRateSettings {
  healthRate: number;
  longTermCareRate: number;
  pensionRate: number;
}

export interface PayrollInsuranceRateTarget {
  targetYear: number;
  targetMonth: number;
}

export function formatTargetYearMonth(targetYear: number, targetMonth: number): string {
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
}

export function parseTargetYearMonth(
  targetYearMonth: string
): { targetYear: number; targetMonth: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(targetYearMonth.trim());
  if (!match) {
    return null;
  }

  const targetYear = Number(match[1]);
  const targetMonth = Number(match[2]);
  if (
    !Number.isInteger(targetYear) ||
    !Number.isInteger(targetMonth) ||
    targetMonth < 1 ||
    targetMonth > 12
  ) {
    return null;
  }

  return { targetYear, targetMonth };
}

function normalizePayrollRateTarget(
  target: Date | string | PayrollInsuranceRateTarget
): { targetYearMonth: string; targetDate: string } {
  if (typeof target === 'object' && 'targetYear' in target) {
    const targetYearMonth = formatTargetYearMonth(target.targetYear, target.targetMonth);
    return {
      targetYearMonth,
      targetDate: toRateTargetDateFromYearMonth(targetYearMonth),
    };
  }

  const targetYearMonth = extractYearMonthKey(target);
  return {
    targetYearMonth,
    targetDate: toRateTargetDateFromYearMonth(targetYearMonth),
  };
}

export interface BonusInsuranceCalculationResult {
  bonusAmount: number;
  standardBonusAmount: number;
  pensionStandardBonus: number;
  healthStandardBonus: number;
  pastFiscalStandardBonusTotal: number;
  premiums: SocialInsurancePremiumBreakdown;
}

const ZERO_SHARE = { employeeShare: 0, employerShare: 0, total: 0 };

/** 賞与計算用の非負整数正規化（NaN / Infinity を 0 に落とす） */
export function normalizeNonNegativeAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return Math.round(amount);
}

export function calculateBonusEntryAmount(fixedWages: number, nonFixedWages: number): number {
  return normalizeNonNegativeAmount(fixedWages) + normalizeNonNegativeAmount(nonFixedWages);
}

export function calculateStandardBonusAmount(bonusAmount: number): number {
  const amount = normalizeNonNegativeAmount(bonusAmount);
  if (amount <= 0) {
    return 0;
  }

  return Math.floor(amount / BONUS_AMOUNT_ROUND_UNIT) * BONUS_AMOUNT_ROUND_UNIT;
}

function resolveHistoryStandardBonusAmount(
  entry: Pick<BonusHistoryEntry, 'bonusAmount' | 'standardBonusAmount'>
): number {
  const fromStandard = Number(entry.standardBonusAmount);
  if (entry.standardBonusAmount != null && Number.isFinite(fromStandard)) {
    return Math.max(0, Math.round(fromStandard));
  }

  return calculateStandardBonusAmount(Number(entry.bonusAmount) ?? 0);
}

export interface FiscalYearCumulativeBonusSummary {
  fiscalYear: number;
  totalStandardBonus: number;
  remainingHealthCap: number;
}

export interface PensionCapDisplay {
  standardBonusAmount: number;
  pensionStandardBonus: number;
  capped: boolean;
}

export function getFiscalYearStandardBonusTotalFromHistory(
  bonusHistory: BonusHistoryEntry[] | undefined,
  fiscalYear: number,
  excludePaymentDate?: string
): number {
  return (bonusHistory ?? []).reduce((total, entry) => {
    if (resolveFiscalYearForBonusHistory(entry) !== fiscalYear) {
      return total;
    }

    if (excludePaymentDate && entry.paymentDate === excludePaymentDate) {
      return total;
    }

    const nextTotal = total + resolveHistoryStandardBonusAmount(entry);
    return Number.isFinite(nextTotal) ? nextTotal : total;
  }, 0);
}

export function summarizeFiscalYearCumulativeBonus(
  bonusHistory: BonusHistoryEntry[] | undefined,
  fiscalYear: number,
  excludePaymentDate?: string
): FiscalYearCumulativeBonusSummary {
  const totalStandardBonus = Math.max(
    0,
    getFiscalYearStandardBonusTotalFromHistory(bonusHistory, fiscalYear, excludePaymentDate) || 0
  );

  return {
    fiscalYear: Number.isFinite(fiscalYear) ? fiscalYear : 0,
    totalStandardBonus,
    remainingHealthCap: Math.max(0, HEALTH_LTC_BONUS_FISCAL_CAP - totalStandardBonus),
  };
}

export function resolvePensionCapDisplay(
  standardBonusAmount: number,
  existingSameMonthStandardBonusTotal = 0
): PensionCapDisplay {
  const normalized = calculateStandardBonusAmount(standardBonusAmount);
  const pensionStandardBonus = resolvePensionBonusStandard(
    normalized,
    existingSameMonthStandardBonusTotal
  );
  const capped = pensionStandardBonus < normalized;

  return {
    standardBonusAmount: normalized,
    pensionStandardBonus,
    capped,
  };
}

/**
 * 給与・賞与・各種保険料の計算用。
 * 1. 会社が保存した料率履歴（対象年月以前で最も新しいエントリ）
 * 2. 都道府県マスター（対象年月時点の健康保険・介護保険料率）
 * 3. 会社ドキュメントの保存値（都道府県不明時などの最終フォールバック）
 */
export function resolvePayrollInsuranceRates(
  company: CompanySettings | null,
  target: Date | string | PayrollInsuranceRateTarget
): InsuranceRateSettings {
  const { targetYearMonth, targetDate } = normalizePayrollRateTarget(target);
  const parsedTarget = parseTargetYearMonth(targetYearMonth);
  const targetYear = parsedTarget?.targetYear;
  const targetMonth = parsedTarget?.targetMonth;
  const prefecture = company?.prefecture?.trim() ?? '';

  console.log('--- [Debug] 過去料率引き当てテスト開始 ---');
  console.log('[Debug] 1. 計算対象の年月と都道府県:', {
    year: targetYear,
    month: targetMonth,
    prefecture,
    targetYearMonth,
    targetDate,
    rawTarget: target,
  });

  const companyRateHistory = company?.insuranceRateHistory ?? [];
  const prefectureMasterRates = prefecture
    ? HEALTH_INSURANCE_RATES_BY_PREFECTURE[prefecture] ?? null
    : null;
  console.log('[Debug] 2. 参照している料率マスターの全件データ:', {
    companyRateHistory,
    healthInsurancePeriods: HEALTH_INSURANCE_RATE_PERIODS,
    careInsurancePeriods: CARE_INSURANCE_RATE_PERIODS,
    prefectureMasterRates,
    companySavedRates: {
      healthInsuranceRate: company?.healthInsuranceRate ?? null,
      longTermCareInsuranceRate: company?.longTermCareInsuranceRate ?? null,
    },
  });

  const filteredCompanyHistory = companyRateHistory.filter((entry) => {
    const month = entry.applicableMonth.trim();
    return month && month <= targetYearMonth;
  });
  console.log('[Debug] 3. 適用年月で絞り込んだ候補データ:', {
    filteredCompanyHistory,
    selectedCompanyHistoryEntry: findApplicableInsuranceRateHistory(
      company?.insuranceRateHistory,
      targetYearMonth
    ),
  });

  const historyEntry = findApplicableInsuranceRateHistory(
    company?.insuranceRateHistory,
    targetYearMonth
  );

  if (historyEntry) {
    const finalRate = {
      source: 'company_rate_history',
      healthInsuranceRatePercent: historyEntry.healthInsuranceRate,
      longTermCareInsuranceRatePercent: historyEntry.careInsuranceRate,
      healthRate: historyEntry.healthInsuranceRate / 100,
      longTermCareRate: historyEntry.careInsuranceRate / 100,
      pensionRate: DEFAULT_PENSION_INSURANCE_RATE,
      applicableMonth: historyEntry.applicableMonth,
    };
    console.log('[Debug] 4. 最終的に計算に使用される料率:', finalRate);

    return {
      healthRate: finalRate.healthRate,
      longTermCareRate: finalRate.longTermCareRate,
      pensionRate: DEFAULT_PENSION_INSURANCE_RATE,
    };
  }

  if (prefecture) {
    const masterRates = resolveCompanyInsuranceRatesForPrefecture(prefecture, targetDate);
    const finalRate = {
      source: 'prefecture_master',
      healthInsuranceRatePercent: masterRates.healthInsuranceRate,
      longTermCareInsuranceRatePercent: masterRates.longTermCareInsuranceRate,
      healthRate: masterRates.healthInsuranceRate / 100,
      longTermCareRate: masterRates.longTermCareInsuranceRate / 100,
      pensionRate: DEFAULT_PENSION_INSURANCE_RATE,
      targetDate,
    };
    console.log('[Debug] 4. 最終的に計算に使用される料率:', finalRate);

    return {
      healthRate: finalRate.healthRate,
      longTermCareRate: finalRate.longTermCareRate,
      pensionRate: DEFAULT_PENSION_INSURANCE_RATE,
    };
  }

  if (company?.healthInsuranceRate != null && company.longTermCareInsuranceRate != null) {
    const finalRate = {
      source: 'company_document_fallback',
      healthInsuranceRatePercent: company.healthInsuranceRate,
      longTermCareInsuranceRatePercent: company.longTermCareInsuranceRate,
      healthRate: company.healthInsuranceRate / 100,
      longTermCareRate: company.longTermCareInsuranceRate / 100,
      pensionRate: DEFAULT_PENSION_INSURANCE_RATE,
    };
    console.log('[Debug] 4. 最終的に計算に使用される料率:', finalRate);

    return {
      healthRate: finalRate.healthRate,
      longTermCareRate: finalRate.longTermCareRate,
      pensionRate: DEFAULT_PENSION_INSURANCE_RATE,
    };
  }

  const finalRate = {
    source: 'zero_fallback',
    healthInsuranceRatePercent: 0,
    longTermCareInsuranceRatePercent: 0,
    healthRate: 0,
    longTermCareRate: 0,
    pensionRate: DEFAULT_PENSION_INSURANCE_RATE,
  };
  console.warn('[Debug] 4. 最終的に計算に使用される料率（料率未取得）:', finalRate);

  return {
    healthRate: 0,
    longTermCareRate: 0,
    pensionRate: DEFAULT_PENSION_INSURANCE_RATE,
  };
}

/**
 * 従業員一覧の社会保険料目安額用。
 * 令和8年度の都道府県別マスター料率を直接参照する。
 */
export function resolveEmployeeListInsuranceRates(
  company: CompanySettings | null
): InsuranceRateSettings {
  const prefecture = company?.prefecture?.trim() ?? '';
  const healthPercent =
    getReiwa8HealthInsuranceRate(prefecture) ?? DEFAULT_HEALTH_INSURANCE_RATE_PERCENT;

  return {
    healthRate: healthPercent / 100,
    longTermCareRate: getCurrentCareInsuranceRate() / 100,
    pensionRate: DEFAULT_PENSION_INSURANCE_RATE,
  };
}

/** @deprecated 用途に応じて resolvePayrollInsuranceRates / resolveEmployeeListInsuranceRates を使用 */
export function resolveCompanyInsuranceRates(
  company: CompanySettings | null,
  targetDate: Date | string
): InsuranceRateSettings {
  return resolvePayrollInsuranceRates(company, targetDate);
}

export function resolvePensionBonusStandard(
  standardBonusAmount: number,
  existingSameMonthStandardBonusTotal = 0
): number {
  const normalized = Math.max(0, Math.floor(standardBonusAmount));
  const existingTotal = Math.max(0, Math.floor(existingSameMonthStandardBonusTotal));
  const remainingCap = Math.max(0, PENSION_BONUS_STANDARD_CAP - existingTotal);
  return Math.min(normalized, remainingCap);
}

export function resolveHealthLongTermCareBonusStandard(
  standardBonusAmount: number,
  pastFiscalStandardBonusTotal: number
): number {
  const pastTotal = Number.isFinite(pastFiscalStandardBonusTotal)
    ? Math.max(0, pastFiscalStandardBonusTotal)
    : 0;
  const normalizedStandard = calculateStandardBonusAmount(standardBonusAmount);
  const remaining = HEALTH_LTC_BONUS_FISCAL_CAP - pastTotal;
  if (remaining <= 0) {
    return 0;
  }

  return Math.min(normalizedStandard, remaining);
}

export function resolveEntryStandardBonusAmount(entry: CompensationEntry): number {
  const fromStandard = Number(entry.standardBonusAmount);
  if (entry.standardBonusAmount != null && Number.isFinite(fromStandard)) {
    return Math.max(0, Math.round(fromStandard));
  }

  return calculateStandardBonusAmount(
    entry.bonusAmount ?? calculateBonusEntryAmount(entry.fixedWages ?? 0, entry.nonFixedWages ?? 0)
  );
}

export function getSameMonthExistingStandardBonusTotal(
  employeeId: string,
  targetMonth: string,
  bonusRecordsByMonth: Map<string, CompensationRecord>,
  currentPaymentDate?: string
): number {
  const normalizedTargetMonth = targetMonth.trim();
  if (!normalizedTargetMonth) {
    return 0;
  }

  const record = bonusRecordsByMonth.get(normalizedTargetMonth);
  if (!record) {
    return 0;
  }

  return getSameMonthExistingStandardBonusTotalFromRecord(
    employeeId,
    record,
    currentPaymentDate
  );
}

export function getSameMonthExistingStandardBonusTotalFromRecord(
  employeeId: string,
  record: CompensationRecord | null | undefined,
  currentPaymentDate?: string
): number {
  if (!record) {
    return 0;
  }

  return record.entries.reduce((total, entry) => {
    if (entry.employeeId !== employeeId || !entry.locked) {
      return total;
    }

    const entryPaymentDate = normalizeBonusEntryPaymentDate(entry.paymentDate);
    if (!isSameMonthPriorBonusEntry(entryPaymentDate, currentPaymentDate)) {
      return total;
    }

    const standardAmount = resolveEntryStandardBonusAmount(entry);
    const nextTotal = total + standardAmount;
    return Number.isFinite(nextTotal) ? nextTotal : total;
  }, 0);
}

export function getPastFiscalStandardBonusTotal(
  employeeId: string,
  targetMonth: string,
  bonusRecordsByMonth: Map<string, CompensationRecord>,
  currentPaymentDate?: string
): number {
  const fiscalMonths = listFiscalYearMonthsUpTo(targetMonth);

  return fiscalMonths.reduce((total, yearMonth) => {
    const record = bonusRecordsByMonth.get(yearMonth);
    if (!record) {
      return total;
    }

    for (const entry of record.entries) {
      if (entry.employeeId !== employeeId || !entry.locked) {
        continue;
      }

      const entryPaymentDate = normalizeBonusEntryPaymentDate(entry.paymentDate);
      if (yearMonth === targetMonth) {
        if (!isSameMonthPriorBonusEntry(entryPaymentDate, currentPaymentDate)) {
          continue;
        }
      }

      const standardAmount = resolveEntryStandardBonusAmount(entry);
      const nextTotal = total + standardAmount;
      total = Number.isFinite(nextTotal) ? nextTotal : total;
    }

    return total;
  }, 0);
}

export function splitPremium(totalPremium: number): {
  employeeShare: number;
  employerShare: number;
  total: number;
} {
  const total = Math.floor(totalPremium);
  const employeeShare = roundEmployeeDeductionShare(total / 2);
  const employerShare = total - employeeShare;

  return { employeeShare, employerShare, total };
}

export function calculateBonusInsurancePremiums(
  bonusAmount: number,
  pastFiscalStandardBonusTotal: number,
  includeLongTermCare: boolean,
  rates: InsuranceRateSettings,
  existingSameMonthStandardBonusTotal = 0
): BonusInsuranceCalculationResult {
  const normalizedBonusAmount = normalizeNonNegativeAmount(bonusAmount);
  const pastTotal = Number.isFinite(pastFiscalStandardBonusTotal)
    ? Math.max(0, pastFiscalStandardBonusTotal)
    : 0;
  const standardBonusAmount = calculateStandardBonusAmount(normalizedBonusAmount);
  const pensionStandardBonus = resolvePensionBonusStandard(
    standardBonusAmount,
    existingSameMonthStandardBonusTotal
  );
  const healthStandardBonus = resolveHealthLongTermCareBonusStandard(
    standardBonusAmount,
    pastTotal
  );

  const health = healthStandardBonus > 0
    ? splitPremium(multiplyAmountByInsuranceRateDecimal(healthStandardBonus, rates.healthRate))
    : ZERO_SHARE;
  const longTermCare =
    includeLongTermCare && healthStandardBonus > 0
      ? splitPremium(
          multiplyAmountByInsuranceRateDecimal(healthStandardBonus, rates.longTermCareRate)
        )
      : ZERO_SHARE;
  const pension =
    pensionStandardBonus > 0
      ? splitPremium(multiplyAmountByInsuranceRateDecimal(pensionStandardBonus, rates.pensionRate))
      : ZERO_SHARE;

  return {
    bonusAmount: normalizedBonusAmount,
    standardBonusAmount,
    pensionStandardBonus,
    healthStandardBonus,
    pastFiscalStandardBonusTotal: pastTotal,
    premiums: { health, longTermCare, pension },
  };
}

export function normalizeBonusEntryPaymentDate(paymentDate?: string): string {
  const trimmed = paymentDate?.trim() ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

/** 支給日の昇順比較（ISO日付文字列） */
export function compareBonusPaymentDates(left: string, right: string): number {
  return normalizeBonusEntryPaymentDate(left).localeCompare(normalizeBonusEntryPaymentDate(right));
}

/**
 * 同月内の「既存支給額」に含めるべき過去賞与か。
 * currentPaymentDate 未指定時は同月の確定済み賞与をすべて合算（集計表示用）。
 */
export function isSameMonthPriorBonusEntry(
  entryPaymentDate: string,
  currentPaymentDate?: string
): boolean {
  const normalizedCurrent = normalizeBonusEntryPaymentDate(currentPaymentDate);
  const normalizedEntry = normalizeBonusEntryPaymentDate(entryPaymentDate);

  if (!normalizedCurrent) {
    return true;
  }

  if (!normalizedEntry) {
    return false;
  }

  return normalizedEntry < normalizedCurrent;
}

export function sortLockedBonusEntriesByPaymentDate(
  entries: CompensationEntry[]
): CompensationEntry[] {
  return [...entries].sort((left, right) => {
    const dateCompare = compareBonusPaymentDates(
      left.paymentDate ?? '',
      right.paymentDate ?? ''
    );
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return left.employeeId.localeCompare(right.employeeId);
  });
}

export function bonusEntryKey(employeeId: string, paymentDate: string): string {
  return `${employeeId}:${normalizeBonusEntryPaymentDate(paymentDate)}`;
}

export function findBonusEntryIndex(
  entries: CompensationEntry[],
  employeeId: string,
  paymentDate: string
): number {
  const normalizedPaymentDate = normalizeBonusEntryPaymentDate(paymentDate);
  return entries.findIndex(
    (row) =>
      row.employeeId === employeeId &&
      normalizeBonusEntryPaymentDate(row.paymentDate) === normalizedPaymentDate
  );
}

export function getLockedBonusEntries(
  record: CompensationRecord | null | undefined
): CompensationEntry[] {
  if (!record) {
    return [];
  }

  return record.entries.filter((entry) => entry.locked);
}

export function getLockedBonusEmployeeIds(record: CompensationRecord | null | undefined): Set<string> {
  return new Set(getLockedBonusEntries(record).map((entry) => entry.employeeId));
}
