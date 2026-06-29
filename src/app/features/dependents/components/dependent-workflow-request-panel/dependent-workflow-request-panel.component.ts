import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { EmployeeService } from '@core/services/employee.service';
import { employeeFullName } from '@features/payroll/utils/compensation.utils';
import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';
import {
  extractAddDependentDocumentUrls,
  isImageDocumentUrl,
  isPdfDocumentUrl,
} from '@features/workflow/utils/workflow-dependent.utils';
import { buildWorkflowPayloadDisplayRows } from '@features/workflow/utils/workflow-payload.utils';
import { workflowRequestTypeLabel } from '@features/workflow/utils/workflow-navigation.utils';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-dependent-workflow-request-panel',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './dependent-workflow-request-panel.component.html',
  styleUrl: './dependent-workflow-request-panel.component.scss',
})
export class DependentWorkflowRequestPanelComponent {
  private readonly employeeService = inject(EmployeeService);

  readonly request = input.required<WorkflowRequest>();
  readonly approving = input(false);
  readonly errorMessage = input<string | null>(null);

  readonly closed = output<void>();
  readonly approved = output<void>();

  private readonly employees = toSignal(this.employeeService.watchEmployees(), {
    initialValue: [],
  });

  readonly payloadRows = computed(() =>
    buildWorkflowPayloadDisplayRows(this.request().type, this.request().payload)
  );

  readonly documentUrls = computed(() => extractAddDependentDocumentUrls(this.request().payload));

  readonly employeeLabel = computed(() => {
    const employee = this.employees().find((row) => row.id === this.request().targetEmployeeId);
    if (!employee) {
      return '従業員情報を取得できません';
    }

    return `${employee.employeeNumber} ${employeeFullName(employee)}`;
  });

  requestTypeLabel(): string {
    return workflowRequestTypeLabel(this.request().type);
  }

  isPdfDocument(url: string): boolean {
    return isPdfDocumentUrl(url);
  }

  isImageDocument(url: string): boolean {
    return isImageDocumentUrl(url);
  }

  openDocumentInNewTab(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onClose(): void {
    this.closed.emit();
  }

  onApprove(): void {
    this.approved.emit();
  }
}
