import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import { CompanyService } from '@core/services/company.service';
import { EmployeeService } from '@core/services/employee.service';
import { EmployeeTaskService } from '@core/services/employee-task.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { EmployeeTask } from '@features/employee-portal/models/employee-task.model';
import { EmployeeTaskRequestedField } from '@features/employee-portal/models/employee-task.model';
import { Employee } from '@features/employees/models/employee.model';
import {
  StatutoryExportConfirmEvent,
  StatutoryExportRequestInput,
  StatutoryExportTargetModalComponent,
} from '@features/statutory-reports/components/statutory-export-target-modal/statutory-export-target-modal.component';
import {
  STATUTORY_REPORT_MENU_ITEMS,
  StatutoryReportMenuItem,
} from '@features/statutory-reports/models/statutory-report-menu.model';
import { StatutoryReportId } from '@features/statutory-reports/models/statutory-report-validation.model';
import { EgovExportService } from '@features/statutory-reports/services/egov-export.service';
import { validateCompanyForEgovExport } from '@features/statutory-reports/utils/egov-company-validation.utils';
import {
  getStatutoryReportDefinition,
  mapMissingFieldsToTaskRequestedFields,
  evaluateEmployeeReportReadiness,
} from '@features/statutory-reports/utils/statutory-report-validation.utils';
import { resolveDefaultSanteiTargetYear } from '@features/statutory-reports/utils/santei-data.utils';
import { resolveDefaultGeppenRevisionYearMonth } from '@features/statutory-reports/utils/geppen-data.utils';
import { resolveDefaultSyouyoPaymentDate } from '@features/statutory-reports/utils/syouyo-data.utils';
import { CompanySettings } from '@features/settings/models/company-settings.model';

@Component({
  selector: 'app-statutory-reports',
  standalone: true,
  imports: [StatutoryExportTargetModalComponent],
  templateUrl: './statutory-reports.component.html',
  styleUrl: './statutory-reports.component.scss',
})
export class StatutoryReportsComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly companyService = inject(CompanyService);
  private readonly employeeService = inject(EmployeeService);
  private readonly employeeTaskService = inject(EmployeeTaskService);
  private readonly egovExportService = inject(EgovExportService);

  readonly menuItems: StatutoryReportMenuItem[] = STATUTORY_REPORT_MENU_ITEMS;

  readonly targetModalOpen = signal(false);
  readonly activeReportId = signal<StatutoryReportId | null>(null);
  readonly activeReportTitle = signal('');
  readonly employeesLoading = signal(true);
  readonly exportLoading = signal(false);
  readonly exportError = signal<string | null>(null);
  readonly requestNotice = signal<string | null>(null);
  readonly requestingEmployeeId = signal<string | null>(null);
  readonly employees = signal<Employee[]>([]);
  readonly companyTasks = signal<EmployeeTask[]>([]);
  readonly companySettings = signal<CompanySettings | null>(null);

  private companyOwnerUid: string | null = null;

  ngOnInit(): void {
    this.companyOwnerUid = this.auth.currentUser?.uid ?? null;

    void this.loadCompanySettings();

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.employees.set(rows);
          this.employeesLoading.set(false);
        },
        error: (error) => {
          this.employeesLoading.set(false);
          this.exportError.set(toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました'));
        },
      });

    if (this.companyOwnerUid) {
      this.employeeTaskService
        .watchCompanyTasks(this.companyOwnerUid)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (tasks) => this.companyTasks.set(tasks),
        });
    }
  }

  openExportDialog(reportId: string): void {
    const menuItem = this.menuItems.find((item) => item.id === reportId);
    if (!menuItem) {
      return;
    }

    this.activeReportId.set(reportId as StatutoryReportId);
    this.activeReportTitle.set(menuItem.primaryTitle);
    this.exportError.set(validateCompanyForEgovExport(this.companySettings()));
    this.requestNotice.set(null);
    this.targetModalOpen.set(true);
  }

  closeTargetModal(): void {
    this.targetModalOpen.set(false);
    this.activeReportId.set(null);
    this.exportError.set(null);
    this.requestNotice.set(null);
  }

  async onRequestInput(event: StatutoryExportRequestInput): Promise<void> {
    const companyOwnerUid = this.companyOwnerUid ?? this.auth.currentUser?.uid;
    if (!companyOwnerUid) {
      this.exportError.set('会社情報を取得できませんでした');
      return;
    }

    const definition = getStatutoryReportDefinition(event.reportId);
    if (!definition.taskType) {
      this.exportError.set('この帳票では入力依頼を送信できません');
      return;
    }

    const readiness = evaluateEmployeeReportReadiness(event.employee, event.reportId);
    const requestedFields = mapMissingFieldsToTaskRequestedFields(
      event.reportId,
      readiness.missingFields
    ) as EmployeeTaskRequestedField[];

    if (requestedFields.length === 0) {
      this.exportError.set('依頼する項目がありません');
      return;
    }

    this.requestingEmployeeId.set(event.employee.id);
    this.exportError.set(null);

    try {
      if (definition.taskType === 'RETIREMENT_INFO') {
        await this.employeeTaskService.createRetirementInfoRequest(
          companyOwnerUid,
          event.employee.id,
          requestedFields
        );
      } else if (definition.taskType === 'SHIKAKU_SHUTOKU_INFO') {
        await this.employeeTaskService.createShikakuShutokuInfoRequest(
          companyOwnerUid,
          event.employee.id,
          requestedFields
        );
      } else if (definition.taskType === 'BASIC_INFO_REQUEST') {
        await this.employeeTaskService.createBasicInfoRequest(
          companyOwnerUid,
          event.employee.id,
          requestedFields
        );
      } else if (definition.taskType === 'MATERNITY_LEAVE_INFO_REQUEST') {
        await this.employeeTaskService.createMaternityLeaveInfoRequest(
          companyOwnerUid,
          event.employee.id,
          requestedFields
        );
      } else if (definition.taskType === 'CHILDCARE_LEAVE_INFO_REQUEST') {
        await this.employeeTaskService.createChildcareLeaveInfoRequest(
          companyOwnerUid,
          event.employee.id,
          requestedFields
        );
      }

      this.requestNotice.set(`${event.employee.lastName}${event.employee.firstName} さんへ入力依頼を送信しました`);
    } catch (error) {
      this.exportError.set(toFirestoreErrorMessage(error, '入力依頼の送信に失敗しました'));
    } finally {
      this.requestingEmployeeId.set(null);
    }
  }

  exportSelected(reportId: StatutoryReportId, event: StatutoryExportConfirmEvent): void {
    const company = this.companySettings();
    const validationError = validateCompanyForEgovExport(company);
    if (validationError) {
      this.exportError.set(validationError);
      return;
    }

    this.exportLoading.set(true);
    this.exportError.set(null);

    void this.runExport(reportId, company!, event).finally(() => {
      this.exportLoading.set(false);
    });
  }

  private async runExport(
    reportId: StatutoryReportId,
    company: CompanySettings,
    event: StatutoryExportConfirmEvent
  ): Promise<void> {
    try {
      if (reportId === 'shikaku-shutoku') {
        this.egovExportService.downloadShikakuShutokuCsv(company, event.employees);
      } else if (reportId === 'shikaku-soshitsu') {
        this.egovExportService.downloadShikakuSoshitsuCsv(company, event.employees);
      } else if (reportId === 'santei-kiso') {
        const targetYear = event.targetYear ?? resolveDefaultSanteiTargetYear();
        await this.egovExportService.downloadSanteiKisoCsv(company, event.employees, targetYear);
      } else if (reportId === 'getsugaku-henko') {
        const revisionYearMonth = event.revisionYearMonth ?? resolveDefaultGeppenRevisionYearMonth();
        await this.egovExportService.downloadGeppenCsv(company, event.employees, revisionYearMonth);
      } else if (reportId === 'shoyo-shiharai') {
        const paymentDate = event.bonusPaymentDate ?? resolveDefaultSyouyoPaymentDate(event.employees);
        await this.egovExportService.downloadSyouyoCsv(company, event.employees, paymentDate);
      } else if (reportId === 'fuyo-ido') {
        this.egovExportService.downloadFuyouIdouCsv(company, event.employees);
      } else if (reportId === 'sankyu-shinsei') {
        this.egovExportService.downloadSanzenSangoCsv(company, event.employees);
      } else if (reportId === 'ikuji-shinsei') {
        this.egovExportService.downloadIkujiKyugyoCsv(company, event.employees);
      } else {
        this.exportError.set('この帳票の CSV 出力は準備中です');
        return;
      }

      this.closeTargetModal();
    } catch (error) {
      this.exportError.set(
        error instanceof Error ? error.message : 'CSV の出力に失敗しました'
      );
    }
  }

  onExportConfirmed(event: StatutoryExportConfirmEvent): void {
    const reportId = this.activeReportId();
    if (!reportId) {
      return;
    }

    this.exportSelected(reportId, event);
  }

  private async loadCompanySettings(): Promise<void> {
    try {
      const company = await this.companyService.getCompanyForCurrentUser();
      this.companySettings.set(company);
    } catch (error) {
      this.exportError.set(toFirestoreErrorMessage(error, '会社情報の取得に失敗しました'));
    }
  }
}
