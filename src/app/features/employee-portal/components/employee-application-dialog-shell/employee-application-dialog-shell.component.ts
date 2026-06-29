import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-employee-application-dialog-shell',
  standalone: true,
  templateUrl: './employee-application-dialog-shell.component.html',
  styleUrl: './employee-application-dialog-shell.component.scss',
})
export class EmployeeApplicationDialogShellComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly description = input('');
  readonly dialogId = input('employee-application-dialog');
  readonly wide = input(false);

  readonly closed = output<void>();

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  close(): void {
    this.closed.emit();
  }
}
