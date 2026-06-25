import { Component, effect, inject, input, output } from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { PayrollAllowanceEntry } from '@features/payroll/models/compensation.model';

export interface PayrollBreakdownValue {
  baseSalary: number;
  allowances: PayrollAllowanceEntry[];
}

type AllowanceFormGroup = FormGroup<{
  name: FormControl<string>;
  amount: FormControl<number>;
}>;

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
  readonly confirmed = output<PayrollBreakdownValue>();
  readonly closed = output<void>();

  readonly form = this.fb.group({
    baseSalary: this.fb.control(0, Validators.min(0)),
    allowances: this.fb.array<AllowanceFormGroup>([]),
  });

  constructor() {
    effect(() => {
      if (!this.open() || !this.value()) {
        return;
      }

      this.patchForm(this.value()!);
    });
  }

  get allowances(): FormArray<AllowanceFormGroup> {
    return this.form.controls.allowances;
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    this.confirmed.emit({
      baseSalary: raw.baseSalary,
      allowances: raw.allowances.map((row) => ({
        name: row.name,
        amount: row.amount,
      })),
    });
  }

  private patchForm(value: PayrollBreakdownValue): void {
    this.allowances.clear();

    for (const row of value.allowances) {
      this.allowances.push(
        this.fb.group({
          name: row.name,
          amount: this.fb.control(row.amount, Validators.min(0)),
        })
      );
    }

    this.form.patchValue({ baseSalary: value.baseSalary });
  }
}
