import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
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

  readonly form = this.fb.group({
    adjustmentType: this.fb.control<PayrollAdjustmentType | null>(null),
    adjustmentAmount: this.fb.control(0, Validators.required),
    adjustmentTargetMonth: this.fb.control(''),
  });

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }

      const current = this.value();
      this.validationError.set('');
      this.form.patchValue({
        adjustmentType: current.adjustmentType,
        adjustmentAmount: current.adjustmentAmount,
        adjustmentTargetMonth: current.adjustmentTargetMonth,
      });
      this.selectedType.set(current.adjustmentType);
      this.syncAmountValidators(current.adjustmentType);
    });

    this.form.controls.adjustmentType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        this.selectedType.set(type);
        this.syncAmountValidators(type);
        this.validationError.set('');
      });
  }

  selectedOption() {
    return findPayrollAdjustmentOption(this.selectedType());
  }

  requiresTargetMonth(): boolean {
    return this.selectedOption()?.requiresTargetMonth ?? false;
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

  onConfirm(): void {
    this.validationError.set('');

    const raw = this.form.getRawValue();
    const amount = Number(raw.adjustmentAmount) || 0;
    const type = raw.adjustmentType;
    const targetMonth = String(raw.adjustmentTargetMonth ?? '').trim();

    if (amount === 0) {
      this.confirmed.emit({
        adjustmentAmount: 0,
        adjustmentType: null,
        adjustmentTargetMonth: '',
      });
      return;
    }

    if (!type) {
      this.validationError.set('調整の理由（種別）を選択してください。');
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

    if (option.requiresTargetMonth && !/^\d{4}-\d{2}$/.test(targetMonth)) {
      this.validationError.set('対象月を選択してください。');
      this.form.controls.adjustmentTargetMonth.markAsTouched();
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.confirmed.emit({
      adjustmentAmount: amount,
      adjustmentType: type,
      adjustmentTargetMonth: option.requiresTargetMonth ? targetMonth : '',
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
}
