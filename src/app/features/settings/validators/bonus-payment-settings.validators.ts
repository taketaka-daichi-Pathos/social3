import { AbstractControl, FormArray, ValidationErrors, ValidatorFn } from '@angular/forms';
import {
  isBonusPaymentDateBeforeSystemStart,
  normalizeBonusPaymentSettingDate,
} from '@features/settings/utils/bonus-payment-settings.utils';

export const DUPLICATE_BONUS_PAYMENT_DATE_ERROR_MESSAGE =
  '※同一の支払年月日は登録できません';

/** 賞与支払日がシステム利用開始年月より前の場合は invalidDateBeforeStart エラーを返す */
export function bonusPaymentDateNotBeforeSystemStartValidator(
  getSystemStartDate: () => string
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const paymentDate = normalizeBonusPaymentSettingDate(String(control.value ?? '').trim());
    if (!paymentDate) {
      return null;
    }

    return isBonusPaymentDateBeforeSystemStart(paymentDate, getSystemStartDate())
      ? { invalidDateBeforeStart: true }
      : null;
  };
}

/** 他行と支払年月日が重複している場合は duplicatePaymentDate エラーを返す */
export function bonusPaymentDateDuplicateValidator(
  getSettingsArray: () => FormArray,
  getCurrentRowId: () => string
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const paymentDate = normalizeBonusPaymentSettingDate(String(control.value ?? '').trim());
    if (!paymentDate) {
      return null;
    }

    const currentRowId = getCurrentRowId().trim();
    const hasDuplicate = getSettingsArray().controls.some((group) => {
      const rowId = String(group.get('id')?.value ?? '').trim();
      if (!rowId || rowId === currentRowId) {
        return false;
      }

      const otherDate = normalizeBonusPaymentSettingDate(
        String(group.get('paymentDate')?.value ?? '').trim()
      );
      return otherDate === paymentDate;
    });

    return hasDuplicate ? { duplicatePaymentDate: true } : null;
  };
}
