import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import { EmployeeSession, EmployeeSessionService } from '@core/services/employee-session.service';
import { EmployeeTaskService } from '@core/services/employee-task.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { EmployeeTaskResponseModalComponent } from '@features/employee-portal/components/employee-task-response-modal/employee-task-response-modal.component';
import { EmployeeWorkflowRequestFormsComponent } from '@features/employee-portal/components/employee-workflow-request-forms/employee-workflow-request-forms.component';
import {
  EmployeeTask,
  EmployeeTaskFieldValues,
} from '@features/employee-portal/models/employee-task.model';
import { getEmployeeTaskTitle } from '@features/employee-portal/utils/employee-task.utils';
import { employeeFullName } from '@features/payroll/utils/compensation.utils';

@Component({
  selector: 'app-employee-dashboard',
  standalone: true,
  imports: [DatePipe, EmployeeTaskResponseModalComponent, EmployeeWorkflowRequestFormsComponent],
  templateUrl: './employee-dashboard.component.html',
  styleUrl: './employee-dashboard.component.scss',
})
export class EmployeeDashboardComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly sessionService = inject(EmployeeSessionService);
  private readonly taskService = inject(EmployeeTaskService);

  readonly session = signal<EmployeeSession | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly tasks = signal<EmployeeTask[]>([]);
  readonly selectedTask = signal<EmployeeTask | null>(null);
  readonly taskModalOpen = signal(false);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  readonly pendingTasks = computed(() => this.tasks().filter((task) => task.status === 'PENDING'));
  readonly completedTasks = computed(() => this.tasks().filter((task) => task.status === 'COMPLETED'));
  readonly basicInfoRequestTask = computed(() =>
    this.pendingTasks().find((task) => task.taskType === 'BASIC_INFO_REQUEST') ?? null
  );
  readonly maternityLeaveInfoRequestTask = computed(() =>
    this.pendingTasks().find((task) => task.taskType === 'MATERNITY_LEAVE_INFO_REQUEST') ?? null
  );
  readonly childcareLeaveInfoRequestTask = computed(() =>
    this.pendingTasks().find((task) => task.taskType === 'CHILDCARE_LEAVE_INFO_REQUEST') ?? null
  );
  readonly dependentInfoRequestTask = computed(() =>
    this.pendingTasks().find((task) => task.taskType === 'DEPENDENT_INFO_REQUEST') ?? null
  );

  ngOnInit(): void {
    void this.initialize();
  }

  employeeName(): string {
    const employee = this.session()?.employee;
    return employee ? employeeFullName(employee) : '';
  }

  taskTitle(task: EmployeeTask): string {
    return getEmployeeTaskTitle(task.taskType);
  }

  openTask(task: EmployeeTask): void {
    if (task.status !== 'PENDING') {
      return;
    }

    this.submitError.set(null);
    this.selectedTask.set(task);
    this.taskModalOpen.set(true);
  }

  closeTaskModal(): void {
    this.taskModalOpen.set(false);
    this.selectedTask.set(null);
    this.submitError.set(null);
  }

  async onTaskSubmitted(values: EmployeeTaskFieldValues): Promise<void> {
    const currentSession = this.session();
    const task = this.selectedTask();
    if (!currentSession || !task) {
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);

    try {
      await this.taskService.completeTask(currentSession.companyOwnerUid, task, values);
      const refreshedSession = await this.sessionService.resolveCurrentSession();
      if (refreshedSession) {
        this.session.set(refreshedSession);
      }
      this.closeTaskModal();
    } catch (error) {
      this.submitError.set(
        toFirestoreErrorMessage(error, 'タスクの送信に失敗しました')
      );
    } finally {
      this.submitting.set(false);
    }
  }

  private async initialize(): Promise<void> {
    try {
      const currentSession = await this.sessionService.resolveCurrentSession();
      if (!currentSession) {
        const user = this.auth.currentUser;
        const isAdmin = user ? await this.sessionService.isCompanyAdmin(user.uid) : false;
        this.loadError.set(
          isAdmin
            ? '管理者アカウントに紐づく従業員が見つかりません。従業員のメールアドレスを管理者と同じにするか、会社設定で紐づく従業員を選択してください。'
            : '従業員情報を取得できませんでした'
        );
        this.loading.set(false);
        return;
      }

      this.session.set(currentSession);
      this.taskService
        .watchTasksForEmployee(currentSession.companyOwnerUid, currentSession.employee.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (tasks) => {
            this.tasks.set(tasks);
            this.loading.set(false);
          },
          error: (error) => {
            this.loadError.set(toFirestoreErrorMessage(error, 'タスク一覧の取得に失敗しました'));
            this.loading.set(false);
          },
        });
    } catch (error) {
      this.loadError.set(toFirestoreErrorMessage(error, 'ダッシュボードの初期化に失敗しました'));
      this.loading.set(false);
    }
  }
}
