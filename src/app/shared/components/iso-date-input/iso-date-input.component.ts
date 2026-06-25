import { Component, forwardRef, input, signal } from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { formatIsoDateInput } from '@core/utils/text-normalize.utils';

@Component({
  selector: 'app-iso-date-input',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './iso-date-input.component.html',
  styleUrl: './iso-date-input.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => IsoDateInputComponent),
      multi: true,
    },
  ],
})
export class IsoDateInputComponent implements ControlValueAccessor {
  readonly invalid = input(false);
  readonly inputId = input('');
  readonly placeholder = input('1990-01-15');

  protected readonly displayValue = signal('');
  protected disabled = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.displayValue.set(value ? formatIsoDateInput(value) : '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event): void {
    if (this.disabled) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const formatted = formatIsoDateInput(input.value);
    input.value = formatted;
    this.displayValue.set(formatted);
    this.onChange(formatted);
  }

  onPaste(event: ClipboardEvent): void {
    if (this.disabled) {
      return;
    }

    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') ?? '';
    const formatted = formatIsoDateInput(pasted);
    const input = event.target as HTMLInputElement;
    input.value = formatted;
    this.displayValue.set(formatted);
    this.onChange(formatted);
  }

  onBlur(): void {
    this.onTouched();
  }
}
