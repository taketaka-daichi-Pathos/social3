import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompensationService } from '@core/services/compensation.service';
import { EmployeeService } from '@core/services/employee.service';
import { SocialInsuranceRevisionService } from '@core/services/social-insurance-revision.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { getPremiumTotals } from '@features/employees/utils/employee-display.utils';
import { Employee } from '@features/employees/models/employee.model';
import {
  filterEmployeesForTargetMonth,
  filterEmployeesWithLockedPayroll,
  formatTargetMonthLabel,
  getCurrentYearMonthKey,
  getLockedPayrollEmployeeIds,
  getNextYearMonthKey,
  getPreviousYearMonthKey,
  listFiscalYearMonthsUpTo,
  parseYearMonthKey,
  toYearMonthKeyFromParts,
} from '@features/payroll/utils/compensation.utils';
import {
  loadStoredTargetMonth,
  PAYROLL_STORAGE_KEYS,
  saveStoredTargetMonth,
} from '@features/payroll/utils/payroll-storage.utils';
import {
  AnnualDeterminationResult,
  EffectiveStandardRemuneration,
  OccasionalRevisionResult,
} from '@features/revision/models/revision.model';
import { PayrollRecord } from '@features/payroll/models/compensation.model';
import { SocialInsurancePremiumBreakdown } from '@core/models/social-insurance.model';
import { YearSelectComponent } from '@shared/components/year-select/year-select.component';

interface EmployeePremiumRow {
  employee: Employee;
  effective: EffectiveStandardRemuneration;
  premiums: SocialInsurancePremiumBreakdown;
  totals: ReturnType<typeof getPremiumTotals>;
}

interface CumulativeTotals {
  healthEmployee: number;
  healthEmployer: number;
  longTermCareEmployee: number;
  longTermCareEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  employeeShare: number;
  employerShare: number;
  total: number;
}

@Component({
  selector: 'app-monthly-insurance-premium-table',
  standalone: true,
  imports: [DecimalPipe, YearSelectComponent],
  templateUrl: './monthly-insurance-premium-table.component.html',
  styleUrl: './monthly-insurance-premium-table.component.scss',
})
export class MonthlyInsurancePremiumTableComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly employeeService = inject(EmployeeService);
  private readonly compensationService = inject(CompensationService);
  private readonly revisionService = inject(SocialInsuranceRevisionService);

  readonly targetMonth = signal(getCurrentYearMonthKey());
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly rows = signal<EmployeePremiumRow[]>([]);
  readonly cumulative = signal<CumulativeTotals | null>(null);
  readonly fiscalYearLabel = signal('');
  readonly emptyMessage = signal('');

  readonly monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);

  private readonly employees = signal<Employee[]>([]);
  private rebuildVersion = 0;

  ngOnInit(): void {
    const storedMonth = loadStoredTargetMonth(
      PAYROLL_STORAGE_KEYS.insurance,
      getCurrentYearMonthKey()
    );
    this.targetMonth.set(storedMonth);

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => {
          this.employees.set(employees);
          this.loadError.set('');
          void this.rebuild();
        },
        error: (error) => {
          this.loadError.set(
            error instanceof Error && error.message === 'ログインしていません'
              ? 'ログインしていません。再度ログインしてください。'
              : toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました')
          );
          this.rows.set([]);
          this.cumulative.set(null);
          this.loading.set(false);
        },
      });
  }

  targetMonthLabel(): string {
    return formatTargetMonthLabel(this.targetMonth());
  }

  selectedYear(): number {
    return parseYearMonthKey(this.targetMonth()).year;
  }

  selectedMonth(): number {
    return parseYearMonthKey(this.targetMonth()).month;
  }

  goToPreviousMonth(): void {
    this.setTargetMonth(getPreviousYearMonthKey(this.targetMonth()));
  }

  goToNextMonth(): void {
    this.setTargetMonth(getNextYearMonthKey(this.targetMonth()));
  }

  onYearSelected(year: number): void {
    this.setTargetMonth(toYearMonthKeyFromParts(year, this.selectedMonth()));
  }

  onMonthChange(event: Event): void {
    const month = Number((event.target as HTMLSelectElement).value);
    this.setTargetMonth(toYearMonthKeyFromParts(this.selectedYear(), month));
  }

  revisionSourceLabel(source: EffectiveStandardRemuneration['source']): string {
    switch (source) {
      case 'annual_determination':
        return '算定基礎';
      case 'occasional_revision':
        return '随時改定';
      default:
        return 'マスタ';
    }
  }

  private setTargetMonth(yearMonth: string): void {
    this.targetMonth.set(yearMonth);
    saveStoredTargetMonth(PAYROLL_STORAGE_KEYS.insurance, yearMonth);
    void this.rebuild();
  }

  private async rebuild(): Promise<void> {
    const employees = this.employees();
    const version = ++this.rebuildVersion;
    this.loading.set(true);

    const targetMonth = this.targetMonth();
    const fiscalMonths = listFiscalYearMonthsUpTo(targetMonth);
    const { year, month } = parseYearMonthKey(targetMonth);
    const fiscalStartYear = month >= 4 ? year : year - 1;
    this.fiscalYearLabel.set(`${fiscalStartYear}年度（4月〜${this.targetMonthLabel()}）`);

    const searchFrom = fiscalMonths[0] ?? targetMonth;
    const searchTo = getNextYearMonthKey(getNextYearMonthKey(targetMonth));
    const monthsToLoad = this.collectMonthsForRevision(searchFrom, searchTo, fiscalMonths);

    try {
      const payrollRecords = await this.compensationService.getPayrollRecordsForMonths(monthsToLoad);
      if (version !== this.rebuildVersion) {
        return;
      }

      const payrollRecordByMonth = new Map<string, PayrollRecord>(
        payrollRecords.map((record) => [record.targetMonth, record])
      );
      const targetPayrollRecord = payrollRecordByMonth.get(targetMonth) ?? null;

      const payrollSnapshots = this.revisionService.buildPayrollSnapshotMap(payrollRecords);
      const occasionalResults = this.revisionService.calculateOccasionalRevisions(
        employees,
        payrollSnapshots,
        searchFrom,
        searchTo
      );

      const annualYears = this.collectAnnualYears(fiscalMonths, targetMonth);
      const annualResults = annualYears.flatMap((targetYear) =>
        this.revisionService.calculateAnnualDeterminations(
          targetYear,
          employees,
          payrollSnapshots,
          occasionalResults
        )
      );

      const eligibleEmployees = filterEmployeesWithLockedPayroll(
        employees,
        targetMonth,
        targetPayrollRecord
      );
      const visibleEmployees = filterEmployeesForTargetMonth(employees, targetMonth);

      const currentRows = eligibleEmployees.map((employee) => {
        const { effective, premiums } = this.revisionService.calculatePremiumsForEmployee(
          employee,
          targetMonth,
          annualResults,
          occasionalResults
        );
        const totals = getPremiumTotals({
          age: 0,
          isLongTermCareInsured: false,
          healthGrade: null,
          pensionGrade: null,
          premiums,
        });

        return { employee, effective, premiums, totals };
      });

      const cumulative = this.calculateCumulativeTotals(
        employees,
        fiscalMonths,
        payrollRecordByMonth,
        annualResults,
        occasionalResults
      );

      if (version !== this.rebuildVersion) {
        return;
      }

      this.rows.set(currentRows);
      this.cumulative.set(cumulative);
      this.emptyMessage.set(
        currentRows.length === 0 && visibleEmployees.length > 0
          ? '該当月の月次給与が確定されていないため、保険料を表示できません'
          : '対象月に該当する従業員がいません'
      );
      this.loadError.set('');
    } catch (error) {
      if (version !== this.rebuildVersion) {
        return;
      }

      this.loadError.set(
        error instanceof Error ? error.message : '保険料の計算に失敗しました'
      );
      this.rows.set([]);
      this.cumulative.set(null);
    } finally {
      if (version === this.rebuildVersion) {
        this.loading.set(false);
      }
    }
  }

  private calculateCumulativeTotals(
    employees: Employee[],
    fiscalMonths: string[],
    payrollRecordByMonth: Map<string, PayrollRecord>,
    annualResults: AnnualDeterminationResult[],
    occasionalResults: OccasionalRevisionResult[]
  ): CumulativeTotals {
    const totals: CumulativeTotals = {
      healthEmployee: 0,
      healthEmployer: 0,
      longTermCareEmployee: 0,
      longTermCareEmployer: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      employeeShare: 0,
      employerShare: 0,
      total: 0,
    };

    for (const yearMonth of fiscalMonths) {
      const payrollRecord = payrollRecordByMonth.get(yearMonth) ?? null;
      const lockedIds = getLockedPayrollEmployeeIds(payrollRecord);

      for (const employee of employees) {
        if (filterEmployeesForTargetMonth([employee], yearMonth).length === 0) {
          continue;
        }

        if (!lockedIds.has(employee.id)) {
          continue;
        }

        const { premiums } = this.revisionService.calculatePremiumsForEmployee(
          employee,
          yearMonth,
          annualResults,
          occasionalResults
        );
        const rowTotals = getPremiumTotals({
          age: 0,
          isLongTermCareInsured: false,
          healthGrade: null,
          pensionGrade: null,
          premiums,
        });

        totals.healthEmployee += premiums.health.employeeShare;
        totals.healthEmployer += premiums.health.employerShare;
        totals.longTermCareEmployee += premiums.longTermCare.employeeShare;
        totals.longTermCareEmployer += premiums.longTermCare.employerShare;
        totals.pensionEmployee += premiums.pension.employeeShare;
        totals.pensionEmployer += premiums.pension.employerShare;
        totals.employeeShare += rowTotals.employeeShare;
        totals.employerShare += rowTotals.employerShare;
        totals.total += rowTotals.total;
      }
    }

    return totals;
  }

  private collectMonthsForRevision(from: string, to: string, fiscalMonths: string[]): string[] {
    const months = new Set<string>([...fiscalMonths, from, to]);

    let current = from;
    while (current <= to) {
      months.add(current);
      current = getNextYearMonthKey(current);
    }

    return [...months].sort();
  }

  private collectAnnualYears(fiscalMonths: string[], targetMonth: string): number[] {
    const years = new Set<number>();

    for (const yearMonth of [...fiscalMonths, targetMonth]) {
      years.add(parseYearMonthKey(yearMonth).year);
    }

    return [...years];
  }
}
