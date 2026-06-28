import { Component, inject } from '@angular/core';

import { Auth, signOut } from '@angular/fire/auth';

import { Router, RouterOutlet } from '@angular/router';

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

  private readonly auth = inject(Auth);

  private readonly router = inject(Router);



  async onLogout(): Promise<void> {

    await signOut(this.auth);

    await this.router.navigate(['/login']);

  }

}


