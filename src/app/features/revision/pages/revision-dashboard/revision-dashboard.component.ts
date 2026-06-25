import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompensationService } from '@core/services/compensation.service';
import { EmployeeService } from '@core/services/employee.service';
import { SocialInsuranceRevisionService } from '@core/services/social-insurance-revision.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee } from '@features/employees/models/employee.model';
import {
  formatTargetMonthLabel,
  getAnnualDeterminationMonths,
  getNextYearMonthKey,
  toYearMonthKeyFromParts,
} from '@features/payroll/utils/compensation.utils';
import {
  loadStoredRevisionYear,
  saveStoredRevisionYear,
} from '@features/payroll/utils/payroll-storage.utils';
import {
  AnnualDeterminationResult,
  OccasionalRevisionResult,
  RevisionStatus,
} from '@features/revision/models/revision.model';
import { SubNavComponent, SubNavItem } from '@shared/components/sub-nav/sub-nav.component';
import { YearSelectComponent } from '@shared/components/year-select/year-select.component';

@Component({
  selector: 'app-revision-dashboard',
  standalone: true,
  imports: [DecimalPipe, SubNavComponent, YearSelectComponent],
  templateUrl: './revision-dashboard.component.html',
  styleUrl: './revision-dashboard.component.scss',
})
export class RevisionDashboardComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly employeeService = inject(EmployeeService);
  private readonly compensationService = inject(CompensationService);
  private readonly revisionService = inject(SocialInsuranceRevisionService);

  readonly subNavItems: SubNavItem[] = [
    { label: '算定基礎（定時決定）', id: 'annual' },
    { label: '随時改定（月額変更）', id: 'occasional' },
  ];

  readonly activeSubTab = signal('annual');
  readonly targetYear = signal(new Date().getFullYear());
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly annualResults = signal<AnnualDeterminationResult[]>([]);
  readonly occasionalResults = signal<OccasionalRevisionResult[]>([]);

  private readonly employees = signal<Employee[]>([]);
  private rebuildVersion = 0;

  ngOnInit(): void {
    const currentYear = new Date().getFullYear();
    this.targetYear.set(loadStoredRevisionYear(currentYear));

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => {
          this.employees.set(employees);
          this.loadError.set('');
          void this.recalculate();
        },
        error: (error) => {
          this.loadError.set(
            error instanceof Error && error.message === 'ログインしていません'
              ? 'ログインしていません。再度ログインしてください。'
              : toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました')
          );
          this.annualResults.set([]);
          this.occasionalResults.set([]);
          this.loading.set(false);
        },
      });
  }

  onSubNavSelect(item: SubNavItem): void {
    this.activeSubTab.set(item.id);
  }

  onYearSelected(year: number): void {
    this.targetYear.set(year);
    saveStoredRevisionYear(year);
    void this.recalculate();
  }

  determinationMonthsLabel(): string {
    return getAnnualDeterminationMonths(this.targetYear())
      .map((month) => formatTargetMonthLabel(month))
      .join(' / ');
  }

  statusLabel(status: RevisionStatus): string {
    switch (status) {
      case 'eligible':
        return '改定対象';
      case 'applied':
        return '等級変更なし';
      case 'excluded':
        return '対象外';
      default:
        return '未確定';
    }
  }

  statusClass(status: RevisionStatus): string {
    switch (status) {
      case 'eligible':
        return 'revision__badge revision__badge--eligible';
      case 'applied':
        return 'revision__badge revision__badge--applied';
      case 'excluded':
        return 'revision__badge revision__badge--excluded';
      default:
        return 'revision__badge revision__badge--pending';
    }
  }

  formatMonth(yearMonth: string): string {
    return formatTargetMonthLabel(yearMonth);
  }

  occasionalPanelNote(): string {
    return `${this.targetYear()}年の固定的賃金変動を対象に、3ヶ月平均を算出します。等級差が2以上の場合、4ヶ月目から適用します。`;
  }

  private async recalculate(): Promise<void> {
    const version = ++this.rebuildVersion;
    this.loading.set(true);
    this.annualResults.set([]);
    this.occasionalResults.set([]);

    const employees = this.employees();
    const targetYear = this.targetYear();
    const determinationMonths = getAnnualDeterminationMonths(targetYear);
    const searchFrom = determinationMonths[0];
    const searchTo = toYearMonthKeyFromParts(targetYear + 1, 3);

    const monthsToLoad = this.collectMonths(searchFrom, searchTo, determinationMonths);

    try {
      const payrollRecords = await this.compensationService.getPayrollRecordsForMonths(monthsToLoad);
      if (version !== this.rebuildVersion) {
        return;
      }

      const payrollSnapshots = this.revisionService.buildPayrollSnapshotMap(payrollRecords);
      const allOccasionalResults = this.revisionService.calculateOccasionalRevisions(
        employees,
        payrollSnapshots,
        toYearMonthKeyFromParts(targetYear, 1),
        toYearMonthKeyFromParts(targetYear, 12)
      );
      const annualResults = this.revisionService.calculateAnnualDeterminations(
        targetYear,
        employees,
        payrollSnapshots,
        allOccasionalResults
      );
      const occasionalResults = allOccasionalResults.filter((result) =>
        result.changeMonth.startsWith(String(targetYear))
      );

      if (version !== this.rebuildVersion) {
        return;
      }

      this.occasionalResults.set(occasionalResults);
      this.annualResults.set(annualResults);
      this.loadError.set('');
    } catch (error) {
      if (version !== this.rebuildVersion) {
        return;
      }

      this.loadError.set(
        error instanceof Error ? error.message : '改定計算に失敗しました'
      );
      this.annualResults.set([]);
      this.occasionalResults.set([]);
    } finally {
      if (version === this.rebuildVersion) {
        this.loading.set(false);
      }
    }
  }

  private collectMonths(from: string, to: string, extra: string[]): string[] {
    const months = new Set<string>(extra);
    let current = from;

    while (current <= to) {
      months.add(current);
      current = getNextYearMonthKey(current);
    }

    return [...months].sort();
  }
}
