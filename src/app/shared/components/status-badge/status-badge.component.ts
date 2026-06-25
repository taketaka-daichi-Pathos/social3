import { Component, input } from '@angular/core';

export type StatusBadgeVariant = 'waiting' | 'in-progress' | 'completed' | 'error' | 'neutral';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    <span class="badge" [class]="'badge--' + variant()">
      @if (icon()) {
        <span class="badge__icon" aria-hidden="true">{{ icon() }}</span>
      }
      <span class="badge__label">{{ label() }}</span>
    </span>
  `,
  styleUrl: './status-badge.component.scss',
})
export class StatusBadgeComponent {
  readonly label = input.required<string>();
  readonly variant = input<StatusBadgeVariant>('neutral');
  readonly icon = input<string>('');
}
