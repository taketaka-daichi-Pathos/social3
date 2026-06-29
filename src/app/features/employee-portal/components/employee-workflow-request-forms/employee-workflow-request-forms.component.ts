import { Component, input, output, signal } from '@angular/core';
import { EmployeeSession } from '@core/services/employee-session.service';
import { DependentApplicationDialogComponent } from '@features/employee-portal/components/dependent-application-dialog/dependent-application-dialog.component';
import { LeaveApplicationDialogComponent } from '@features/employee-portal/components/leave-application-dialog/leave-application-dialog.component';

type ApplicationDialogType = 'leave' | 'dependent';

type WorkflowMenuIcon = 'leave' | 'dependent';

interface WorkflowMenuItem {
  id: ApplicationDialogType;
  title: string;
  description: string;
  icon: WorkflowMenuIcon;
}

@Component({
  selector: 'app-employee-workflow-request-forms',
  standalone: true,
  imports: [LeaveApplicationDialogComponent, DependentApplicationDialogComponent],
  templateUrl: './employee-workflow-request-forms.component.html',
  styleUrl: './employee-workflow-request-forms.component.scss',
})
export class EmployeeWorkflowRequestFormsComponent {
  readonly session = input.required<EmployeeSession>();

  readonly submitted = output<void>();

  readonly activeDialog = signal<ApplicationDialogType | null>(null);

  readonly menuItems: WorkflowMenuItem[] = [
    {
      id: 'leave',
      title: '産休・育休申請',
      description: '休業の開始・終了予定日を申請',
      icon: 'leave',
    },
    {
      id: 'dependent',
      title: '扶養追加申請',
      description: '扶養家族の情報と証明書類を申請',
      icon: 'dependent',
    },
  ];

  openDialog(type: ApplicationDialogType): void {
    this.activeDialog.set(type);
  }

  closeDialog(): void {
    this.activeDialog.set(null);
  }

  onApplicationSubmitted(): void {
    this.submitted.emit();
  }
}
