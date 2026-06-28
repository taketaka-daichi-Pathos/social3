import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { AdminEmployeeLinkService } from '@core/services/admin-employee-link.service';

export type PortalMode = 'admin' | 'employee';

@Component({
  selector: 'app-portal-mode-switch',
  standalone: true,
  templateUrl: './portal-mode-switch.component.html',
  styleUrl: './portal-mode-switch.component.scss',
})
export class PortalModeSwitchComponent {
  readonly mode = input.required<PortalMode>();

  private readonly router = inject(Router);
  readonly linkService = inject(AdminEmployeeLinkService);

  constructor() {
    this.linkService.ensureWatching();
  }

  goToEmployeePortal(): void {
    void this.router.navigate(['/employee/dashboard']);
  }

  goToAdminPortal(): void {
    void this.router.navigate(['/employees']);
  }
}
