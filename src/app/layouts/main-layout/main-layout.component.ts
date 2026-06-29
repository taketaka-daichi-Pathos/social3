import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { WorkflowRequestApprovalModalComponent } from '@features/workflow/components/workflow-request-approval-modal/workflow-request-approval-modal.component';
import { AppToastComponent } from '@shared/components/app-toast/app-toast.component';
import { GlobalNavComponent } from '@shared/components/global-nav/global-nav.component';
import { MainNavItem } from '@shared/models/nav.model';
import { HeaderComponent } from '../header/header.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    GlobalNavComponent,
    WorkflowRequestApprovalModalComponent,
    AppToastComponent,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  private readonly authService = inject(AuthService);

  readonly mainNavItems: MainNavItem[] = [
    { label: '従業員一覧', route: '/employees' },
    { label: '給与登録', route: '/payroll' },
    { label: '随時改定・算定基礎', route: '/revision' },
    { label: '法定帳票出力', route: '/statutory-reports', adminTodoTargetTab: 'legal-forms' },
    { label: '育休・産休', route: '/leave' },
    { label: '扶養', route: '/dependents' },
    { label: '退職', route: '/retirement' },
    { label: '会社設定', route: '/settings/company' },
  ];

  onLogout(): void {
    void this.authService.logout();
  }
}
