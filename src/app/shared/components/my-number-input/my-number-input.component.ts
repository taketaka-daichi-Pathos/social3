import {
  Component,
  ElementRef,
  forwardRef,
  input,
  viewChildren,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { MY_NUMBER_DIGIT_COUNT } from '@features/onboarding/validators/employee-registration.validators';

@Component({
  selector: 'app-my-number-input',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './my-number-input.component.html',
  styleUrl: './my-number-input.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MyNumberInputComponent),
      multi: true,
    },
  ],
})
export class MyNumberInputComponent implements ControlValueAccessor {
  readonly invalid = input(false);
  readonly digitInputs = viewChildren<ElementRef<HTMLInputElement>>('digitInput');

  readonly digits = Array.from({ length: MY_NUMBER_DIGIT_COUNT }, () => '');

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  protected disabled = false;

  writeValue(value: string | null): void {
    const normalized = (value ?? '').replace(/\D/g, '').slice(0, MY_NUMBER_DIGIT_COUNT);

    for (let i = 0; i < MY_NUMBER_DIGIT_COUNT; i++) {
      this.digits[i] = normalized[i] ?? '';
    }
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

  onDigitInput(index: number, event: Event): void {
    if (this.disabled) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const digit = input.value.replace(/\D/g, '').slice(-1);
    this.digits[index] = digit;
    input.value = digit;

    this.emitValue();

    if (digit && index < MY_NUMBER_DIGIT_COUNT - 1) {
      this.focusDigit(index + 1);
    }
  }

  onDigitKeydown(index: number, event: KeyboardEvent): void {
    if (this.disabled) {
      return;
    }

    if (event.key === 'Backspace') {
      if (this.digits[index]) {
        this.digits[index] = '';
        (event.target as HTMLInputElement).value = '';
        this.emitValue();
        return;
      }

      if (index > 0) {
        event.preventDefault();
        this.focusDigit(index - 1);
      }
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focusDigit(index - 1);
      return;
    }

    if (event.key === 'ArrowRight' && index < MY_NUMBER_DIGIT_COUNT - 1) {
      event.preventDefault();
      this.focusDigit(index + 1);
    }
  }

  onDigitPaste(event: ClipboardEvent): void {
    if (this.disabled) {
      return;
    }

    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') ?? '';
    const normalized = pasted.replace(/\D/g, '').slice(0, MY_NUMBER_DIGIT_COUNT);

    for (let i = 0; i < MY_NUMBER_DIGIT_COUNT; i++) {
      this.digits[i] = normalized[i] ?? '';
    }

    this.emitValue();
    this.focusDigit(Math.min(normalized.length, MY_NUMBER_DIGIT_COUNT - 1));
  }

  onBlur(): void {
    this.onTouched();
  }

  private emitValue(): void {
    const raw = this.digits.join('');
    this.onChange(raw.length === MY_NUMBER_DIGIT_COUNT ? raw : '');
  }

  private focusDigit(index: number): void {
    const inputs = this.digitInputs();
    inputs[index]?.nativeElement.focus();
    inputs[index]?.nativeElement.select();
  }
}
