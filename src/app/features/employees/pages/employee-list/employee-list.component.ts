import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { EmployeeInsuranceSummary } from '@core/models/social-insurance.model';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { CompanyService } from '@core/services/company.service';
import { EmployeeService } from '@core/services/employee.service';
import { SocialInsuranceRevisionService } from '@core/services/social-insurance-revision.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { EmployeeDetailModalComponent } from '@features/employees/components/employee-detail-modal/employee-detail-modal.component';
import {
  debugLeaveRecordEvaluation,
  hasLeaveRecord,
} from '@features/employees/utils/leave-record.utils';
import { LeaveCompactBadgeComponent } from '@shared/components/leave-compact-badge/leave-compact-badge.component';
import { RetiredEmployeeBadgeComponent } from '@shared/components/retired-employee-badge/retired-employee-badge.component';
import { SocialInsuranceTypeBadgeComponent } from '@shared/components/social-insurance-type-badge/social-insurance-type-badge.component';
import {
  formatGradeLabel,
  getPremiumTotals,
} from '@features/employees/utils/employee-display.utils';
import { EmployeeRegistrationModalComponent } from '@features/onboarding/components/employee-registration-modal/employee-registration-modal.component';
import { EmployeeRegistrationFormData } from '@features/onboarding/models/employee-registration.model';
import { getCurrentYearMonthKey, calculateEmployeeFixedWages, formatTargetMonthLabel } from '@features/payroll/utils/compensation.utils';
import { yearMonthKeyToReferenceDate } from '@features/payroll/utils/system-operation-month.utils';
import { CompanySettings } from '@features/settings/models/company-settings.model';
import { Employee, EmployeeListTab } from '../../models/employee.model';
import { groupEmployees, isEmployeeRetiredTab } from '../../utils/employee-list.utils';
import {
  filterEmployeesBySocialInsuranceCategory,
  SOCIAL_INSURANCE_CATEGORY_FILTER_OPTIONS,
  SocialInsuranceCategoryFilter,
} from '../../utils/social-insurance-type-filter.utils';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    EmployeeRegistrationModalComponent,
    EmployeeDetailModalComponent,
    LeaveCompactBadgeComponent,
    RetiredEmployeeBadgeComponent,
    SocialInsuranceTypeBadgeComponent,
  ],
  templateUrl: './employee-list.component.html',
  styleUrl: './employee-list.component.scss',
})
export class EmployeeListComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly employeeService = inject(EmployeeService);
  private readonly revisionService = inject(SocialInsuranceRevisionService);
  private readonly companyService = inject(CompanyService);
  private readonly monthlyLockService = inject(MonthlyLockService);

  readonly companySettings = signal<CompanySettings | null>(null);

  readonly employeeModalOpen = signal(false);
  readonly detailModalOpen = signal(false);
  readonly detailEmployee = signal<Employee | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly activeTab = signal<EmployeeListTab>('active');
  readonly employees = signal<Employee[]>([]);
  readonly currentMonthLocked = signal(false);
  readonly systemOperationMonth = signal(getCurrentYearMonthKey());
  readonly socialInsuranceFilter = signal<SocialInsuranceCategoryFilter>('all');

  readonly socialInsuranceFilterOptions = SOCIAL_INSURANCE_CATEGORY_FILTER_OPTIONS;

  readonly displayReferenceMonthLabel = computed(() =>
    formatTargetMonthLabel(this.systemOperationMonth())
  );

  readonly referenceDateForOperationMonth = computed(() =>
    yearMonthKeyToReferenceDate(this.systemOperationMonth())
  );

  readonly groups = computed(() =>
    groupEmployees(this.employees(), this.referenceDateForOperationMonth())
  );

  readonly displayedEmployees = computed(() => {
    const grouped = this.groups();
    const tab = this.activeTab();
    const filter = this.socialInsuranceFilter();

    let employees: Employee[];
    if (tab === 'pre') {
      employees = grouped.preEmployment;
    } else if (tab === 'retired') {
      employees = grouped.retired;
    } else {
      employees = grouped.active;
    }

    return filterEmployeesBySocialInsuranceCategory(employees, filter);
  });

  readonly tabCounts = computed(() => {
    const grouped = this.groups();

    return {
      pre: grouped.preEmployment.length,
      active: grouped.active.length,
      retired: grouped.retired.length,
    };
  });

  ngOnInit(): void {
    void this.initializeSystemOperationMonth();

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => {
          this.employees.set(employees);

          const currentDetail = this.detailEmployee();
          if (currentDetail) {
            const refreshed = employees.find((employee) => employee.id === currentDetail.id);
            if (refreshed) {
              this.detailEmployee.set(refreshed);
            }
          }

          this.openDetailFromQueryParam(employees);

          this.loadError.set(null);
          this.loading.set(false);
          this.debugLeaveRecords(employees);
        },
        error: (error) => {
          const message =
            error instanceof Error && error.message === 'ログインしていません'
              ? 'ログインしていません。再度ログインしてください。'
              : toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました');
          console.error('[EmployeeList] 従業員一覧の取得に失敗しました', error);
          this.loadError.set(message);
          this.employees.set([]);
          this.loading.set(false);
        },
      });
  }

  openEmployeeModal(): void {
    if (this.currentMonthLocked()) {
      this.saveError.set('当月は確定済みのため、新規従業員を追加できません。');
      return;
    }

    this.saveError.set(null);
    this.employeeModalOpen.set(true);
  }

  onEmployeeModalClosed(): void {
    this.employeeModalOpen.set(false);
  }

  openDetail(employee: Employee): void {
    this.detailEmployee.set(employee);
    this.detailModalOpen.set(true);
  }

  onDetailModalClosed(): void {
    this.detailModalOpen.set(false);
    this.detailEmployee.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { detail: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private openDetailFromQueryParam(employees: Employee[]): void {
    const employeeId = this.route.snapshot.queryParamMap.get('detail')?.trim();
    if (!employeeId) {
      return;
    }

    const employee = employees.find((row) => row.id === employeeId);
    if (!employee) {
      return;
    }

    if (this.detailModalOpen() && this.detailEmployee()?.id === employeeId) {
      return;
    }

    this.openDetail(employee);
  }

  onEmployeeRegistered(_data: EmployeeRegistrationFormData): void {
    this.employeeModalOpen.set(false);
  }

  setTab(tab: EmployeeListTab): void {
    this.activeTab.set(tab);
  }

  onSocialInsuranceFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SocialInsuranceCategoryFilter;
    this.socialInsuranceFilter.set(value);
  }

  isRetiredBadgeVisible(employee: Employee): boolean {
    return isEmployeeRetiredTab(employee, this.referenceDateForOperationMonth());
  }

  private async initializeSystemOperationMonth(): Promise<void> {
    try {
      const company = await this.companyService.getCompanyForCurrentUser();
      this.companySettings.set(company);

      const operationMonth = await this.monthlyLockService.resolveSystemOperationMonth({
        systemStartDate: company?.systemStartDate ?? null,
      });
      this.systemOperationMonth.set(operationMonth);
    } catch {
      this.systemOperationMonth.set(getCurrentYearMonthKey());
    }

    await this.refreshOperationMonthLock();
  }

  private async refreshOperationMonthLock(): Promise<void> {
    try {
      this.currentMonthLocked.set(
        await this.monthlyLockService.isMonthLocked(this.systemOperationMonth())
      );
    } catch {
      this.currentMonthLocked.set(false);
    }
  }

  fixedWagesAmount(employee: Employee): number {
    return calculateEmployeeFixedWages(employee);
  }

  getInsuranceSummary(employee: Employee): EmployeeInsuranceSummary {
    const targetMonth = this.systemOperationMonth();
    const { age, isLongTermCareInsured, premiums, effective } =
      this.revisionService.calculatePremiumsForEmployee(
        employee,
        targetMonth,
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
  }

  hasLeaveRecord(employee: Employee | null | undefined): boolean {
    const result = hasLeaveRecord(employee);
    this.logLeaveDebug(employee, result, 'hasLeaveRecord');
    return result;
  }

  private debugLeaveRecords(employees: Employee[]): void {
    for (const employee of employees) {
      const name = `${employee.lastName} ${employee.firstName}`;
      const debug = debugLeaveRecordEvaluation(employee);
      if (debug.show || name.includes('ああ') || debug.rawRecords.length > 0) {
        console.log('[EmployeeList] leaveRecords debug', { name, ...debug });
      }
    }
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
      console.log(`[EmployeeList][${context}]`, {
        name,
        result,
        ...debugLeaveRecordEvaluation(employee),
      });
    }
  }

  fullName(employee: Employee): string {
    return `${employee.lastName} ${employee.firstName}`;
  }

  gradeLabel(summary: EmployeeInsuranceSummary): string {
    return formatGradeLabel(summary);
  }

  premiumTotals(summary: EmployeeInsuranceSummary) {
    return getPremiumTotals(summary);
  }
}
