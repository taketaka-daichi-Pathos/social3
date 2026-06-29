import { Injectable, computed, inject, signal } from '@angular/core';
import { EmployeeService } from '@core/services/employee.service';
import { getCurrentYearMonthKey } from '@features/payroll/utils/compensation.utils';
import { Employee } from '@features/employees/models/employee.model';
import {
  AgeBellNotification,
  buildAgeBellNotifications,
} from '@features/employees/utils/age-event-notification.utils';

@Injectable({ providedIn: 'root' })
export class AgeEventContextService {
  private readonly targetYearMonth = signal(getCurrentYearMonthKey());

  readonly payrollTargetYearMonth = this.targetYearMonth.asReadonly();

  setPayrollTargetYearMonth(yearMonth: string): void {
    const trimmed = yearMonth.trim();
    if (!trimmed) {
      return;
    }

    this.targetYearMonth.set(trimmed);
  }

  resetState(): void {
    this.targetYearMonth.set(getCurrentYearMonthKey());
  }
}

@Injectable({ providedIn: 'root' })
export class AgeEventNotificationService {
  private readonly employeeService = inject(EmployeeService);
  private readonly context = inject(AgeEventContextService);

  private readonly employees = signal<Employee[]>([]);
  private readonly watching = signal(false);
  private readonly dismissedBellNotificationIds = signal<Set<string>>(new Set());

  private readonly generatedBellNotifications = computed<AgeBellNotification[]>(() =>
    buildAgeBellNotifications(this.employees(), this.context.payrollTargetYearMonth())
  );

  readonly bellNotifications = computed<AgeBellNotification[]>(() => {
    const dismissed = this.dismissedBellNotificationIds();

    return this.generatedBellNotifications().filter(
      (notification) => !dismissed.has(notification.id)
    );
  });

  readonly unreadBellCount = computed(() => this.bellNotifications().length);

  removeNotification(id: string): void {
    const trimmed = id.trim();
    if (!trimmed) {
      return;
    }

    this.dismissedBellNotificationIds.update((dismissed) => {
      const next = new Set(dismissed);
      next.add(trimmed);
      return next;
    });
  }

  clearAllNotifications(): void {
    const ids = this.generatedBellNotifications().map((notification) => notification.id);
    if (ids.length === 0) {
      return;
    }

    this.dismissedBellNotificationIds.update((dismissed) => {
      const next = new Set(dismissed);
      for (const id of ids) {
        next.add(id);
      }
      return next;
    });
  }

  resetState(): void {
    this.employees.set([]);
    this.watching.set(false);
    this.dismissedBellNotificationIds.set(new Set());
  }

  hasCachedState(): boolean {
    return (
      this.watching() ||
      this.employees().length > 0 ||
      this.dismissedBellNotificationIds().size > 0
    );
  }

  ensureWatching(): void {
    if (this.watching()) {
      return;
    }

    this.watching.set(true);
    this.employeeService.watchEmployees().subscribe({
      next: (employees) => this.employees.set(employees),
      error: () => this.employees.set([]),
    });
  }
}
