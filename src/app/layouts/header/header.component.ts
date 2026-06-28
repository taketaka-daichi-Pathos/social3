import { Component, inject, output } from '@angular/core';
import { HeaderNotificationBellComponent } from './header-notification-bell.component';
import { PortalModeSwitchComponent } from '@shared/components/portal-mode-switch/portal-mode-switch.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [HeaderNotificationBellComponent, PortalModeSwitchComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly logout = output<void>();

  onLogout(): void {
    this.logout.emit();
  }
}
