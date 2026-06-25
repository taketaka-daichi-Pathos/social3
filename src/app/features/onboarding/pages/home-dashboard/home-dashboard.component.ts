import { Component } from '@angular/core';
import { ActionButtonConfig } from '@shared/models/nav.model';
import { OnboardingTask } from '@shared/models/task.model';
import { ActionButtonsComponent } from '../../components/action-buttons/action-buttons.component';
import { TaskTableComponent } from '../../components/task-table/task-table.component';

@Component({
  selector: 'app-home-dashboard',
  standalone: true,
  imports: [ActionButtonsComponent, TaskTableComponent],
  templateUrl: './home-dashboard.component.html',
  styleUrl: './home-dashboard.component.scss',
})
export class HomeDashboardComponent {
  readonly actionButtons: ActionButtonConfig[] = [
    { label: '手続きタスク一覧', icon: '📋', variant: 'outline' },
    { label: 'e-Gov 資格取得届 一括出力', icon: '📥', variant: 'danger' },
    { label: '提出済をマスターへ一括異動', icon: '🏆', variant: 'primary-dark' },
  ];

  readonly tasks: OnboardingTask[] = [
    {
      id: '1',
      email: 'dadada@test.com',
      progressStatus: 'waiting',
      progressLabel: '確認待ち',
      taskDescription: '提出あり。要確認・承認',
    },
    {
      id: '2',
      email: 'user02@example.com',
      progressStatus: 'in-progress',
      progressLabel: '入力中',
      taskDescription: '従業員がフォーム入力中',
    },
    {
      id: '3',
      email: 'user03@example.com',
      progressStatus: 'in-progress',
      progressLabel: '入力中',
      taskDescription: '従業員がフォーム入力中',
    },
  ];

  onActionClick(button: ActionButtonConfig): void {
    console.log('Action clicked:', button.label);
  }

  onEmailClick(task: OnboardingTask): void {
    console.log('Email clicked:', task.email);
  }
}
