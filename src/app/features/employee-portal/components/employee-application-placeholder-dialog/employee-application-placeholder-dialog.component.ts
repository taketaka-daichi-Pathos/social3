import { Component, input, output } from '@angular/core';
import { EmployeeApplicationDialogShellComponent } from '@features/employee-portal/components/employee-application-dialog-shell/employee-application-dialog-shell.component';

@Component({
  selector: 'app-employee-application-placeholder-dialog',
  standalone: true,
  imports: [EmployeeApplicationDialogShellComponent],
  templateUrl: './employee-application-placeholder-dialog.component.html',
  styleUrl: './employee-application-placeholder-dialog.component.scss',
})
export class EmployeeApplicationPlaceholderDialogComponent {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly description = input('');
  readonly dialogId = input('employee-application-placeholder-dialog');

  readonly closed = output<void>();

  close(): void {
    this.closed.emit();
  }
}
