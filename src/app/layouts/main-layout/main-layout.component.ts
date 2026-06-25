import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { GlobalNavComponent } from '@shared/components/global-nav/global-nav.component';
import { MainNavItem } from '@shared/models/nav.model';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, GlobalNavComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  private readonly router = inject(Router);

  readonly mainNavItems: MainNavItem[] = [
    { label: '給与', route: '/payroll' },
    { label: '随時改定・算定基礎', route: '/revision' },
    { label: '従業員一覧', route: '/employees' },
    { label: '会社設定', route: '/settings/company' },
  ];

  onLogout(): void {
    this.router.navigate(['/login']);
  }
}