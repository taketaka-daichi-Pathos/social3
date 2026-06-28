import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import { CompanyService } from '@core/services/company.service';
import { EmployeeService } from '@core/services/employee.service';
import { EmployeeSessionService } from '@core/services/employee-session.service';
import { Employee } from '@features/employees/models/employee.model';
import { resolveLinkedEmployeeForAdmin } from '@features/employees/utils/current-admin-employee.utils';
import { CompanySettings } from '@features/settings/models/company-settings.model';
import { firstValueFrom, take } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminEmployeeLinkService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly companyService = inject(CompanyService);
  private readonly employeeService = inject(EmployeeService);
  private readonly sessionService = inject(EmployeeSessionService);

  readonly linkedEmployee = signal<Employee | null>(null);
  readonly isAdminUser = signal(false);
  readonly canSwitchPortal = computed(
    () => this.isAdminUser() && this.linkedEmployee() != null
  );

  private companySettings: CompanySettings | null = null;
  private watchStarted = false;

  ensureWatching(): void {
    if (this.watchStarted) {
      return;
    }

    this.watchStarted = true;
    void this.refreshLinkState();

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => void this.updateLinkedEmployee(employees),
        error: () => this.linkedEmployee.set(null),
      });
  }

  async refreshLinkState(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      this.isAdminUser.set(false);
      this.linkedEmployee.set(null);
      return;
    }

    const isAdmin = await this.sessionService.isCompanyAdmin(user.uid);
    this.isAdminUser.set(isAdmin);

    if (!isAdmin) {
      this.linkedEmployee.set(null);
      return;
    }

    try {
      this.companySettings = await this.companyService.getCompanyForCurrentUser();
    } catch {
      this.companySettings = null;
    }
  }

  private async updateLinkedEmployee(employees: Employee[]): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      this.isAdminUser.set(false);
      this.linkedEmployee.set(null);
      return;
    }

    const isAdmin = await this.sessionService.isCompanyAdmin(user.uid);
    this.isAdminUser.set(isAdmin);

    if (!isAdmin) {
      this.linkedEmployee.set(null);
      return;
    }

    if (!this.companySettings) {
      try {
        this.companySettings = await this.companyService.getCompanyForCurrentUser();
      } catch {
        this.companySettings = null;
      }
    }

    const employee = resolveLinkedEmployeeForAdmin(
      employees,
      this.companySettings,
      user.email
    );

    this.linkedEmployee.set(employee);
  }

  async reloadLink(): Promise<void> {
    await this.refreshLinkState();
    const employees = await firstValueFrom(this.employeeService.watchEmployees().pipe(take(1)));
    await this.updateLinkedEmployee(employees);
  }
}
