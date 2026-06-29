import { Component, input, output, signal } from '@angular/core';
import { EmployeeSession } from '@core/services/employee-session.service';
import { AddressChangeApplicationDialogComponent } from '@features/employee-portal/components/address-change-application-dialog/address-change-application-dialog.component';
import { BankAccountApplicationDialogComponent } from '@features/employee-portal/components/bank-account-application-dialog/bank-account-application-dialog.component';
import { CommuteChangeApplicationDialogComponent } from '@features/employee-portal/components/commute-change-application-dialog/commute-change-application-dialog.component';
import { DependentApplicationDialogComponent } from '@features/employee-portal/components/dependent-application-dialog/dependent-application-dialog.component';
import { LeaveApplicationDialogComponent } from '@features/employee-portal/components/leave-application-dialog/leave-application-dialog.component';

type ApplicationDialogType =
  | 'leave'
  | 'dependent'
  | 'address_change'
  | 'commute_change'
  | 'bank_account';

type WorkflowMenuIcon = 'leave' | 'dependent' | 'address' | 'commute' | 'bank';

interface WorkflowMenuItem {
  id: ApplicationDialogType;
  title: string;
  description: string;
  icon: WorkflowMenuIcon;
}

@Component({
  selector: 'app-employee-workflow-request-forms',
  standalone: true,
  imports: [
    LeaveApplicationDialogComponent,
    DependentApplicationDialogComponent,
    AddressChangeApplicationDialogComponent,
    CommuteChangeApplicationDialogComponent,
    BankAccountApplicationDialogComponent,
  ],
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
    {
      id: 'address_change',
      title: '住所変更申請',
      description: '引越しなどで住所が変わった際はこちら',
      icon: 'address',
    },
    {
      id: 'commute_change',
      title: '通勤交通費（定期代）変更申請',
      description: '通勤経路や定期代が変わった際はこちら',
      icon: 'commute',
    },
    {
      id: 'bank_account',
      title: '給与振込口座の登録・変更',
      description: '給与の振込先口座を登録・変更します',
      icon: 'bank',
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
