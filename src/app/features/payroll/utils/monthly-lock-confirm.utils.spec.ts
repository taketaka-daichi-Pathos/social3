import { buildMonthlyLockConfirmMessage } from '@features/payroll/utils/monthly-lock-confirm.utils';

describe('monthly-lock-confirm.utils', () => {
  it('builds lock confirmation without bonus wording', () => {
    const message = buildMonthlyLockConfirmMessage('2026-05');

    expect(message).toContain('月次給与データの登録・編集・保存');
    expect(message).not.toContain('賞与');
  });

  it('uses the same message for June', () => {
    const message = buildMonthlyLockConfirmMessage('2026-06');

    expect(message).toContain('月次給与データの登録・編集・保存');
    expect(message).not.toContain('賞与');
  });
});
