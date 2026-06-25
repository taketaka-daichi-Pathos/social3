import { Directive, HostListener, Input, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { toHalfWidthDigits } from '@core/utils/text-normalize.utils';

@Directive({
  selector: 'input[appHalfWidthDigitsOnly]',
  standalone: true,
})
export class HalfWidthDigitsOnlyDirective {
  private readonly ngControl = inject(NgControl, { optional: true, self: true });

  @Input() appHalfWidthDigitsOnlyMaxLength = 20;

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const normalized = toHalfWidthDigits(input.value).slice(0, this.appHalfWidthDigitsOnlyMaxLength);
    this.applyValue(normalized, input);
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') ?? '';
    const normalized = toHalfWidthDigits(pasted).slice(0, this.appHalfWidthDigitsOnlyMaxLength);
    this.applyValue(normalized, event.target as HTMLInputElement);
  }

  private applyValue(normalized: string, input: HTMLInputElement): void {
    if (this.ngControl?.control) {
      const current = String(this.ngControl.control.value ?? '');
      if (current !== normalized) {
        this.ngControl.control.setValue(normalized);
      }
      return;
    }

    if (input.value !== normalized) {
      input.value = normalized;
    }
  }
}
