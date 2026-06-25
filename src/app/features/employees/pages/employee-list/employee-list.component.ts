import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EmployeeInsuranceSummary } from '@core/models/social-insurance.model';
import { EmployeeService } from '@core/services/employee.service';
import { SocialInsuranceCalculatorService } from '@core/services/social-insurance-calculator.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { EmployeeDetailModalComponent } from '@features/employees/components/employee-detail-modal/employee-detail-modal.component';
import {
  formatGradeLabel,
  getPremiumTotals,
} from '@features/employees/utils/employee-display.utils';
import { EmployeeRegistrationModalComponent } from '@features/onboarding/components/employee-registration-modal/employee-registration-modal.component';
import { EmployeeRegistrationFormData } from '@features/onboarding/models/employee-registration.model';
import { Employee, EmployeeListTab } from '../../models/employee.model';
import { groupEmployees } from '../../utils/employee-list.utils';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    EmployeeRegistrationModalComponent,
    EmployeeDetailModalComponent,
  ],
  templateUrl: './employee-list.component.html',
  styleUrl: './employee-list.component.scss',
})
export class EmployeeListComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly employeeService = inject(EmployeeService);
  private readonly insuranceCalculator = inject(SocialInsuranceCalculatorService);

  readonly employeeModalOpen = signal(false);
  readonly detailModalOpen = signal(false);
  readonly detailEmployee = signal<Employee | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly activeTab = signal<EmployeeListTab>('active');
  readonly employees = signal<Employee[]>([]);

  readonly groups = computed(() => groupEmployees(this.employees()));

  readonly detailSummary = computed(() => {
    const employee = this.detailEmployee();
    return employee ? this.getInsuranceSummary(employee) : null;
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
    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => {
          this.employees.set(employees);
          this.loadError.set(null);
          this.loading.set(false);
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
  }

  async onEmployeeRegistered(data: EmployeeRegistrationFormData): Promise<void> {
    try {
      this.saveError.set(null);
      await this.employeeService.createEmployee(data);
      this.employeeModalOpen.set(false);
    } catch (error) {
      console.error('[EmployeeList] 従業員の保存に失敗しました', error);
      this.saveError.set(
        toFirestoreErrorMessage(
          error,
          error instanceof Error ? error.message : '従業員の保存に失敗しました'
        )
      );
    }
  }

  setTab(tab: EmployeeListTab): void {
    this.activeTab.set(tab);
  }

  getInsuranceSummary(employee: Employee): EmployeeInsuranceSummary {
    return this.insuranceCalculator.calculateForEmployee(employee);
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
