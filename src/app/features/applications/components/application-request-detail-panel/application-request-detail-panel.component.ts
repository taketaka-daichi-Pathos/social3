import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { buildApplicationComparisonRows } from '@features/applications/utils/application-workflow-comparison.utils';
import { Employee } from '@features/employees/models/employee.model';
import { employeeFullName } from '@features/payroll/utils/compensation.utils';
import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';
import { workflowRequestTypeLabel } from '@features/workflow/utils/workflow-navigation.utils';

@Component({
  selector: 'app-application-request-detail-panel',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './application-request-detail-panel.component.html',
  styleUrl: './application-request-detail-panel.component.scss',
})
export class ApplicationRequestDetailPanelComponent {
  readonly request = input.required<WorkflowRequest>();
  readonly employee = input.required<Employee>();
  readonly approving = input(false);
  readonly errorMessage = input<string | null>(null);

  readonly closed = output<void>();
  readonly approved = output<void>();

  readonly comparisonRows = computed(() =>
    buildApplicationComparisonRows(this.employee(), this.request())
  );

  requestTypeLabel(): string {
    return workflowRequestTypeLabel(this.request().type);
  }

  employeeLabel(): string {
    const employee = this.employee();
    return `${employee.employeeNumber} ${employeeFullName(employee)}`;
  }

  onClose(): void {
    this.closed.emit();
  }

  onApprove(): void {
    this.approved.emit();
  }
}
