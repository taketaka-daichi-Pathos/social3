export type PayrollAdjustmentType =
  | 'mid_hire_reduction'
  | 'absence_reduction'
  | 'delayed_raise_delta'
  | 'delayed_unpaid';

export interface PayrollAdjustmentFormValue {
  adjustmentAmount: number;
  adjustmentType: PayrollAdjustmentType | null;
  adjustmentTargetMonth: string;
}

export const PAYROLL_ADJUSTMENT_TYPE_OPTIONS: ReadonlyArray<{
  value: PayrollAdjustmentType;
  label: string;
  note: string;
  requiresTargetMonth: boolean;
  amountSign: 'negative' | 'positive';
}> = [
  {
    value: 'mid_hire_reduction',
    label: '中途入社で給与の減額',
    note: '※この月は算定基礎の対象外となり、除外して平均計算されます。',
    requiresTargetMonth: false,
    amountSign: 'negative',
  },
  {
    value: 'absence_reduction',
    label: '欠勤等による減額',
    note: '※基礎日数が17日以上あれば、減額された総支給額のまま算定基礎の対象月となります。',
    requiresTargetMonth: false,
    amountSign: 'negative',
  },
  {
    value: 'delayed_raise_delta',
    label: '遅配（昇給差額分）',
    note: '※総支給額は増加しますが、増額分は算定基礎の対象額から減額（控除）されて計算されます。',
    requiresTargetMonth: false,
    amountSign: 'positive',
  },
  {
    value: 'delayed_unpaid',
    label: '遅配（未払い）',
    note: '※この月に追加支給された未払い分は、算定基礎および随時改定の計算用報酬額からマイナス（除外）して計算されます。',
    requiresTargetMonth: false,
    amountSign: 'negative',
  },
];

const PAYROLL_ADJUSTMENT_TYPES = new Set<string>(
  PAYROLL_ADJUSTMENT_TYPE_OPTIONS.map((option) => option.value)
);

export function normalizePayrollAdjustmentType(value: unknown): PayrollAdjustmentType | null {
  const normalized = String(value ?? '').trim();
  return PAYROLL_ADJUSTMENT_TYPES.has(normalized)
    ? (normalized as PayrollAdjustmentType)
    : null;
}

export function findPayrollAdjustmentOption(type: PayrollAdjustmentType | null) {
  return PAYROLL_ADJUSTMENT_TYPE_OPTIONS.find((option) => option.value === type) ?? null;
}
