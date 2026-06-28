import { inject, Injectable } from '@angular/core';
import { SocialInsuranceCalculatorService } from '@core/services/social-insurance-calculator.service';
import { StandardRemunerationService } from '@core/services/standard-remuneration.service';
import { Employee } from '@features/employees/models/employee.model';
import { PayrollEntry, PayrollRecord } from '@features/payroll/models/compensation.model';
import {
  getAnnualDeterminationMonths,
  getNextYearMonthKey,
  isEmployeeVisibleForTargetMonth,
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
import { resolveOccasionalPriorityOverAnnual, resolveEmployeeMasterCurrentGrades, resolveStandardRemunerationAtMonth, findAppliedOccasionalRevision, findAppliedAnnualRevision, overlayAnnualResultWithRevisionHistory } from '@features/revision/utils/revision-history.utils';
import { assessAnnualDeterminationBonusAdjustment, enrichRevisionMonthDetailsWithBonus, resolveOccasionalRevisionAverageWithBonus } from '@features/revision/utils/annual-determination-bonus.utils';
import { SanteiCalculatorService } from '@features/revision/services/santei-calculator.service';
import { ZuijiCalculatorService } from '@features/revision/services/zuiji-calculator.service';
import {
  evaluateOccasionalRevisionCandidate,
  logOccasionalRevisionDebug,
  normalizeSnapshotFixedWages,
} from '@features/revision/utils/occasional-revision.utils';
import { CompanySettings } from '@features/settings/models/company-settings.model';
import { resolvePayrollInsuranceRates, parseTargetYearMonth } from '@features/payroll/utils/bonus-insurance.utils';
import { emptyPremiumBreakdown } from '@features/payroll/utils/premium-merge.utils';
import { isSocialInsuranceExemptForMonth } from '@features/employees/utils/leave-record.utils';
import { isSocialInsuranceExemptForRetirementMonth } from '@features/employees/utils/retirement.utils';
import {
  parseInsuranceRateTargetDate,
  toRateTargetDateFromYearMonth,
} from '@features/settings/utils/insurance-rate-date.utils';
import {
  getOccasionalRevisionSearchRangeForMonth,
  hasAnnualDeterminationTargetsForMonth,
  hasOccasionalRevisionTargetsForMonth,
} from '@features/payroll/utils/monthly-lock-revision-impact.utils';

const ANNUAL_APPLICATION_MONTH = 9;

const ANNUAL_EXCLUSION_LABELS: Record<AnnualExclusionReason, string> = {
  insufficient_base_days: '基礎日数不足',
  hired_after_june: '6月以降入社のため対象外',
  occasional_revision_scheduled: '随時改定対象のため除外',
  missing_payroll: '給与未保存',
  negative_average_payment: '平均支給額がマイナスのため',
};

const OCCASIONAL_EXCLUSION_LABELS: Record<OccasionalExclusionReason, string> = {
  no_fixed_wage_change: '固定的賃金の変動なし',
  insufficient_base_days: '基礎日数不足',
  grade_difference_under_2: '等級差2未満',
  no_grade_change: '等級変動がないため変更なし',
  fixed_wage_grade_direction_mismatch: '固定的賃金と等級の変動方向不一致',
  missing_payroll: '給与未保存',
  negative_average_payment: '平均支給額がマイナスのため',
};

@Injectable({ providedIn: 'root' })
export class SocialInsuranceRevisionService {
  private readonly standardRemunerationService = inject(StandardRemunerationService);
  private readonly insuranceCalculator = inject(SocialInsuranceCalculatorService);
  private readonly santeiCalculator = inject(SanteiCalculatorService);
  private readonly zuijiCalculator = inject(ZuijiCalculatorService);

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

  /** 月次確定時に算定基礎・随時改定の警告を出すべき従業員がいるか */
  hasRevisionTargetsForMonthLock(
    targetMonth: string,
    employees: Employee[],
    payrollRecords: PayrollRecord[]
  ): boolean {
    const payrollRecord =
      payrollRecords.find((record) => record.targetMonth === targetMonth) ?? null;

    if (
      hasAnnualDeterminationTargetsForMonth(targetMonth, employees, payrollRecord)
    ) {
      return true;
    }

    const payrollSnapshots = this.buildPayrollSnapshotMap(payrollRecords);
    const { searchFrom, searchTo } = getOccasionalRevisionSearchRangeForMonth(targetMonth);
    const occasionalResults = this.calculateOccasionalRevisions(
      employees,
      payrollSnapshots,
      searchFrom,
      searchTo
    );

    return hasOccasionalRevisionTargetsForMonth(targetMonth, occasionalResults);
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
        logOccasionalRevisionDebug({
          employeeNumber: employee.employeeNumber,
          changeMonth: null,
          result: 'skip',
          reason: '給与データなし',
        });
        continue;
      }

      const months = this.listMonthsInclusive(searchFromYearMonth, searchToYearMonth);

      for (let index = 1; index < months.length; index += 1) {
        const changeMonth = months[index];
        const previousMonth = months[index - 1];
        const current = employeeSnapshots.get(changeMonth);
        const previous = employeeSnapshots.get(previousMonth);

        const debugBase = {
          employeeNumber: employee.employeeNumber,
          changeMonth,
          previousMonth,
        };

        if (!current || !previous) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: '給与データなし',
          });
          continue;
        }

        if (
          !isEmployeeVisibleForTargetMonth(employee, changeMonth) ||
          !isEmployeeVisibleForTargetMonth(employee, previousMonth)
        ) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: '対象月の在籍対象外',
          });
          continue;
        }

        if (!current.locked || !previous.locked) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: '給与未保存',
          });
          continue;
        }

        const currentFixedWages = normalizeSnapshotFixedWages(current);
        const previousFixedWages = normalizeSnapshotFixedWages(previous);

        if (!Number.isFinite(currentFixedWages) || !Number.isFinite(previousFixedWages)) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: '固定的賃金が不正',
            currentFixedWages,
            previousFixedWages,
          });
          continue;
        }

        // ① 固定的賃金（基本給＋固定手当）のみの変動を起算月とする
        const fixedWageDiff = currentFixedWages - previousFixedWages;
        if (fixedWageDiff === 0) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: '固定的賃金の変動なし',
            currentFixedWages,
            previousFixedWages,
            fixedWageDiff,
          });
          continue;
        }

        const targetMonths = [
          changeMonth,
          getNextYearMonthKey(changeMonth),
          getNextYearMonthKey(getNextYearMonthKey(changeMonth)),
        ];
        const monthSnapshots = targetMonths.map((yearMonth) => employeeSnapshots.get(yearMonth));

        if (monthSnapshots.some((snapshot) => !snapshot?.locked)) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: '給与未保存',
            targetMonths,
          });
          continue;
        }

        const [firstSnapshot, secondSnapshot, thirdSnapshot] = monthSnapshots as [
          PayrollMonthSnapshot,
          PayrollMonthSnapshot,
          PayrollMonthSnapshot,
        ];

        const firstFixedWages = normalizeSnapshotFixedWages(firstSnapshot);
        const secondFixedWages = normalizeSnapshotFixedWages(secondSnapshot);
        const thirdFixedWages = normalizeSnapshotFixedWages(thirdSnapshot);

        // ② 2・3ヶ月目も起算月と同じ固定的賃金額であること
        if (
          !Number.isFinite(firstFixedWages) ||
          !Number.isFinite(secondFixedWages) ||
          !Number.isFinite(thirdFixedWages) ||
          secondFixedWages !== firstFixedWages ||
          thirdFixedWages !== firstFixedWages
        ) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: '固定的賃金の3ヶ月継続不一致',
            fixedWageDiff,
            firstFixedWages,
            secondFixedWages,
            thirdFixedWages,
          });
          continue;
        }

        const monthDetails = this.zuijiCalculator.buildOccasionalMonthDetailsForEmployee(
          targetMonths,
          monthSnapshots as PayrollMonthSnapshot[],
          employee
        );

        if (!monthDetails.every((row) => row.included)) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: '基礎日数不足',
            fixedWageDiff,
            monthDetails,
          });
          continue;
        }

        const currentGrades = this.resolveRevisionCurrentGrades(employee);
        const currentHealthGrade = currentGrades.healthGrade;
        const currentPensionGrade = currentGrades.pensionGrade;

        // ③ 3ヶ月の報酬月額平均 → 年4回以上賞与の1/12加算 → 等級差判定（適用月は起算月の4ヶ月目）
        const payrollOnlyAverage = Math.round(
          monthDetails.reduce((sum, row) => sum + row.totalPayment, 0) / monthDetails.length
        );

        if (!Number.isFinite(payrollOnlyAverage)) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: '平均支給額が不正',
            fixedWageDiff,
            monthDetails,
          });
          continue;
        }

        const { averagePayment, frequentBonusAdjustment } = resolveOccasionalRevisionAverageWithBonus(
          payrollOnlyAverage,
          employee.bonusHistory,
          changeMonth
        );
        const enrichedMonthDetails = enrichRevisionMonthDetailsWithBonus(
          monthDetails,
          frequentBonusAdjustment.monthlyBonusAllocation
        );

        if (!Number.isFinite(averagePayment)) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: '平均支給額が不正',
            fixedWageDiff,
            monthDetails,
          });
          continue;
        }

        const healthGrade = this.standardRemunerationService.resolveHealthGrade(averagePayment);
        const pensionGrade = this.standardRemunerationService.resolvePensionGrade(averagePayment);
        const proposedHealthStandard = healthGrade?.monthlyAmount ?? null;
        const proposedPensionStandard = pensionGrade?.monthlyAmount ?? null;
        const proposedHealthGrade = healthGrade?.grade ?? null;
        const proposedPensionGrade = pensionGrade?.grade ?? null;
        const applicationMonth = getNextYearMonthKey(targetMonths[2]);

        const appliedEntry = findAppliedOccasionalRevision(
          employee,
          changeMonth,
          applicationMonth
        );
        if (appliedEntry) {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'applied',
            reason: '適用済み',
            fixedWageDiff,
            averagePayment,
            oldHealthGrade: appliedEntry.beforeHealthGrade,
            oldPensionGrade: appliedEntry.beforePensionGrade,
            newHealthGrade: appliedEntry.afterHealthGrade,
            newPensionGrade: appliedEntry.afterPensionGrade,
          });

          results.push({
            employeeId: employee.id,
            employeeName: `${employee.lastName} ${employee.firstName}`,
            employeeNumber: employee.employeeNumber,
            changeMonth,
            status: 'eligible',
            exclusionReasons: [],
            exclusionLabels: [],
            targetMonths,
            monthDetails: enrichedMonthDetails,
            frequentBonusAdjustment,
            averagePayment: appliedEntry.averageAmount ?? averagePayment,
            currentHealthStandard: appliedEntry.beforeHealthAmount,
            currentPensionStandard: appliedEntry.beforePensionAmount,
            currentHealthGrade: appliedEntry.beforeHealthGrade,
            currentPensionGrade: appliedEntry.beforePensionGrade,
            proposedHealthStandard: appliedEntry.afterHealthAmount,
            proposedPensionStandard: appliedEntry.afterPensionAmount,
            proposedHealthGrade: appliedEntry.afterHealthGrade,
            proposedPensionGrade: appliedEntry.afterPensionGrade,
            gradeDifference: Math.max(
              Math.abs(appliedEntry.afterHealthGrade - appliedEntry.beforeHealthGrade),
              Math.abs(appliedEntry.afterPensionGrade - appliedEntry.beforePensionGrade)
            ),
            applicationMonth,
          });
          continue;
        }

        const candidateEvaluation = evaluateOccasionalRevisionCandidate(
          fixedWageDiff,
          currentHealthGrade,
          currentPensionGrade,
          proposedHealthGrade,
          proposedPensionGrade
        );

        if (candidateEvaluation.outcome === 'skip') {
          logOccasionalRevisionDebug({
            ...debugBase,
            result: 'skip',
            reason: candidateEvaluation.reason,
            fixedWageDiff,
            averagePayment,
            oldHealthGrade: currentHealthGrade,
            oldPensionGrade: currentPensionGrade,
            newHealthGrade: proposedHealthGrade,
            newPensionGrade: proposedPensionGrade,
            gradeDifference: candidateEvaluation.gradeDifference,
          });
          continue;
        }

        const exclusionReasons: OccasionalExclusionReason[] = [];
        const exclusionLabels: string[] = [];
        let status: RevisionStatus =
          candidateEvaluation.outcome === 'eligible' ? 'eligible' : 'excluded';
        let resolvedProposedHealthStandard = proposedHealthStandard;
        let resolvedProposedPensionStandard = proposedPensionStandard;
        let resolvedProposedHealthGrade = proposedHealthGrade;
        let resolvedProposedPensionGrade = proposedPensionGrade;
        const gradeDifference = candidateEvaluation.gradeDifference;

        if (
          candidateEvaluation.outcome === 'excluded' &&
          candidateEvaluation.exclusionReason
        ) {
          exclusionReasons.push(candidateEvaluation.exclusionReason);
          exclusionLabels.push(OCCASIONAL_EXCLUSION_LABELS[candidateEvaluation.exclusionReason]);

          if (candidateEvaluation.exclusionReason === 'fixed_wage_grade_direction_mismatch') {
            resolvedProposedHealthStandard = null;
            resolvedProposedPensionStandard = null;
            resolvedProposedHealthGrade = null;
            resolvedProposedPensionGrade = null;
          }
        }

        if (averagePayment < 0) {
          status = 'excluded';
          exclusionReasons.push('negative_average_payment');
          exclusionLabels.push(OCCASIONAL_EXCLUSION_LABELS.negative_average_payment);
          resolvedProposedHealthStandard = null;
          resolvedProposedPensionStandard = null;
          resolvedProposedHealthGrade = null;
          resolvedProposedPensionGrade = null;
        }

        logOccasionalRevisionDebug({
          ...debugBase,
          result: status,
          reason:
            exclusionReasons.length > 0
              ? exclusionLabels.join(' / ')
              : candidateEvaluation.reason,
          fixedWageDiff,
          averagePayment,
          payrollOnlyAverage,
          monthlyBonusAllocation: frequentBonusAdjustment.monthlyBonusAllocation,
          oldHealthGrade: currentHealthGrade,
          oldPensionGrade: currentPensionGrade,
          newHealthGrade: proposedHealthGrade,
          newPensionGrade: proposedPensionGrade,
          gradeDifference,
        });

        results.push({
          employeeId: employee.id,
          employeeName: `${employee.lastName} ${employee.firstName}`,
          employeeNumber: employee.employeeNumber,
          changeMonth,
          status,
          exclusionReasons,
          exclusionLabels,
          targetMonths,
          monthDetails: enrichedMonthDetails,
          frequentBonusAdjustment,
          averagePayment,
          currentHealthStandard: currentGrades.healthStandard,
          currentPensionStandard: currentGrades.pensionStandard,
          currentHealthGrade,
          currentPensionGrade,
          proposedHealthStandard: resolvedProposedHealthStandard,
          proposedPensionStandard: resolvedProposedPensionStandard,
          proposedHealthGrade: resolvedProposedHealthGrade,
          proposedPensionGrade: resolvedProposedPensionGrade,
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

    return employees.map((employee) => {
      const employeeSnapshots = payrollSnapshots.get(employee.id) ?? new Map();
      const applicationMonth = toYearMonthKeyFromParts(targetYear, ANNUAL_APPLICATION_MONTH);
      const currentGrades = this.resolveRevisionCurrentGrades(employee);
      const exclusionReasons: AnnualExclusionReason[] = [];
      const exclusionLabels: string[] = [];

      if (isHiredOnOrAfterJuneFirst(employee, targetYear)) {
        exclusionReasons.push('hired_after_june');
        exclusionLabels.push(ANNUAL_EXCLUSION_LABELS.hired_after_june);
      }

      const prioritizedOccasionalApplicationMonth = resolveOccasionalPriorityOverAnnual(
        employee,
        targetYear,
        occasionalRevisions
      );
      let occasionalPriorityApplicationMonth: string | null = null;

      if (prioritizedOccasionalApplicationMonth) {
        exclusionReasons.push('occasional_revision_scheduled');
        occasionalPriorityApplicationMonth = prioritizedOccasionalApplicationMonth;
        exclusionLabels.push(
          this.buildOccasionalPriorityLabel(prioritizedOccasionalApplicationMonth)
        );
      }

      const hireMonth = toYearMonthKey(employee.hireDate);
      const validMonths = determinationMonths.filter((yearMonth) => hireMonth <= yearMonth);
      const bonusAssessment = assessAnnualDeterminationBonusAdjustment(
        employee.bonusHistory,
        targetYear
      );
      const monthlyBonusAddition = bonusAssessment.applied
        ? bonusAssessment.monthlyBonusAllocation
        : 0;

      const monthEvaluations = this.santeiCalculator.buildAnnualDeterminationEvaluations(
        employee,
        validMonths,
        employeeSnapshots
      );

      const monthDetails = validMonths.map((yearMonth) => {
        const snapshot = employeeSnapshots.get(yearMonth);
        const evaluation = monthEvaluations.get(yearMonth) ?? {
          included: false,
          calculationAmount: 0,
          note: '給与未保存',
        };
        const payrollTotal = evaluation.calculationAmount;

        return {
          yearMonth,
          baseDays: snapshot?.baseDays ?? 0,
          totalPayment: payrollTotal,
          bonusAddition: monthlyBonusAddition,
          adjustedTotalPayment: payrollTotal + monthlyBonusAddition,
          included: evaluation.included,
          note: evaluation.note,
        };
      });

      const includedRows = monthDetails.filter((row) => row.included);
      const uniqueExclusions = [...new Set(exclusionReasons)];

      let averagePayment: number | null = null;
      let payrollOnlyAverage: number | null = null;
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
        proposedHealthStandard = currentGrades.healthStandard;
        proposedPensionStandard = currentGrades.pensionStandard;
        proposedHealthGrade =
          currentGrades.healthGrade ??
          this.standardRemunerationService.findHealthGradeByAmount(currentGrades.healthStandard)
            ?.grade ??
          null;
        proposedPensionGrade =
          currentGrades.pensionGrade ??
          this.standardRemunerationService.findPensionGradeByAmount(currentGrades.pensionStandard)
            ?.grade ??
          null;
        hasGradeChange = false;
        status = 'applied';
      } else {
        payrollOnlyAverage = Math.round(
          includedRows.reduce((sum, row) => sum + row.totalPayment, 0) / includedRows.length
        );
        averagePayment = Math.round(
          includedRows.reduce((sum, row) => sum + row.adjustedTotalPayment, 0) /
            includedRows.length
        );

        if (averagePayment < 0) {
          status = 'excluded';
          exclusionReasons.push('negative_average_payment');
          exclusionLabels.push(ANNUAL_EXCLUSION_LABELS.negative_average_payment);
        } else {
          const healthGrade = this.standardRemunerationService.resolveHealthGrade(averagePayment);
          const pensionGrade = this.standardRemunerationService.resolvePensionGrade(averagePayment);
          proposedHealthStandard = healthGrade?.monthlyAmount ?? null;
          proposedPensionStandard = pensionGrade?.monthlyAmount ?? null;
          proposedHealthGrade = healthGrade?.grade ?? null;
          proposedPensionGrade = pensionGrade?.grade ?? null;

          hasGradeChange =
            proposedHealthStandard !== currentGrades.healthStandard ||
            proposedPensionStandard !== currentGrades.pensionStandard;

          status = hasGradeChange ? 'eligible' : 'applied';
        }
      }

      const row: AnnualDeterminationResult = {
        employeeId: employee.id,
        employeeName: `${employee.lastName} ${employee.firstName}`,
        employeeNumber: employee.employeeNumber,
        targetYear,
        status,
        exclusionReasons: [...new Set(exclusionReasons)],
        exclusionLabels: [
          ...new Set([
            ...exclusionLabels,
            ...exclusionReasons.map((reason) => ANNUAL_EXCLUSION_LABELS[reason]),
          ]),
        ],
        occasionalPriorityApplicationMonth,
        validMonths: includedRows.map((row) => row.yearMonth),
        monthDetails,
        frequentBonusAdjustment: {
          ...bonusAssessment,
          payrollOnlyAverage,
        },
        averagePayment,
        currentHealthStandard: currentGrades.healthStandard,
        currentPensionStandard: currentGrades.pensionStandard,
        currentHealthGrade:
          currentGrades.healthGrade ??
          this.standardRemunerationService.findHealthGradeByAmount(currentGrades.healthStandard)
            ?.grade ??
          null,
        currentPensionGrade:
          currentGrades.pensionGrade ??
          this.standardRemunerationService.findPensionGradeByAmount(currentGrades.pensionStandard)
            ?.grade ??
          null,
        proposedHealthStandard,
        proposedPensionStandard,
        proposedHealthGrade,
        proposedPensionGrade,
        applicationMonth,
        hasGradeChange,
      };

      if (findAppliedAnnualRevision(employee, targetYear, applicationMonth)) {
        return overlayAnnualResultWithRevisionHistory(row, employee);
      }

      return row;
    });
  }

  getEffectiveStandardRemuneration(
    employee: Employee,
    targetYearMonth: string
  ): EffectiveStandardRemuneration {
    return this.getEffectiveStandardRemunerationFromHistory(employee, targetYearMonth);
  }

  getEffectiveStandardRemunerationFromHistory(
    employee: Employee,
    targetYearMonth: string
  ): EffectiveStandardRemuneration {
    const resolved = resolveStandardRemunerationAtMonth(employee, targetYearMonth);
    const healthGrade = this.standardRemunerationService.findHealthGradeByAmount(
      resolved.healthStandard
    );
    const pensionGrade = this.standardRemunerationService.findPensionGradeByAmount(
      resolved.pensionStandard
    );

    return {
      healthStandard: resolved.healthStandard,
      pensionStandard: resolved.pensionStandard,
      healthGrade: healthGrade?.grade ?? null,
      pensionGrade: pensionGrade?.grade ?? null,
      source: resolved.source,
      applicationMonth: resolved.applicationMonth,
    };
  }

  /** @deprecated 履歴ベースの getEffectiveStandardRemuneration を使用してください */
  getEffectiveStandardRemunerationFromCalculations(
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
    company: CompanySettings | null = null,
    options: { forEmployeeListEstimate?: boolean } = {}
  ) {
    const parsedTarget = parseTargetYearMonth(targetYearMonth);
    const rateTargetDate = toRateTargetDateFromYearMonth(targetYearMonth);

    console.log('[Debug] SocialInsuranceRevisionService.calculatePremiumsForEmployee 呼び出し:', {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      targetYearMonth,
      parsedTarget,
      targetYear: parsedTarget?.targetYear,
      targetMonth: parsedTarget?.targetMonth,
      prefecture: company?.prefecture ?? null,
      forEmployeeListEstimate: options.forEmployeeListEstimate ?? false,
    });

    if (!parsedTarget && !options.forEmployeeListEstimate) {
      console.warn(
        '[Debug] targetYear / targetMonth が未解析です。rateTargetDate にフォールバックします:',
        rateTargetDate
      );
    }

    const referenceDate = parseInsuranceRateTargetDate(rateTargetDate) ?? new Date();
    const age = this.insuranceCalculator.calculateAge(employee.birthDate, referenceDate);
    const isLongTermCareInsured = this.insuranceCalculator.resolveLongTermCareInclusion(
      employee.birthDate,
      targetYearMonth
    );

    const effective = options.forEmployeeListEstimate
      ? this.buildEmployeeListEffectiveRemuneration(employee)
      : this.getEffectiveStandardRemunerationFromHistory(employee, targetYearMonth);

    if (
      isSocialInsuranceExemptForMonth(employee, targetYearMonth) ||
      isSocialInsuranceExemptForRetirementMonth(employee, targetYearMonth)
    ) {
      return {
        effective,
        age,
        isLongTermCareInsured,
        premiums: emptyPremiumBreakdown(),
      };
    }

    const rates = parsedTarget
      ? resolvePayrollInsuranceRates(company, parsedTarget)
      : resolvePayrollInsuranceRates(company, rateTargetDate);

    const premiums = this.insuranceCalculator.applyAgePremiumExemptions(
      this.insuranceCalculator.calculatePremiums(
        effective.healthStandard,
        effective.pensionStandard,
        isLongTermCareInsured,
        rates.healthRate,
        rates.longTermCareRate * 100
      ),
      employee.birthDate,
      targetYearMonth
    );

    return { effective, age, isLongTermCareInsured, premiums };
  }

  private buildEmployeeListEffectiveRemuneration(employee: Employee): EffectiveStandardRemuneration {
    const master = this.resolveRevisionCurrentGrades(employee);

    return {
      healthStandard: master.healthStandard,
      pensionStandard: master.pensionStandard,
      healthGrade: master.healthGrade,
      pensionGrade: master.pensionGrade,
      source: 'employee_master',
      applicationMonth: null,
    };
  }

  private resolveRevisionCurrentGrades(employee: Employee): {
    healthStandard: number;
    pensionStandard: number;
    healthGrade: number | null;
    pensionGrade: number | null;
  } {
    const master = resolveEmployeeMasterCurrentGrades(employee);

    return {
      healthStandard: master.healthStandard,
      pensionStandard: master.pensionStandard,
      healthGrade:
        master.healthGrade ??
        this.standardRemunerationService.findHealthGradeByAmount(master.healthStandard)?.grade ??
        null,
      pensionGrade:
        master.pensionGrade ??
        this.standardRemunerationService.findPensionGradeByAmount(master.pensionStandard)?.grade ??
        null,
    };
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

  private buildOccasionalPriorityLabel(applicationMonth: string): string {
    const month = parseYearMonthKey(applicationMonth).month;
    return `${month}月随時改定を優先`;
  }
}
