import { FormArray, FormControl, FormGroup } from '@angular/forms';
import {
  bonusPaymentDateDuplicateValidator,
  DUPLICATE_BONUS_PAYMENT_DATE_ERROR_MESSAGE,
} from '@features/settings/validators/bonus-payment-settings.validators';

describe('bonus-payment-settings.validators', () => {
  it('flags duplicate payment dates across rows', () => {
    const array = new FormArray([
      new FormGroup({
        id: new FormControl('row-a'),
        paymentDate: new FormControl('2026-04-01'),
      }),
      new FormGroup({
        id: new FormControl('row-b'),
        paymentDate: new FormControl('2026-04-01'),
      }),
    ]);

    const firstValidator = bonusPaymentDateDuplicateValidator(() => array, () => 'row-a');
    const secondValidator = bonusPaymentDateDuplicateValidator(() => array, () => 'row-b');

    expect(firstValidator(array.at(0).get('paymentDate')!)).toEqual({
      duplicatePaymentDate: true,
    });
    expect(secondValidator(array.at(1).get('paymentDate')!)).toEqual({
      duplicatePaymentDate: true,
    });
    expect(DUPLICATE_BONUS_PAYMENT_DATE_ERROR_MESSAGE).toBe('※同一の支払年月日は登録できません');
  });

  it('does not flag unique payment dates', () => {
    const array = new FormArray([
      new FormGroup({
        id: new FormControl('row-a'),
        paymentDate: new FormControl('2026-04-01'),
      }),
      new FormGroup({
        id: new FormControl('row-b'),
        paymentDate: new FormControl('2026-10-01'),
      }),
    ]);

    const validator = bonusPaymentDateDuplicateValidator(() => array, () => 'row-a');
    expect(validator(array.at(0).get('paymentDate')!)).toBeNull();
  });
});
