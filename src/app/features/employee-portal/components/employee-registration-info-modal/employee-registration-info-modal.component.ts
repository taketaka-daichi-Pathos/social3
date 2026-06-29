import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { EmployeeService } from '@core/services/employee.service';
import { EmployeeSession } from '@core/services/employee-session.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { EmployeeApplicationDialogShellComponent } from '@features/employee-portal/components/employee-application-dialog-shell/employee-application-dialog-shell.component';
import {
  displayBankAccountType,
  displayCommutePassAmount,
  displayMaskedAccountNumber,
  displayRegistrationDate,
  displayRegistrationPostalCode,
  displayRegistrationValue,
} from '@features/employee-portal/utils/employee-registration-display.utils';
import { Dependent } from '@features/dependents/models/dependent.model';
import {
  dependentFullName,
  dependentRelationshipLabel,
} from '@features/dependents/utils/dependent-display.utils';
import { Employee } from '@features/employees/models/employee.model';
import { employeeFullName } from '@features/payroll/utils/compensation.utils';

@Component({
  selector: 'app-employee-registration-info-modal',
  standalone: true,
  imports: [DatePipe, EmployeeApplicationDialogShellComponent],
  templateUrl: './employee-registration-info-modal.component.html',
  styleUrl: './employee-registration-info-modal.component.scss',
})
export class EmployeeRegistrationInfoModalComponent {
  private readonly employeeService = inject(EmployeeService);

  readonly open = input(false);
  readonly session = input.required<EmployeeSession>();

  readonly closed = output<void>();

  readonly employeeData = signal<Employee | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      if (!this.open()) {
        this.employeeData.set(null);
        this.loading.set(false);
        this.loadError.set(null);
        return;
      }

      const currentSession = this.session();
      this.loading.set(true);
      this.loadError.set(null);

      const subscription = this.employeeService
        .watchEmployee(currentSession.companyOwnerUid, currentSession.employee.id)
        .subscribe({
          next: (employee) => {
            this.employeeData.set(employee);
            this.loading.set(false);
          },
          error: (error) => {
            this.loadError.set(
              toFirestoreErrorMessage(error, '登録情報の取得に失敗しました')
            );
            this.loading.set(false);
          },
        });

      onCleanup(() => subscription.unsubscribe());
    });
  }

  close(): void {
    this.closed.emit();
  }

  displayValue(value: string | null | undefined): string {
    return displayRegistrationValue(value);
  }

  displayPostalCode(value: string | null | undefined): string {
    return displayRegistrationPostalCode(value);
  }

  displayDate(value: string | null | undefined): string {
    return displayRegistrationDate(value);
  }

  displayAccountType(value: string | null | undefined): string {
    return displayBankAccountType(value);
  }

  displayAccountNumber(value: string | null | undefined): string {
    return displayMaskedAccountNumber(value);
  }

  displayCommuteAmount(value: number | null | undefined): string {
    return displayCommutePassAmount(value);
  }

  dependentName(dependent: Dependent): string {
    return dependentFullName(dependent);
  }

  dependentRelationship(dependent: Dependent): string {
    return dependentRelationshipLabel(dependent.relationship);
  }

  employeeDisplayName(employee: Employee): string {
    return employeeFullName(employee);
  }
}
