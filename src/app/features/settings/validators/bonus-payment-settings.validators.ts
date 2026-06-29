import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import {
  isBonusPaymentDateBeforeSystemStart,
  normalizeBonusPaymentSettingDate,
} from '@features/settings/utils/bonus-payment-settings.utils';

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
