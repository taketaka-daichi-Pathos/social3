import { Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  findPayrollAdjustmentOption,
  PAYROLL_ADJUSTMENT_TYPE_OPTIONS,
  PayrollAdjustmentFormValue,
  PayrollAdjustmentType,
} from '@features/payroll/models/payroll-adjustment.model';
import {
  compareYearMonths,
  roundPayrollYen,
  toYearMonthKey,
  validatePayrollAdjustmentTotal,
} from '@features/payroll/utils/compensation.utils';
import { normalizeYearMonthKey } from '@features/payroll/utils/system-operation-month.utils';

const MID_HIRE_REDUCTION_TYPE: PayrollAdjustmentType = 'mid_hire_reduction';

@Component({
  selector: 'app-payroll-adjustment-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './payroll-adjustment-modal.component.html',
  styleUrl: './payroll-adjustment-modal.component.scss',
})
export class PayrollAdjustmentModalComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = input(false);
  readonly employeeName = input('');
  /** 給与計算の対象月（YYYY-MM） */
  readonly targetMonth = input('');
  /** 従業員の入社日（YYYY-MM-DD） */
  readonly hireDate = input('');
  /** 調整前の給与総額（基本給＋手当＋非固定給） */
  readonly preAdjustmentTotal = input(0);
  readonly value = input<PayrollAdjustmentFormValue>({
    adjustmentAmount: 0,
    adjustmentType: null,
    adjustmentTargetMonth: '',
  });
  readonly confirmed = output<PayrollAdjustmentFormValue>();
  readonly closed = output<void>();

  readonly adjustmentTypeOptions = PAYROLL_ADJUSTMENT_TYPE_OPTIONS;
  readonly selectedType = signal<PayrollAdjustmentType | null>(null);
  readonly validationError = signal('');
  readonly totalFloorError = signal('');
  readonly isHireMonth = computed(() => {
    const hireMonth = toYearMonthKey(this.hireDate());
    const targetMonth =
      normalizeYearMonthKey(this.targetMonth()) ?? this.targetMonth().trim();

    if (!hireMonth || !targetMonth) {
      return false;
    }

    return compareYearMonths(hireMonth, targetMonth) === 0;
  });

  readonly form = this.fb.group({
    adjustmentType: this.fb.control<PayrollAdjustmentType | null>(null),
    adjustmentAmount: this.fb.control(0, Validators.required),
  });

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }

      const current = this.value();
      const mustClearMidHireReduction =
        !this.isHireMonth() && current.adjustmentType === MID_HIRE_REDUCTION_TYPE;
      const adjustmentType = mustClearMidHireReduction ? null : current.adjustmentType;
      const adjustmentAmount = mustClearMidHireReduction ? 0 : current.adjustmentAmount;

      this.validationError.set('');
      this.totalFloorError.set('');
      this.form.patchValue({
        adjustmentType,
        adjustmentAmount,
      });
      this.selectedType.set(adjustmentType);
      this.syncAmountValidators(adjustmentType);
      this.syncTotalFloorError(adjustmentAmount);
    });

    this.form.controls.adjustmentType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        this.selectedType.set(type);
        this.syncAmountValidators(type);
        this.validationError.set('');
        this.syncTotalFloorError(this.form.controls.adjustmentAmount.value);
      });

    this.form.controls.adjustmentAmount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((amount) => {
        this.syncTotalFloorError(amount);
      });
  }

  selectedOption() {
    return findPayrollAdjustmentOption(this.selectedType());
  }

  isMidHireReductionDisabled(option: (typeof PAYROLL_ADJUSTMENT_TYPE_OPTIONS)[number]): boolean {
    return option.value === MID_HIRE_REDUCTION_TYPE && !this.isHireMonth();
  }

  noteText(): string {
    return this.selectedOption()?.note ?? '';
  }

  amountMax(): number | null {
    return this.selectedOption()?.amountSign === 'negative' ? 0 : null;
  }

  amountMin(): number | null {
    return this.selectedOption()?.amountSign === 'positive' ? 0 : null;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('adjustment-modal')) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  hasBlockingError(): boolean {
    return Boolean(this.validationError() || this.totalFloorError());
  }

  onConfirm(): void {
    this.validationError.set('');

    const raw = this.form.getRawValue();
    const amount = roundPayrollYen(raw.adjustmentAmount);
    this.syncTotalFloorError(amount);
    const type = raw.adjustmentType;

    if (amount === 0) {
      this.confirmed.emit({
        adjustmentAmount: 0,
        adjustmentType: null,
        adjustmentTargetMonth: '',
      });
      return;
    }

    if (this.totalFloorError()) {
      this.form.controls.adjustmentAmount.markAsTouched();
      return;
    }

    if (!type) {
      this.validationError.set('調整の理由（種別）を選択してください。');
      this.form.controls.adjustmentType.markAsTouched();
      return;
    }

    if (type === MID_HIRE_REDUCTION_TYPE && !this.isHireMonth()) {
      this.validationError.set('中途入社で給与の減額は入社月のみ選択できます。');
      this.form.controls.adjustmentType.markAsTouched();
      return;
    }

    const option = findPayrollAdjustmentOption(type);
    if (!option) {
      this.validationError.set('調整の理由（種別）を選択してください。');
      return;
    }

    if (option.amountSign === 'negative' && amount > 0) {
      this.validationError.set('この種別ではマイナス金額のみ入力できます。');
      this.form.controls.adjustmentAmount.markAsTouched();
      return;
    }

    if (option.amountSign === 'positive' && amount < 0) {
      this.validationError.set('この種別ではプラス金額のみ入力できます。');
      this.form.controls.adjustmentAmount.markAsTouched();
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.confirmed.emit({
      adjustmentAmount: amount,
      adjustmentType: type,
      adjustmentTargetMonth: '',
    });
  }

  private syncAmountValidators(type: PayrollAdjustmentType | null): void {
    const amountControl = this.form.controls.adjustmentAmount;
    amountControl.clearValidators();
    amountControl.addValidators(Validators.required);

    const option = findPayrollAdjustmentOption(type);
    if (option?.amountSign === 'positive') {
      amountControl.addValidators(Validators.min(0));
    } else if (option?.amountSign === 'negative') {
      amountControl.addValidators(Validators.max(0));
    }

    amountControl.updateValueAndValidity({ emitEvent: false });
  }

  private syncTotalFloorError(amount: number): void {
    const normalizedAmount = Number(amount) || 0;
    if (normalizedAmount === 0) {
      this.totalFloorError.set('');
      return;
    }

    this.totalFloorError.set(
      validatePayrollAdjustmentTotal(this.preAdjustmentTotal(), normalizedAmount) ?? ''
    );
  }
}
