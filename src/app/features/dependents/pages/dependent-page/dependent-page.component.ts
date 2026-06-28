import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { EmployeeService } from '@core/services/employee.service';
import { EmployeeTaskService } from '@core/services/employee-task.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { AddDependentModalComponent } from '@features/dependents/components/add-dependent-modal/add-dependent-modal.component';
import { Dependent } from '@features/dependents/models/dependent.model';
import { DEPENDENT_INFO_REQUEST_FIELDS } from '@features/dependents/utils/dependent-task.utils';
import {
  dependentFullName,
  dependentLivingArrangementLabel,
  dependentOccupationLabel,
  dependentRelationshipLabel,
  dependentSituationLabel,
  dependentStatusLabel,
  listDependentRowsForEmployee,
} from '@features/dependents/utils/dependent-display.utils';
import { EmployeeTask } from '@features/employee-portal/models/employee-task.model';
import { Employee } from '@features/employees/models/employee.model';
import { sortEmployeesByNumber } from '@features/employees/utils/employee-list.utils';

@Component({
  selector: 'app-dependent-page',
  standalone: true,
  imports: [ReactiveFormsModule, AddDependentModalComponent],
  templateUrl: './dependent-page.component.html',
  styleUrl: './dependent-page.component.scss',
})
export class DependentPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly employeeService = inject(EmployeeService);
  private readonly employeeTaskService = inject(EmployeeTaskService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly saveSuccess = signal<string | null>(null);
  readonly saving = signal(false);
  readonly employees = signal<Employee[]>([]);
  readonly addModalOpen = signal(false);
  readonly modalDraftDependent = signal<Dependent | null>(null);
  readonly employeeTasks = signal<EmployeeTask[]>([]);
  readonly requestingSubmission = signal(false);
  readonly requestSuccess = signal<string | null>(null);

  readonly employeeIdControl = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });

  readonly selectedEmployeeId = signal('');

  readonly employeeOptions = computed(() => sortEmployeesByNumber(this.employees()));

  readonly selectedEmployee = computed(() => {
    const employeeId = this.selectedEmployeeId();
    return this.employees().find((employee) => employee.id === employeeId);
  });

  readonly dependentRows = computed(() => {
    const employee = this.selectedEmployee();
    if (!employee) {
      return [];
    }

    return listDependentRowsForEmployee(
      employee.id,
      employee.employeeNumber,
      `${employee.lastName} ${employee.firstName}`,
      employee.dependents
    );
  });

  readonly hasPendingDependentSubmission = computed(() => {
    const employee = this.selectedEmployee();
    return employee?.pendingDependentSubmission != null;
  });

  readonly hasPendingDependentInfoRequest = computed(() => {
    const employeeId = this.selectedEmployeeId();
    if (!employeeId) {
      return false;
    }

    return this.employeeTaskService.hasPendingTaskForEmployee(
      this.employeeTasks(),
      employeeId,
      'DEPENDENT_INFO_REQUEST'
    );
  });

  readonly canRequestDependentSubmission = computed(() => {
    const employee = this.selectedEmployee();
    return Boolean(employee?.authUid) && !this.hasPendingDependentInfoRequest();
  });

  ngOnInit(): void {
    this.selectedEmployeeId.set(this.employeeIdControl.value);

    this.employeeIdControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((employeeId) => {
        this.selectedEmployeeId.set(employeeId);
        this.saveError.set(null);
        this.saveSuccess.set(null);
        this.requestSuccess.set(null);
      });

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
          this.loadError.set(toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました'));
          this.employees.set([]);
          this.loading.set(false);
        },
      });

    const companyOwnerUid = this.auth.currentUser?.uid;
    if (companyOwnerUid) {
      this.employeeTaskService
        .watchCompanyTasks(companyOwnerUid)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (tasks) => this.employeeTasks.set(tasks),
          error: () => this.employeeTasks.set([]),
        });
    }
  }

  employeeLabel(employee: Employee): string {
    return `${employee.employeeNumber} ${employee.lastName} ${employee.firstName}`;
  }

  openAddModal(draft: Dependent | null = null): void {
    if (!this.selectedEmployee()) {
      this.saveError.set('扶養家族を登録する従業員を選択してください');
      return;
    }

    this.saveError.set(null);
    this.modalDraftDependent.set(draft);
    this.addModalOpen.set(true);
  }

  openAddModalFromEmployeeSubmission(): void {
    const draft = this.selectedEmployee()?.pendingDependentSubmission ?? null;
    this.openAddModal(draft);
  }

  closeAddModal(): void {
    this.addModalOpen.set(false);
    this.modalDraftDependent.set(null);
  }

  async onDependentSaved(dependent: Dependent): Promise<void> {
    const employee = this.selectedEmployee();
    if (!employee) {
      this.saveError.set('従業員が見つかりません');
      return;
    }

    const dependents = [...(employee.dependents ?? []), dependent];

    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);

    try {
      await this.employeeService.updateEmployeeDependents(employee.id, dependents);
      this.employees.update((list) =>
        list.map((row) =>
          row.id === employee.id
            ? {
                ...row,
                dependents,
                hasDependents: dependents.length > 0,
                pendingDependentSubmission: null,
              }
            : row
        )
      );
      this.saveSuccess.set(
        `${employee.lastName} ${employee.firstName} の扶養家族を登録しました`
      );
      this.closeAddModal();
    } catch (error) {
      this.saveError.set(toFirestoreErrorMessage(error, '扶養家族の保存に失敗しました'));
    } finally {
      this.saving.set(false);
    }
  }

  async requestDependentSubmission(): Promise<void> {
    const employee = this.selectedEmployee();
    const companyOwnerUid = this.auth.currentUser?.uid;

    if (!employee || !companyOwnerUid) {
      this.saveError.set('従業員または会社情報が見つかりません');
      return;
    }

    if (!employee.authUid) {
      this.saveError.set('この従業員は従業員ポータルのログインが未設定のため、依頼を送信できません');
      return;
    }

    if (this.hasPendingDependentInfoRequest()) {
      this.saveError.set('この従業員には未対応の扶養情報提出依頼が既に存在します');
      return;
    }

    this.requestingSubmission.set(true);
    this.saveError.set(null);
    this.requestSuccess.set(null);

    try {
      await this.employeeTaskService.createDependentInfoRequest(
        companyOwnerUid,
        employee.id,
        [...DEPENDENT_INFO_REQUEST_FIELDS]
      );
      this.requestSuccess.set(
        `${employee.lastName} ${employee.firstName} さんに扶養情報の入力・提出依頼を送信しました`
      );
    } catch (error) {
      this.saveError.set(toFirestoreErrorMessage(error, '提出依頼の送信に失敗しました'));
    } finally {
      this.requestingSubmission.set(false);
    }
  }

  fullName = dependentFullName;
  relationshipLabel = dependentRelationshipLabel;
  livingArrangementLabel = dependentLivingArrangementLabel;
  occupationLabel = dependentOccupationLabel;
  situationLabel = dependentSituationLabel;
  statusLabel = dependentStatusLabel;
}
