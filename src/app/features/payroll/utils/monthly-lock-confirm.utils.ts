import { formatTargetMonthLabel } from '@features/payroll/utils/compensation.utils';

export function buildMonthlyLockConfirmMessage(targetMonth: string): string {
  const label = formatTargetMonthLabel(targetMonth);

  return [
    `${label}の月次作業を確定します。よろしいですか？`,
    '',
    '確定すると、この月に対する以下の操作が【すべて登録・編集できなくなります】。',
    '',
    '・入社処理・退社処理の実行',
    '・産休・育休などの休業期間の登録・変更',
    '・月次給与および賞与データの登録・編集・保存',
    '',
    '本当に確定してよろしいですか？',
  ].join('\n');
}