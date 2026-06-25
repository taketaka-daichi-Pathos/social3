import { Component, signal } from '@angular/core';
import { CompensationEntryTableComponent } from '@features/payroll/components/compensation-entry-table/compensation-entry-table.component';
import { MonthlyInsurancePremiumTableComponent } from '@features/payroll/components/monthly-insurance-premium-table/monthly-insurance-premium-table.component';
import { MonthlyPayrollTableComponent } from '@features/payroll/components/monthly-payroll-table/monthly-payroll-table.component';
import { SubNavComponent, SubNavItem } from '@shared/components/sub-nav/sub-nav.component';

@Component({
  selector: 'app-payroll-dashboard',
  standalone: true,
  imports: [
    SubNavComponent,
    MonthlyPayrollTableComponent,
    CompensationEntryTableComponent,
    MonthlyInsurancePremiumTableComponent,
  ],
  templateUrl: './payroll-dashboard.component.html',
  styleUrl: './payroll-dashboard.component.scss',
})
export class PayrollDashboardComponent {
  readonly subNavItems: SubNavItem[] = [
    { label: '月次給与', id: 'monthly' },
    { label: '賞与', id: 'bonus' },
    { label: '月次保険料', id: 'insurance' },
  ];

  readonly activeSubTab = signal('monthly');

  onSubNavSelect(item: SubNavItem): void {
    this.activeSubTab.set(item.id);
  }
}
