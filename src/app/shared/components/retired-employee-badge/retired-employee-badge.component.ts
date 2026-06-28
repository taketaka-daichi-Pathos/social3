import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { Employee } from '@features/employees/models/employee.model';
import {
  resolveRetirementDate,
  toRetirementDisplayDate,
} from '@features/employees/utils/retirement.utils';

@Component({
  selector: 'app-retired-employee-badge',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './retired-employee-badge.component.html',
  styleUrl: './retired-employee-badge.component.scss',
})
export class RetiredEmployeeBadgeComponent {
  readonly employee = input<Employee | null | undefined>(null);
  /** employee 未指定時、または employee より優先して退職日を直接渡す */
  readonly resignationDate = input<string | null | undefined>(undefined);

  readonly displayDate = computed(() => {
    const directDate = this.resignationDate();
    if (directDate !== undefined) {
      return toRetirementDisplayDate(directDate);
    }

    const employee = this.employee();
    return toRetirementDisplayDate(resolveRetirementDate(employee ?? ({} as Employee)));
  });
}
