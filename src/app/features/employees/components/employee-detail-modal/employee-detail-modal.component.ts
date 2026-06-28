import { DecimalPipe, NgIf } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { EmployeeInsuranceSummary } from '@core/models/social-insurance.model';
import { Employee } from '@features/employees/models/employee.model';
import { Dependent } from '@features/dependents/models/dependent.model';
import {
  dependentFullName,
  dependentRelationshipLabel,
  dependentStatusLabel,
} from '@features/dependents/utils/dependent-display.utils';
import {
  formatGradeLabel,
  formatMyNumber,
  getPremiumTotals,
} from '@features/employees/utils/employee-display.utils';
import {
  formatGradeWithAmount,
  sortRevisionHistoryDesc,
} from '@features/revision/utils/revision-history.utils';
import { formatTargetMonthLabel, getCurrentYearMonthKey } from '@features/payroll/utils/compensation.utils';
import {
  debugLeaveRecordEvaluation,
  getLeavePeriodText,
  hasLeaveRecord,
  isSocialInsuranceExemptForMonth,
} from '@features/employees/utils/leave-record.utils';
import { LeaveCompactBadgeComponent } from '@shared/components/leave-compact-badge/leave-compact-badge.component';
import { emptyPremiumBreakdown } from '@features/payroll/utils/premium-merge.utils';
import { SocialInsurancePremiumBreakdown } from '@core/models/social-insurance.model';

@Component({
  selector: 'app-employee-detail-modal',
  standalone: true,
  imports: [DecimalPipe, NgIf, LeaveCompactBadgeComponent],
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

  dependents(employee: Employee): Dependent[] {
    return employee.dependents ?? [];
  }

  hasRegisteredDependents(employee: Employee): boolean {
    return this.dependents(employee).length > 0;
  }

  dependentName(dependent: Dependent): string {
    return dependentFullName(dependent);
  }

  relationshipLabel(dependent: Dependent): string {
    return dependentRelationshipLabel(dependent.relationship);
  }

  dependentStatus(dependent: Dependent): string {
    return dependentStatusLabel(dependent);
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

  revisionHistoryEntries(employee: Employee) {
    return sortRevisionHistoryDesc(employee.revisionHistory ?? []);
  }

  formatRevisionUpdatedAt(value: string): string {
    if (!value) {
      return '—';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('ja-JP');
  }

  formatHistoryGrade(grade: number, amount: number): string {
    return formatGradeWithAmount(grade, amount);
  }

  hasLeaveRecord(employee: Employee | null | undefined): boolean {
    const result = hasLeaveRecord(employee);
    this.logLeaveDebug(employee, result, 'hasLeaveRecord');
    return result;
  }

  getLeavePeriodText(employee: Employee | null | undefined): string {
    return getLeavePeriodText(employee);
  }

  private logLeaveDebug(
    employee: Employee | null | undefined,
    result: boolean,
    context: string
  ): void {
    if (!employee) {
      return;
    }

    const name = `${employee.lastName} ${employee.firstName}`;
    if (result || name.includes('ああ') || (employee.leaveRecords?.length ?? 0) > 0) {
      console.log(`[EmployeeDetailModal][${context}]`, {
        name,
        result,
        ...debugLeaveRecordEvaluation(employee),
      });
    }
  }

  currentTargetMonthLabel(): string {
    return formatTargetMonthLabel(getCurrentYearMonthKey());
  }

  isCurrentMonthExempt(employee: Employee): boolean {
    return isSocialInsuranceExemptForMonth(employee, getCurrentYearMonthKey());
  }

  displayPremiums(employee: Employee): SocialInsurancePremiumBreakdown | null {
    if (this.isCurrentMonthExempt(employee)) {
      return emptyPremiumBreakdown();
    }

    return this.summary()?.premiums ?? null;
  }
}
