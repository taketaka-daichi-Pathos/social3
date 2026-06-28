import { Component, input } from '@angular/core';
import { LeaveType } from '@features/employees/models/leave-record.model';

@Component({
  selector: 'app-leave-status-badge',
  standalone: true,
  templateUrl: './leave-status-badge.component.html',
  styleUrl: './leave-status-badge.component.scss',
})
export class LeaveStatusBadgeComponent {
  readonly types = input<LeaveType[]>([]);
}
