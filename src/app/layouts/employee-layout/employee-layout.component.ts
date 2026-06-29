import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { PortalModeSwitchComponent } from '@shared/components/portal-mode-switch/portal-mode-switch.component';
import { AppToastComponent } from '@shared/components/app-toast/app-toast.component';
import { HeaderNotificationBellComponent } from '../header/header-notification-bell.component';

@Component({
  selector: 'app-employee-layout',
  standalone: true,
  imports: [RouterOutlet, PortalModeSwitchComponent, HeaderNotificationBellComponent, AppToastComponent],
  templateUrl: './employee-layout.component.html',
  styleUrl: './employee-layout.component.scss',
})
export class EmployeeLayoutComponent {
  private readonly authService = inject(AuthService);

  onLogout(): void {
    void this.authService.logout();
  }
}
