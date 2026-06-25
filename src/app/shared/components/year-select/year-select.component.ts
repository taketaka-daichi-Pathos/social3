import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { buildYearSelectOptions } from '@shared/utils/year-select.utils';

@Component({
  selector: 'app-year-select',
  standalone: true,
  templateUrl: './year-select.component.html',
  styleUrl: './year-select.component.scss',
})
export class YearSelectComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly inputId = input('');
  readonly value = input.required<number>();
  readonly selectClass = input('');
  readonly valueChange = output<number>();

  readonly open = signal(false);
  readonly yearOptions = computed(() => buildYearSelectOptions(this.value()));

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  toggle(): void {
    const next = !this.open();
    this.open.set(next);

    if (next) {
      queueMicrotask(() => {
        const selected = (this.elementRef.nativeElement as HTMLElement).querySelector(
          '.year-select__option--selected'
        ) as HTMLElement | null;
        selected?.scrollIntoView({ block: 'nearest' });
      });
    }
  }

  selectYear(year: number): void {
    this.valueChange.emit(year);
    this.open.set(false);
  }
}
