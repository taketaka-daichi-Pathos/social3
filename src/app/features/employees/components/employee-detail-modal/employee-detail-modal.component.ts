import { DecimalPipe, NgIf } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { EmployeeInsuranceSummary, SocialInsurancePremiumBreakdown } from '@core/models/social-insurance.model';
import { SocialInsuranceRevisionService } from '@core/services/social-insurance-revision.service';
import {
  displayBankAccountType,
  displayRegistrationPostalCode,
  displayRegistrationValue,
} from '@features/employee-portal/utils/employee-registration-display.utils';
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
import { RevisionHistoryEntry } from '@features/revision/models/revision-history.model';
import { formatTargetMonthLabel } from '@features/payroll/utils/compensation.utils';
import {
  debugLeaveRecordEvaluation,
  getLeavePeriodText,
  hasLeaveRecord,
  isSocialInsuranceExemptForMonth,
} from '@features/employees/utils/leave-record.utils';
import { LeaveCompactBadgeComponent } from '@shared/components/leave-compact-badge/leave-compact-badge.component';
import { emptyPremiumBreakdown } from '@features/payroll/utils/premium-merge.utils';
import { CompanySettings } from '@features/settings/models/company-settings.model';

@Component({
  selector: 'app-employee-detail-modal',
  standalone: true,
  imports: [DecimalPipe, NgIf, LeaveCompactBadgeComponent],
  templateUrl: './employee-detail-modal.component.html',
  styleUrl: './employee-detail-modal.component.scss',
})
export class EmployeeDetailModalComponent {
  private readonly revisionService = inject(SocialInsuranceRevisionService);

  readonly open = input(false);
  readonly employee = input<Employee | null>(null);
  readonly systemOperationMonth = input('');
  readonly companySettings = input<CompanySettings | null>(null);
  readonly closed = output<void>();

  /** 内訳表示・保険料計算の基準月（処理月、または選択した等級変更の適用月） */
  readonly displayMonth = signal('');

  readonly selectedRevisionEntryId = signal<string | null>(null);

  readonly displayMonthLabel = computed(() => {
    const month = this.displayMonth();
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return '—';
    }

    return formatTargetMonthLabel(month);
  });

  readonly isPreviewingRevisionMonth = computed(
    () =>
      this.selectedRevisionEntryId() != null &&
      this.displayMonth() !== this.systemOperationMonth().trim()
  );

  readonly insuranceDisplaySummary = computed((): EmployeeInsuranceSummary | null => {
    const employee = this.employee();
    const month = this.displayMonth().trim();
    if (!employee || !/^\d{4}-\d{2}$/.test(month)) {
      return null;
    }

    const { age, isLongTermCareInsured, premiums, effective } =
      this.revisionService.calculatePremiumsForEmployee(
        employee,
        month,
        this.companySettings()
      );

    return {
      age,
      isLongTermCareInsured,
      healthGrade:
        effective.healthGrade != null
          ? {
              grade: effective.healthGrade,
              standardMonthlyRemuneration: effective.healthStandard,
            }
          : null,
      pensionGrade:
        effective.pensionGrade != null
          ? {
              grade: effective.pensionGrade,
              standardMonthlyRemuneration: effective.pensionStandard,
            }
          : null,
      premiums,
    };
  });

  readonly isDisplayMonthExempt = computed(() => {
    const employee = this.employee();
    const month = this.displayMonth().trim();
    if (!employee || !month) {
      return false;
    }

    return isSocialInsuranceExemptForMonth(employee, month);
  });

  readonly displayPremiums = computed((): SocialInsurancePremiumBreakdown | null => {
    const employee = this.employee();
    if (!employee) {
      return null;
    }

    if (this.isDisplayMonthExempt()) {
      return emptyPremiumBreakdown();
    }

    return this.insuranceDisplaySummary()?.premiums ?? null;
  });

  constructor() {
    effect(() => {
      if (this.open() && this.employee()) {
        this.resetDisplayMonth();
      }
    });

    effect(() => {
      const operationMonth = this.systemOperationMonth().trim();
      if (
        this.open() &&
        this.selectedRevisionEntryId() == null &&
        /^\d{4}-\d{2}$/.test(operationMonth)
      ) {
        this.displayMonth.set(operationMonth);
      }
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('detail-modal')) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  selectRevisionEntry(entry: RevisionHistoryEntry): void {
    const month = entry.applicableMonth?.trim();
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return;
    }

    if (this.selectedRevisionEntryId() === entry.id) {
      this.resetDisplayMonth();
      return;
    }

    this.selectedRevisionEntryId.set(entry.id);
    this.displayMonth.set(month);
  }

  isRevisionEntrySelected(entryId: string): boolean {
    return this.selectedRevisionEntryId() === entryId;
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

  displayRegistrationField(value: string | null | undefined): string {
    return displayRegistrationValue(value);
  }

  displayPostalCode(value: string | null | undefined): string {
    return displayRegistrationPostalCode(value);
  }

  displayAccountType(value: string | null | undefined): string {
    return displayBankAccountType(value);
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

  private resetDisplayMonth(): void {
    const operationMonth = this.systemOperationMonth().trim();
    this.displayMonth.set(operationMonth);
    this.selectedRevisionEntryId.set(null);
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
}
