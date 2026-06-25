import { inject, Injectable } from '@angular/core';
import { SocialInsuranceCalculatorService } from '@core/services/social-insurance-calculator.service';
import { StandardRemunerationService } from '@core/services/standard-remuneration.service';
import { Employee } from '@features/employees/models/employee.model';
import { PayrollEntry, PayrollRecord } from '@features/payroll/models/compensation.model';
import {
  getAnnualDeterminationMonths,
  getNextYearMonthKey,
  getPreviousYearMonthKey,
  isHiredOnOrAfterJuneFirst,
  parseYearMonthKey,
  payrollEntryToSnapshot,
  toYearMonthKey,
  toYearMonthKeyFromParts,
} from '@features/payroll/utils/compensation.utils';
import {
  AnnualDeterminationResult,
  AnnualExclusionReason,
  EffectiveStandardRemuneration,
  OccasionalExclusionReason,
  OccasionalRevisionResult,
  PayrollMonthSnapshot,
  RevisionStatus,
} from '@features/revision/models/revision.model';

const MIN_BASE_DAYS = 17;
const ANNUAL_APPLICATION_MONTH = 9;
const OCCASIONAL_MIN_GRADE_DIFF = 2;

const ANNUAL_EXCLUSION_LABELS: Record<AnnualExclusionReason, string> = {
  insufficient_base_days: '基礎日数不足',
  hired_after_june: '6月以降入社のため対象外',
  occasional_revision_scheduled: '随時改定対象のため除外',
  missing_payroll: '給与未保存',
};

const OCCASIONAL_EXCLUSION_LABELS: Record<OccasionalExclusionReason, string> = {
  no_fixed_wage_change: '固定的賃金の変動なし',
  insufficient_base_days: '基礎日数不足',
  grade_difference_under_2: '等級差2未満',
  missing_payroll: '給与未保存',
};

@Injectable({ providedIn: 'root' })
export class SocialInsuranceRevisionService {
  private readonly standardRemunerationService = inject(StandardRemunerationService);
  private readonly insuranceCalculator = inject(SocialInsuranceCalculatorService);

  buildPayrollSnapshotMap(records: PayrollRecord[]): Map<string, Map<string, PayrollMonthSnapshot>> {
    const map = new Map<string, Map<string, PayrollMonthSnapshot>>();

    for (const record of records) {
      for (const entry of record.entries) {
        if (!entry.locked) {
          continue;
        }

        const snapshot = this.entryToSnapshot(record.targetMonth, entry);
        if (!map.has(entry.employeeId)) {
          map.set(entry.employeeId, new Map());
        }

        map.get(entry.employeeId)!.set(record.targetMonth, snapshot);
      }
    }

    return map;
  }

  calculateOccasionalRevisions(
    employees: Employee[],
    payrollSnapshots: Map<string, Map<string, PayrollMonthSnapshot>>,
    searchFromYearMonth: string,
    searchToYearMonth: string
  ): OccasionalRevisionResult[] {
    const results: OccasionalRevisionResult[] = [];

    for (const employee of employees) {
      const employeeSnapshots = payrollSnapshots.get(employee.id);
      if (!employeeSnapshots) {
        continue;
      }

      const months = this.listMonthsInclusive(searchFromYearMonth, searchToYearMonth);

      for (let index = 1; index < months.length; index += 1) {
        const changeMonth = months[index];
        const previousMonth = months[index - 1];
        const current = employeeSnapshots.get(changeMonth);
        const previous = employeeSnapshots.get(previousMonth);

        if (!current || !previous) {
          continue;
        }

        if (current.fixedWages === previous.fixedWages) {
          continue;
        }

        const targetMonths = [
          changeMonth,
          getNextYearMonthKey(changeMonth),
          getNextYearMonthKey(getNextYearMonthKey(changeMonth)),
        ];
        const monthDetails = targetMonths.map((yearMonth) => {
          const snapshot = employeeSnapshots.get(yearMonth);
          const included = Boolean(snapshot && snapshot.baseDays >= MIN_BASE_DAYS && snapshot.locked);

          return {
            yearMonth,
            baseDays: snapshot?.baseDays ?? 0,
            totalPayment: snapshot?.totalPayment ?? 0,
            included,
            note:
              !snapshot || !snapshot.locked
                ? '給与未保存'
                : snapshot.baseDays < MIN_BASE_DAYS
                  ? '基礎日数不足'
                  : null,
          };
        });

        const exclusionReasons: OccasionalExclusionReason[] = [];
        const allIncluded = monthDetails.every((row) => row.included);

        if (!allIncluded) {
          exclusionReasons.push('insufficient_base_days');
        }

        let averagePayment: number | null = null;
        let proposedHealthStandard: number | null = null;
        let proposedPensionStandard: number | null = null;
        let proposedHealthGrade: number | null = null;
        let proposedPensionGrade: number | null = null;
        let gradeDifference: number | null = null;
        let applicationMonth: string | null = null;
        let status: RevisionStatus = 'excluded';

        if (allIncluded) {
          averagePayment = Math.round(
            monthDetails.reduce((sum, row) => sum + row.totalPayment, 0) / monthDetails.length
          );
          const healthGrade = this.standardRemunerationService.resolveHealthGrade(averagePayment);
          const pensionGrade = this.standardRemunerationService.resolvePensionGrade(averagePayment);
          proposedHealthStandard = healthGrade?.monthlyAmount ?? null;
          proposedPensionStandard = pensionGrade?.monthlyAmount ?? null;
          proposedHealthGrade = healthGrade?.grade ?? null;
          proposedPensionGrade = pensionGrade?.grade ?? null;

          const currentHealthGrade =
            this.standardRemunerationService.findHealthGradeByAmount(
              employee.healthStandardRemuneration
            )?.grade ?? 0;
          const currentPensionGrade =
            this.standardRemunerationService.findPensionGradeByAmount(
              employee.pensionStandardRemuneration
            )?.grade ?? 0;

          gradeDifference = Math.max(
            Math.abs((proposedHealthGrade ?? 0) - currentHealthGrade),
            Math.abs((proposedPensionGrade ?? 0) - currentPensionGrade)
          );

          if (gradeDifference >= OCCASIONAL_MIN_GRADE_DIFF) {
            status = 'eligible';
            applicationMonth = getNextYearMonthKey(targetMonths[2]);
          } else {
            exclusionReasons.push('grade_difference_under_2');
          }
        } else {
          exclusionReasons.push('missing_payroll');
        }

        results.push({
          employeeId: employee.id,
          employeeName: `${employee.lastName} ${employee.firstName}`,
          employeeNumber: employee.employeeNumber,
          changeMonth,
          status,
          exclusionReasons,
          exclusionLabels: exclusionReasons.map((reason) => OCCASIONAL_EXCLUSION_LABELS[reason]),
          targetMonths,
          monthDetails,
          averagePayment,
          currentHealthStandard: employee.healthStandardRemuneration,
          currentPensionStandard: employee.pensionStandardRemuneration,
          proposedHealthStandard,
          proposedPensionStandard,
          proposedHealthGrade,
          proposedPensionGrade,
          gradeDifference,
          applicationMonth,
        });
      }
    }

    return results.sort((a, b) => a.changeMonth.localeCompare(b.changeMonth));
  }

  calculateAnnualDeterminations(
    targetYear: number,
    employees: Employee[],
    payrollSnapshots: Map<string, Map<string, PayrollMonthSnapshot>>,
    occasionalRevisions: OccasionalRevisionResult[]
  ): AnnualDeterminationResult[] {
    const determinationMonths = getAnnualDeterminationMonths(targetYear);
    const scheduledOccasional = occasionalRevisions.filter(
      (revision) =>
        revision.status === 'eligible' &&
        revision.applicationMonth != null &&
        ['07', '08', '09'].includes(revision.applicationMonth.split('-')[1])
    );

    return employees.map((employee) => {
      const employeeSnapshots = payrollSnapshots.get(employee.id) ?? new Map();
      const exclusionReasons: AnnualExclusionReason[] = [];
      const exclusionLabels: string[] = [];

      if (isHiredOnOrAfterJuneFirst(employee, targetYear)) {
        exclusionReasons.push('hired_after_june');
        exclusionLabels.push(ANNUAL_EXCLUSION_LABELS.hired_after_june);
      }

      const isOccasionalTarget = scheduledOccasional.some(
        (revision) =>
          revision.employeeId === employee.id &&
          revision.applicationMonth!.startsWith(String(targetYear))
      );

      if (isOccasionalTarget) {
        exclusionReasons.push('occasional_revision_scheduled');
        exclusionLabels.push(ANNUAL_EXCLUSION_LABELS.occasional_revision_scheduled);
      }

      const hireMonth = toYearMonthKey(employee.hireDate);
      const validMonths = determinationMonths.filter((yearMonth) => hireMonth <= yearMonth);

      const monthDetails = validMonths.map((yearMonth) => {
        const snapshot = employeeSnapshots.get(yearMonth);
        const included = Boolean(snapshot && snapshot.locked && snapshot.baseDays >= MIN_BASE_DAYS);

        if (!snapshot || !snapshot.locked) {
          exclusionReasons.push('missing_payroll');
        } else if (snapshot.baseDays < MIN_BASE_DAYS) {
          exclusionReasons.push('insufficient_base_days');
        }

        return {
          yearMonth,
          baseDays: snapshot?.baseDays ?? 0,
          totalPayment: snapshot?.totalPayment ?? 0,
          included,
          note: !snapshot || !snapshot.locked
            ? '給与未保存'
            : snapshot.baseDays < MIN_BASE_DAYS
              ? '基礎日数不足'
              : null,
        };
      });

      const includedRows = monthDetails.filter((row) => row.included);
      const uniqueExclusions = [...new Set(exclusionReasons)];
      const labels = uniqueExclusions.map((reason) => ANNUAL_EXCLUSION_LABELS[reason]);

      let averagePayment: number | null = null;
      let proposedHealthStandard: number | null = null;
      let proposedPensionStandard: number | null = null;
      let proposedHealthGrade: number | null = null;
      let proposedPensionGrade: number | null = null;
      let status: RevisionStatus = 'pending';
      let hasGradeChange = false;

      const hasBlockingExclusion =
        uniqueExclusions.includes('hired_after_june') ||
        uniqueExclusions.includes('occasional_revision_scheduled');

      if (hasBlockingExclusion) {
        status = 'excluded';
      } else if (includedRows.length === 0) {
        status = 'excluded';
      } else if (includedRows.length < validMonths.length) {
        status = 'excluded';
      } else {
        averagePayment = Math.round(
          includedRows.reduce((sum, row) => sum + row.totalPayment, 0) / includedRows.length
        );
        const healthGrade = this.standardRemunerationService.resolveHealthGrade(averagePayment);
        const pensionGrade = this.standardRemunerationService.resolvePensionGrade(averagePayment);
        proposedHealthStandard = healthGrade?.monthlyAmount ?? null;
        proposedPensionStandard = pensionGrade?.monthlyAmount ?? null;
        proposedHealthGrade = healthGrade?.grade ?? null;
        proposedPensionGrade = pensionGrade?.grade ?? null;

        hasGradeChange =
          proposedHealthStandard !== employee.healthStandardRemuneration ||
          proposedPensionStandard !== employee.pensionStandardRemuneration;

        status = hasGradeChange ? 'eligible' : 'applied';
      }

      return {
        employeeId: employee.id,
        employeeName: `${employee.lastName} ${employee.firstName}`,
        employeeNumber: employee.employeeNumber,
        targetYear,
        status,
        exclusionReasons: uniqueExclusions,
        exclusionLabels: [...new Set([...exclusionLabels, ...labels])],
        validMonths: includedRows.map((row) => row.yearMonth),
        monthDetails,
        averagePayment,
        currentHealthStandard: employee.healthStandardRemuneration,
        currentPensionStandard: employee.pensionStandardRemuneration,
        proposedHealthStandard,
        proposedPensionStandard,
        proposedHealthGrade,
        proposedPensionGrade,
        applicationMonth: toYearMonthKeyFromParts(targetYear, ANNUAL_APPLICATION_MONTH),
        hasGradeChange,
      };
    });
  }

  getEffectiveStandardRemuneration(
    employee: Employee,
    targetYearMonth: string,
    annualResults: AnnualDeterminationResult[],
    occasionalResults: OccasionalRevisionResult[]
  ): EffectiveStandardRemuneration {
    let healthStandard = employee.healthStandardRemuneration;
    let pensionStandard = employee.pensionStandardRemuneration;
    let source: EffectiveStandardRemuneration['source'] = 'employee_master';
    let applicationMonth: string | null = null;

    const annual = annualResults.find(
      (result) =>
        result.employeeId === employee.id &&
        (result.status === 'eligible' || result.status === 'applied') &&
        result.proposedHealthStandard != null &&
        targetYearMonth >= result.applicationMonth
    );

    if (annual?.proposedHealthStandard != null && annual.proposedPensionStandard != null) {
      healthStandard = annual.proposedHealthStandard;
      pensionStandard = annual.proposedPensionStandard;
      source = 'annual_determination';
      applicationMonth = annual.applicationMonth;
    }

    const applicableOccasional = occasionalResults
      .filter(
        (result) =>
          result.employeeId === employee.id &&
          result.status === 'eligible' &&
          result.applicationMonth != null &&
          targetYearMonth >= result.applicationMonth &&
          result.proposedHealthStandard != null
      )
      .sort((a, b) => a.applicationMonth!.localeCompare(b.applicationMonth!))
      .at(-1);

    if (
      applicableOccasional?.proposedHealthStandard != null &&
      applicableOccasional.proposedPensionStandard != null
    ) {
      healthStandard = applicableOccasional.proposedHealthStandard;
      pensionStandard = applicableOccasional.proposedPensionStandard;
      source = 'occasional_revision';
      applicationMonth = applicableOccasional.applicationMonth;
    }

    const healthGrade = this.standardRemunerationService.findHealthGradeByAmount(healthStandard);
    const pensionGrade = this.standardRemunerationService.findPensionGradeByAmount(pensionStandard);

    return {
      healthStandard,
      pensionStandard,
      healthGrade: healthGrade?.grade ?? null,
      pensionGrade: pensionGrade?.grade ?? null,
      source,
      applicationMonth,
    };
  }

  calculatePremiumsForEmployee(
    employee: Employee,
    targetYearMonth: string,
    annualResults: AnnualDeterminationResult[],
    occasionalResults: OccasionalRevisionResult[]
  ) {
    const effective = this.getEffectiveStandardRemuneration(
      employee,
      targetYearMonth,
      annualResults,
      occasionalResults
    );
    const age = this.insuranceCalculator.calculateAge(employee.birthDate);
    const isLongTermCareInsured = this.insuranceCalculator.isLongTermCareInsured(age);
    const premiums = this.insuranceCalculator.calculatePremiums(
      effective.healthStandard,
      effective.pensionStandard,
      isLongTermCareInsured
    );

    return { effective, age, isLongTermCareInsured, premiums };
  }

  private entryToSnapshot(targetMonth: string, entry: PayrollEntry): PayrollMonthSnapshot {
    const normalized = payrollEntryToSnapshot(entry);

    return {
      yearMonth: targetMonth,
      ...normalized,
    };
  }

  private listMonthsInclusive(from: string, to: string): string[] {
    const months: string[] = [];
    let current = from;

    while (current <= to) {
      months.push(current);
      current = getNextYearMonthKey(current);
    }

    return months;
  }
}
