import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { AuthLayoutComponent } from '@layouts/auth-layout/auth-layout.component';
import { MainLayoutComponent } from '@layouts/main-layout/main-layout.component';
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: '',
    component: AuthLayoutComponent,
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('@features/auth/pages/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('@features/auth/pages/register-company/register-company.component').then(
            (m) => m.RegisterCompanyComponent
          ),
      },
    ],
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'onboarding',
        loadComponent: () =>
          import('@features/onboarding/pages/home-dashboard/home-dashboard.component').then(
            (m) => m.HomeDashboardComponent
          ),
      },
      {
        path: 'payroll',
        loadComponent: () =>
          import('@features/payroll/pages/payroll-dashboard/payroll-dashboard.component').then(
            (m) => m.PayrollDashboardComponent
          ),
      },
      {
        path: 'revision',
        loadComponent: () =>
          import('@features/revision/pages/revision-dashboard/revision-dashboard.component').then(
            (m) => m.RevisionDashboardComponent
          ),
      },
      {
        path: 'employees',
        loadComponent: () =>
          import('@features/employees/pages/employee-list/employee-list.component').then(
            (m) => m.EmployeeListComponent
          ),
      },
      {
        path: 'settings/company',
        loadComponent: () =>
          import('@features/settings/pages/company-settings/company-settings.component').then(
            (m) => m.CompanySettingsComponent
          ),
      },
    ],
  },
];
