import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { InsuranceRateHistoryEntry } from '@features/settings/models/insurance-rate-history.model';
import {
  isInsuranceRateHistoryLocked,
  normalizeYearMonthKey,
} from '@features/payroll/utils/system-operation-month.utils';import { isWithinStatutoryMasterManualEntryForbiddenPeriod } from '@features/settings/utils/statutory-insurance-rate-period.utils';

export interface DuplicateApplicableMonthValidatorContext {
  history: InsuranceRateHistoryEntry[];
  editingEntryId: string | null;
}

export interface LockedApplicableMonthValidatorContext {
  latestLockedMonth: string | null;
}

export interface StatutoryMasterPeriodValidatorContext {
  history: InsuranceRateHistoryEntry[];
  editingEntryId: string | null;
  systemStartDate: string;
  /** 適用開始月をユーザーが手動変更した場合 true */
  userEditedApplicableMonth: boolean;
}

/** 適用開始月が履歴に既に存在する場合は duplicateMonth エラーを返す（編集中の行は除外） */
export function duplicateApplicableMonthValidator(
  getContext: () => DuplicateApplicableMonthValidatorContext
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const normalizedMonth = String(control.value ?? '').trim();
    if (!normalizedMonth) {
      return null;
    }

    const { history, editingEntryId } = getContext();
    const isDuplicate = history.some(
      (entry) =>
        entry.applicableMonth.trim() === normalizedMonth && entry.id !== editingEntryId
    );

    return isDuplicate ? { duplicateMonth: true } : null;
  };
}

/** 適用開始月が確定済み月以前の場合は lockedApplicableMonth エラーを返す */
export function lockedApplicableMonthValidator(
  getContext: () => LockedApplicableMonthValidatorContext
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const normalizedMonth = String(control.value ?? '').trim();
    if (!normalizedMonth) {
      return null;
    }

    const { latestLockedMonth } = getContext();
    return isInsuranceRateHistoryLocked(normalizedMonth, latestLockedMonth)
      ? { lockedApplicableMonth: true }
      : null;
  };
}

/**
 * 法定マスター保持期間（2022-04〜2027-03）への手動追加を禁止する。
 * 初回 systemStartDate による自動セット、および同一月の履歴編集は除外する。
 */
export function statutoryMasterPeriodValidator(
  getContext: () => StatutoryMasterPeriodValidatorContext
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const normalizedMonth = normalizeYearMonthKey(String(control.value ?? ''));
    if (!normalizedMonth) {
      return null;
    }

    const { history, editingEntryId, systemStartDate, userEditedApplicableMonth } = getContext();
    const normalizedStart = normalizeYearMonthKey(systemStartDate);

    if (editingEntryId) {
      const editingEntry = history.find((entry) => entry.id === editingEntryId);
      if (
        editingEntry &&
        normalizeYearMonthKey(editingEntry.applicableMonth) === normalizedMonth
      ) {
        return null;
      }
    }

    if (
      !userEditedApplicableMonth &&
      history.length === 0 &&
      normalizedStart &&
      normalizedMonth === normalizedStart
    ) {
      return null;
    }

    return isWithinStatutoryMasterManualEntryForbiddenPeriod(normalizedMonth)
      ? { statutoryMasterPeriod: true }
      : null;
  };
}
