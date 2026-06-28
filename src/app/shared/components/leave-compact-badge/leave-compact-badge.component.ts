import { NgClass } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { Employee } from '@features/employees/models/employee.model';
import {
  getEmployeeLeaveInfo,
  getLeaveBadgeClass,
  getLeaveTypeName,
  referenceDateForYearMonth,
} from '@features/employees/utils/leave-record.utils';

@Component({
  selector: 'app-leave-compact-badge',
  standalone: true,
  imports: [NgClass],
  templateUrl: './leave-compact-badge.component.html',
  styleUrl: './leave-compact-badge.component.scss',
})
export class LeaveCompactBadgeComponent {
  readonly employee = input<Employee | null>(null);
  /** 未指定時は本日。月次保険料などは対象月を渡す */
  readonly referenceDate = input<Date | undefined>(undefined);
  /** YYYY-MM を渡すと referenceDate より優先 */
  readonly referenceYearMonth = input<string | undefined>(undefined);

  private readonly resolvedReferenceDate = computed(() => {
    const yearMonth = this.referenceYearMonth()?.trim();
    if (yearMonth) {
      return referenceDateForYearMonth(yearMonth);
    }

    return this.referenceDate() ?? new Date();
  });

  readonly show = computed(() =>
    getEmployeeLeaveInfo(this.employee(), this.resolvedReferenceDate()).showLeaveStatus
  );

  readonly typeName = computed(() =>
    getLeaveTypeName(this.employee(), this.resolvedReferenceDate())
  );

  readonly badgeClass = computed(() =>
    getLeaveBadgeClass(this.employee(), this.resolvedReferenceDate())
  );
}
