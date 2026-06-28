import { Routes } from '@angular/router';

import { authGuard } from '@core/guards/auth.guard';

import { adminGuard, employeeGuard } from '@core/guards/role.guard';

import { AuthLayoutComponent } from '@layouts/auth-layout/auth-layout.component';

import { EmployeeLayoutComponent } from '@layouts/employee-layout/employee-layout.component';

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

    canActivate: [authGuard, adminGuard],

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

        path: 'statutory-reports',

        loadComponent: () =>

          import(

            '@features/statutory-reports/pages/statutory-reports/statutory-reports.component'

          ).then((m) => m.StatutoryReportsComponent),

      },

      {

        path: 'leave',

        loadComponent: () =>

          import('@features/leave/pages/leave-management/leave-management.component').then(

            (m) => m.LeaveManagementComponent

          ),

      },

      {

        path: 'dependents',

        loadComponent: () =>

          import('@features/dependents/pages/dependent-page/dependent-page.component').then(

            (m) => m.DependentPageComponent

          ),

      },

      {

        path: 'retirement',

        loadComponent: () =>

          import(

            '@features/retirement/pages/retirement-management/retirement-management.component'

          ).then((m) => m.RetirementManagementComponent),

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

  {

    path: 'employee',

    component: EmployeeLayoutComponent,

    canActivate: [authGuard, employeeGuard],

    children: [

      {

        path: 'dashboard',

        loadComponent: () =>

          import('@features/employee-portal/pages/employee-dashboard/employee-dashboard.component').then(

            (m) => m.EmployeeDashboardComponent

          ),

      },

      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

    ],

  },

];

