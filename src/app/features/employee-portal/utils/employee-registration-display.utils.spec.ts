import {
  displayBankAccountType,
  displayCommutePassAmount,
  displayMaskedAccountNumber,
  displayRegistrationPostalCode,
} from '@features/employee-portal/utils/employee-registration-display.utils';

describe('employee-registration-display.utils', () => {
  it('formats postal code with hyphen', () => {
    expect(displayRegistrationPostalCode('1000001')).toBe('100-0001');
  });

  it('masks account number showing last four digits', () => {
    expect(displayMaskedAccountNumber('1234567')).toBe('****4567');
  });

  it('maps bank account type labels', () => {
    expect(displayBankAccountType('ordinary')).toBe('普通');
    expect(displayBankAccountType('checking')).toBe('当座');
  });

  it('formats commute pass amount', () => {
    expect(displayCommutePassAmount(12500)).toBe('12,500円');
    expect(displayCommutePassAmount(null)).toBe('未登録');
  });
});
