import { DecimalPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { EmployeeInsuranceSummary } from '@core/models/social-insurance.model';
import { Employee } from '@features/employees/models/employee.model';
import {
  formatGradeLabel,
  formatMyNumber,
  getPremiumTotals,
} from '@features/employees/utils/employee-display.utils';
import { formatTargetMonthLabel } from '@features/payroll/utils/compensation.utils';

@Component({
  selector: 'app-employee-detail-modal',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './employee-detail-modal.component.html',
  styleUrl: './employee-detail-modal.component.scss',
})
export class EmployeeDetailModalComponent {
  readonly open = input(false);
  readonly employee = input<Employee | null>(null);
  readonly summary = input<EmployeeInsuranceSummary | null>(null);
  readonly closed = output<void>();

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('detail-modal')) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  fullName(employee: Employee): string {
    return `${employee.lastName} ${employee.firstName}`;
  }

  fullNameKana(employee: Employee): string {
    return `${employee.lastNameKana} ${employee.firstNameKana}`;
  }

  genderLabel(gender: Employee['gender']): string {
    return gender === 'female' ? '女性' : '男性';
  }

  registrationTypeLabel(type: Employee['registrationType']): string {
    return type === 'existing' ? '既存の社員' : '新入社員';
  }

  dependentsLabel(hasDependents: boolean): string {
    return hasDependents ? 'あり' : 'なし';
  }

  gradeLabel(summary: EmployeeInsuranceSummary): string {
    return formatGradeLabel(summary);
  }

  premiumTotals(summary: EmployeeInsuranceSummary) {
    return getPremiumTotals(summary);
  }

  myNumberLabel(employee: Employee): string {
    return formatMyNumber(employee.myNumber);
  }

  hasAllowances(employee: Employee): boolean {
    return employee.allowances.length > 0;
  }

  hasPayrollHistory(employee: Employee): boolean {
    return Boolean(employee.applicableStartMonth?.trim());
  }

  formatYearMonth(yearMonth: string): string {
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return '—';
    }

    return formatTargetMonthLabel(yearMonth);
  }
}
