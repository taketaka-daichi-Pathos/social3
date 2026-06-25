import { Component, input, output } from '@angular/core';
import { ActionButtonConfig } from '@shared/models/nav.model';

@Component({
  selector: 'app-action-buttons',
  standalone: true,
  templateUrl: './action-buttons.component.html',
  styleUrl: './action-buttons.component.scss',
})
export class ActionButtonsComponent {
  readonly buttons = input.required<ActionButtonConfig[]>();
  readonly buttonClick = output<ActionButtonConfig>();

  onButtonClick(button: ActionButtonConfig): void {
    this.buttonClick.emit(button);
  }
}
