import { Component, input, output } from '@angular/core';
import { StatusBadgeComponent, StatusBadgeVariant } from '@shared/components/status-badge/status-badge.component';
import { OnboardingTask } from '@shared/models/task.model';

@Component({
  selector: 'app-task-table',
  standalone: true,
  imports: [StatusBadgeComponent],
  templateUrl: './task-table.component.html',
  styleUrl: './task-table.component.scss',
})
export class TaskTableComponent {
  readonly tasks = input.required<OnboardingTask[]>();
  readonly emailClick = output<OnboardingTask>();

  statusIcon(status: OnboardingTask['progressStatus']): string {
    const icons: Record<OnboardingTask['progressStatus'], string> = {
      waiting: '✋',
      'in-progress': '✏️',
      completed: '✅',
      error: '⚠️',
    };
    return icons[status];
  }

  statusVariant(status: OnboardingTask['progressStatus']): StatusBadgeVariant {
    return status;
  }

  onEmailClick(task: OnboardingTask): void {
    this.emailClick.emit(task);
  }
}
