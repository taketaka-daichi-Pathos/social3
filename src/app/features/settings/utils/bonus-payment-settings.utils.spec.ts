import {
  filterBonusPaymentSettingsByYear,
  resolveBonusPaymentDateFromSelection,
  resolveBonusPaymentSelectionFromDate,
} from '@features/settings/utils/bonus-payment-settings.utils';
import { BonusPaymentSetting } from '@features/settings/models/company-settings.model';

const settings: BonusPaymentSetting[] = [
  { id: 'summer-2026', name: '夏季賞与', paymentDate: '2026-06-11' },
  { id: 'special-2027', name: '特別賞与', paymentDate: '2027-01-20' },
];

describe('bonus-payment-settings.utils', () => {
  it('filters bonus settings by payment year', () => {
    expect(filterBonusPaymentSettingsByYear(settings, '2026').map((row) => row.id)).toEqual([
      'summer-2026',
    ]);
    expect(filterBonusPaymentSettingsByYear(settings, '2027').map((row) => row.id)).toEqual([
      'special-2027',
    ]);
    expect(filterBonusPaymentSettingsByYear(settings, '2025')).toEqual([]);
  });

  it('resolves payment date only from year-matched setting', () => {
    expect(
      resolveBonusPaymentDateFromSelection('2027', 'special-2027', settings)
    ).toBe('2027-01-20');
    expect(
      resolveBonusPaymentDateFromSelection('2026', 'special-2027', settings)
    ).toBe('');
  });

  it('restores selection only from exact payment date match', () => {
    expect(resolveBonusPaymentSelectionFromDate('2027-01-20', settings)).toEqual({
      year: '2027',
      settingId: 'special-2027',
    });
    expect(resolveBonusPaymentSelectionFromDate('2026-01-20', settings)).toBeNull();
  });
});
