import { Component, computed, effect, input, output, signal } from '@angular/core';
import { EmployeeTask } from '@features/employee-portal/models/employee-task.model';
import { Employee } from '@features/employees/models/employee.model';
import { employeeFullName } from '@features/payroll/utils/compensation.utils';
import { StatutoryReportId } from '@features/statutory-reports/models/statutory-report-validation.model';
import {
  evaluateEmployeeReportReadiness,
  filterReportCandidates,
  getStatutoryReportDefinition,
  mapMissingFieldsToTaskRequestedFields,
} from '@features/statutory-reports/utils/statutory-report-validation.utils';
import { resolveDefaultSanteiTargetYear } from '@features/statutory-reports/utils/santei-data.utils';
import { resolveDefaultGeppenRevisionYearMonth } from '@features/statutory-reports/utils/geppen-data.utils';
import {
  hasEmployeeBonusForPaymentDate,
  resolveDefaultSyouyoPaymentDate,
} from '@features/statutory-reports/utils/syouyo-data.utils';
import { employeeHasFuyouIdouDependents } from '@features/statutory-reports/utils/fuyou-idou-data.utils';
import { employeeHasMaternityLeaveRecord } from '@features/statutory-reports/utils/maternity-leave-data.utils';
import { employeeHasChildcareLeaveRecord } from '@features/statutory-reports/utils/childcare-leave-data.utils';

export interface StatutoryExportRequestInput {
  employee: Employee;
  reportId: StatutoryReportId;
}

export interface StatutoryExportConfirmEvent {
  employees: Employee[];
  /** 算定基礎届など対象年が必要な帳票用 */
  targetYear?: number;
  /** 月額変更届など改定年月（YYYY-MM）が必要な帳票用 */
  revisionYearMonth?: string;
  /** 賞与支払届など賞与支払日（YYYY-MM-DD）が必要な帳票用 */
  bonusPaymentDate?: string;
}

@Component({
  selector: 'app-statutory-export-target-modal',
  standalone: true,
  templateUrl: './statutory-export-target-modal.component.html',
  styleUrl: './statutory-export-target-modal.component.scss',
})
export class StatutoryExportTargetModalComponent {
  readonly open = input(false);
  readonly reportId = input<StatutoryReportId | null>(null);
  readonly reportTitle = input('');
  readonly employees = input<Employee[]>([]);
  readonly companyTasks = input<EmployeeTask[]>([]);
  readonly loading = input(false);
  readonly exporting = input(false);
  readonly requestingEmployeeId = input<string | null>(null);
  readonly errorMessage = input<string | null>(null);

  readonly confirmed = output<StatutoryExportConfirmEvent>();
  readonly closed = output<void>();
  readonly requestInput = output<StatutoryExportRequestInput>();

  readonly selectedIds = signal<Set<string>>(new Set());
  readonly validationError = signal('');
  readonly targetYear = signal(resolveDefaultSanteiTargetYear());
  readonly revisionYearMonth = signal(resolveDefaultGeppenRevisionYearMonth());
  readonly bonusPaymentDate = signal(resolveDefaultSyouyoPaymentDate([]));

  readonly isSanteiKisoReport = computed(() => this.reportId() === 'santei-kiso');
  readonly isGeppenReport = computed(() => this.reportId() === 'getsugaku-henko');
  readonly isSyouyoReport = computed(() => this.reportId() === 'shoyo-shiharai');
  readonly isFuyoIdouReport = computed(() => this.reportId() === 'fuyo-ido');
  readonly isSanzenSangoReport = computed(() => this.reportId() === 'sankyu-shinsei');
  readonly isIkujiKyugyoReport = computed(() => this.reportId() === 'ikuji-shinsei');

  readonly requestInputButtonLabel = computed(() => {
    if (this.isFuyoIdouReport()) {
      return '本人に基本情報の入力を依頼';
    }

    if (this.isSanzenSangoReport() || this.isIkujiKyugyoReport()) {
      return '本人に休業詳細の入力を依頼';
    }

    return '本人に情報を依頼する';
  });

  readonly reportDefinition = computed(() => {
    const reportId = this.reportId();
    return reportId ? getStatutoryReportDefinition(reportId) : null;
  });

  readonly candidateEmployees = computed(() => {
    const reportId = this.reportId();
    if (!reportId) {
      return [];
    }

    return filterReportCandidates(this.employees(), reportId);
  });

  readonly readinessByEmployeeId = computed(() => {
    const reportId = this.reportId();
    const map = new Map<string, ReturnType<typeof evaluateEmployeeReportReadiness>>();

    if (!reportId) {
      return map;
    }

    for (const employee of this.candidateEmployees()) {
      map.set(employee.id, evaluateEmployeeReportReadiness(employee, reportId));
    }

    return map;
  });

  readonly exportImplemented = computed(() => this.reportDefinition()?.exportImplemented ?? false);

  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly selectableEmployees = computed(() =>
    this.candidateEmployees().filter((employee) => this.canSelectEmployee(employee.id))
  );

  readonly allSelectableSelected = computed(() => {
    const selectable = this.selectableEmployees();
    return (
      selectable.length > 0 && selectable.every((employee) => this.selectedIds().has(employee.id))
    );
  });

  constructor() {
    effect(() => {
      if (!this.open()) {
        this.selectedIds.set(new Set());
        this.validationError.set('');
        return;
      }

      if (this.reportId() === 'santei-kiso') {
        this.targetYear.set(resolveDefaultSanteiTargetYear());
      }

      if (this.reportId() === 'getsugaku-henko') {
        this.revisionYearMonth.set(resolveDefaultGeppenRevisionYearMonth());
      }

      if (this.reportId() === 'shoyo-shiharai') {
        this.bonusPaymentDate.set(resolveDefaultSyouyoPaymentDate(this.employees()));
      }
    });
  }

  displayName(employee: Employee): string {
    return employeeFullName(employee);
  }

  isEmployeeReady(employeeId: string): boolean {
    return this.readinessByEmployeeId().get(employeeId)?.ready ?? false;
  }

  missingLabelText(employeeId: string): string {
    const employee = this.candidateEmployees().find((row) => row.id === employeeId);
    if (this.isFuyoIdouReport() && employee && !employeeHasFuyouIdouDependents(employee)) {
      return '扶養家族未登録';
    }

    if (this.isSanzenSangoReport() && employee && !employeeHasMaternityLeaveRecord(employee)) {
      return '産休データなし';
    }

    if (this.isIkujiKyugyoReport() && employee && !employeeHasChildcareLeaveRecord(employee)) {
      return '育休データなし';
    }

    if (this.isSyouyoReport() && employee && !hasEmployeeBonusForPaymentDate(employee, this.bonusPaymentDate())) {
      return '指定日の賞与データなし';
    }

    const readiness = this.readinessByEmployeeId().get(employeeId);
    if (!readiness || readiness.ready) {
      return '';
    }

    return readiness.missingLabels.join('、');
  }

  isSelected(employeeId: string): boolean {
    return this.selectedIds().has(employeeId);
  }

  canSelectEmployee(employeeId: string): boolean {
    if (!this.isEmployeeReady(employeeId)) {
      return false;
    }

    if (this.isSyouyoReport()) {
      const employee = this.candidateEmployees().find((row) => row.id === employeeId);
      return employee ? hasEmployeeBonusForPaymentDate(employee, this.bonusPaymentDate()) : false;
    }

    if (this.isFuyoIdouReport()) {
      const employee = this.candidateEmployees().find((row) => row.id === employeeId);
      return employee ? employeeHasFuyouIdouDependents(employee) : false;
    }

    if (this.isSanzenSangoReport()) {
      const employee = this.candidateEmployees().find((row) => row.id === employeeId);
      return employee ? employeeHasMaternityLeaveRecord(employee) : false;
    }

    if (this.isIkujiKyugyoReport()) {
      const employee = this.candidateEmployees().find((row) => row.id === employeeId);
      return employee ? employeeHasChildcareLeaveRecord(employee) : false;
    }

    return true;
  }

  hasPendingInputRequest(employee: Employee): boolean {
    const taskType = this.reportDefinition()?.taskType;
    if (!taskType) {
      return false;
    }

    return this.companyTasks().some(
      (task) =>
        task.employeeId === employee.id &&
        task.taskType === taskType &&
        task.status === 'PENDING'
    );
  }

  canRequestInput(employee: Employee): boolean {
    const definition = this.reportDefinition();
    if (!definition?.taskType) {
      return false;
    }

    if (!employee.authUid) {
      return false;
    }

    if (this.isEmployeeReady(employee.id)) {
      return false;
    }

    if (!this.hasRequestableMissingFields(employee.id)) {
      return false;
    }

    return !this.hasPendingInputRequest(employee);
  }

  private hasRequestableMissingFields(employeeId: string): boolean {
    const reportId = this.reportId();
    if (!reportId) {
      return false;
    }

    const readiness = this.readinessByEmployeeId().get(employeeId);
    if (!readiness) {
      return false;
    }

    const requestedFields = mapMissingFieldsToTaskRequestedFields(
      reportId,
      readiness.missingFields
    );

    return requestedFields.length > 0;
  }

  toggleEmployee(employeeId: string, checked: boolean): void {
    if (!this.canSelectEmployee(employeeId)) {
      return;
    }

    const next = new Set(this.selectedIds());
    if (checked) {
      next.add(employeeId);
    } else {
      next.delete(employeeId);
    }
    this.selectedIds.set(next);
    this.validationError.set('');
  }

  toggleSelectAll(checked: boolean): void {
    if (!checked) {
      this.selectedIds.set(new Set());
      return;
    }

    this.selectedIds.set(new Set(this.selectableEmployees().map((employee) => employee.id)));
    this.validationError.set('');
  }

  onRequestInput(employee: Employee): void {
    const reportId = this.reportId();
    if (!reportId) {
      return;
    }

    this.requestInput.emit({ employee, reportId });
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  onTargetYearInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value >= 2000 && value <= 2100) {
      this.targetYear.set(value);
    }
  }

  onRevisionYearMonthInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (/^\d{4}-\d{2}$/.test(value)) {
      this.revisionYearMonth.set(value);
    }
  }

  onBonusPaymentDateInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.bonusPaymentDate.set(value);
      this.selectedIds.set(new Set());
      this.validationError.set('');
    }
  }

  geppenPayrollMonthsLabel(): string {
    const revision = this.revisionYearMonth();
    if (!/^\d{4}-\d{2}$/.test(revision)) {
      return '';
    }

    const [yearStr, monthStr] = revision.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const labels: string[] = [];

    for (let offset = 3; offset >= 1; offset -= 1) {
      let targetMonth = month - offset;
      let targetYear = year;
      while (targetMonth <= 0) {
        targetMonth += 12;
        targetYear -= 1;
      }
      labels.push(`${targetYear}年${targetMonth}月`);
    }

    return labels.join('、');
  }

  onExport(): void {
    if (!this.exportImplemented()) {
      this.validationError.set('この帳票の CSV 出力は準備中です。');
      return;
    }

    const selected = this.candidateEmployees().filter(
      (employee) => this.selectedIds().has(employee.id) && this.canSelectEmployee(employee.id)
    );

    if (selected.length === 0) {
      this.validationError.set('出力可能な従業員を1名以上選択してください。');
      return;
    }

    this.confirmed.emit({
      employees: selected,
      targetYear: this.isSanteiKisoReport() ? this.targetYear() : undefined,
      revisionYearMonth: this.isGeppenReport() ? this.revisionYearMonth() : undefined,
      bonusPaymentDate: this.isSyouyoReport() ? this.bonusPaymentDate() : undefined,
    });
  }
}
