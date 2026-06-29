import { Component, effect, inject, input, output } from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { toHalfWidthDigits } from '@core/utils/text-normalize.utils';
import { PayrollAllowanceEntry } from '@features/payroll/models/compensation.model';
import { MONTHLY_LOCK_ERROR_MESSAGE } from '@features/payroll/utils/monthly-lock.utils';
import { roundNonNegativePayrollYen } from '@features/payroll/utils/compensation.utils';

export interface PayrollBreakdownValue {
  baseSalary: number;
  allowances: PayrollAllowanceEntry[];
}

type AllowanceFormGroup = FormGroup<{
  name: FormControl<string>;
  amount: FormControl<string>;
}>;

const AMOUNT_VALIDATORS: ValidatorFn[] = [
  Validators.required,
  Validators.pattern('^[0-9]*$'),
];

@Component({
  selector: 'app-payroll-breakdown-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './payroll-breakdown-modal.component.html',
  styleUrl: './payroll-breakdown-modal.component.scss',
})
export class PayrollBreakdownModalComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = input(false);
  readonly employeeName = input('');
  readonly value = input<PayrollBreakdownValue | null>(null);
  readonly saving = input(false);
  readonly error = input('');
  /** 親画面の対象月が月次確定済みか */
  readonly isMonthFinalized = input(false);
  readonly confirmed = output<PayrollBreakdownValue>();
  readonly closed = output<void>();

  readonly monthFinalizedMessage = MONTHLY_LOCK_ERROR_MESSAGE;

  readonly form = this.fb.group({
    baseSalary: this.fb.control('', AMOUNT_VALIDATORS),
    allowances: this.fb.array<AllowanceFormGroup>([]),
  });

  constructor() {
    effect(() => {
      if (!this.open() || !this.value()) {
        return;
      }

      this.patchForm(this.value()!);
      this.syncFormEditableState();
    });

    effect(() => {
      this.isMonthFinalized();
      this.saving();

      if (!this.open()) {
        return;
      }

      this.syncFormEditableState();
    });
  }

  get allowances(): FormArray<AllowanceFormGroup> {
    return this.form.controls.allowances;
  }

  onInputNumber(event: Event, controlName: 'baseSalary'): void;
  onInputNumber(event: Event, controlName: 'amount', allowanceIndex: number): void;
  onInputNumber(event: Event, controlName: string, allowanceIndex?: number): void {
    if (event.type === 'input' && event instanceof InputEvent && event.isComposing) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const cleanValue = toHalfWidthDigits(input.value);

    const control = this.resolveAmountControl(controlName, allowanceIndex);
    if (!control) {
      return;
    }

    if (control.value === cleanValue) {
      return;
    }

    control.setValue(cleanValue, { emitEvent: false });
  }

  private resolveAmountControl(
    controlName: string,
    allowanceIndex?: number
  ): FormControl<string> | null {
    if (controlName === 'baseSalary') {
      return this.form.controls.baseSalary;
    }

    if (controlName === 'amount' && allowanceIndex != null) {
      return this.allowances.at(allowanceIndex)?.controls.amount ?? null;
    }

    return null;
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.saving()) {
      return;
    }

    if ((event.target as HTMLElement).classList.contains('breakdown-modal')) {
      this.close();
    }
  }

  close(): void {
    if (this.saving()) {
      return;
    }

    this.closed.emit();
  }

  onConfirm(): void {
    if (this.isMonthFinalized() || this.saving()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    this.confirmed.emit({
      baseSalary: roundNonNegativePayrollYen(raw.baseSalary) || 0,
      allowances: raw.allowances.map((row) => ({
        name: row.name,
        amount: roundNonNegativePayrollYen(row.amount) || 0,
      })),
    });
  }

  private syncFormEditableState(): void {
    if (this.isMonthFinalized() || this.saving()) {
      this.form.disable({ emitEvent: false });
      return;
    }

    this.form.enable({ emitEvent: false });
  }

  private patchForm(value: PayrollBreakdownValue): void {
    this.allowances.clear();

    for (const row of value.allowances) {
      this.allowances.push(
        this.fb.group({
          name: row.name,
          amount: this.fb.control(String(row.amount), AMOUNT_VALIDATORS),
        })
      );
    }

    this.form.patchValue({ baseSalary: String(value.baseSalary) }, { emitEvent: false });
  }
}
