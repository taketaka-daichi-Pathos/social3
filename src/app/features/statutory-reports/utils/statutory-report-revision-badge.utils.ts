import { Employee } from '@features/employees/models/employee.model';
import {
  ANNUAL_DETERMINATION_APPLICATION_MONTH,
  findAppliedAnnualRevision,
} from '@features/revision/utils/revision-history.utils';
import { toYearMonthKeyFromParts } from '@features/payroll/utils/compensation.utils';
import { resolveDefaultGeppenRevisionYearMonth } from '@features/statutory-reports/utils/geppen-data.utils';
import { resolveDefaultSanteiTargetYear } from '@features/statutory-reports/utils/santei-data.utils';

/** 算定基礎届カード：対象年の算定基礎が「適用済み」の従業員が1名以上いるか */
export function hasSanteiKisoReportBadge(
  employees: Employee[],
  targetYear = resolveDefaultSanteiTargetYear()
): boolean {
  const applicationMonth = toYearMonthKeyFromParts(
    targetYear,
    ANNUAL_DETERMINATION_APPLICATION_MONTH
  );

  return employees.some(
    (employee) => findAppliedAnnualRevision(employee, targetYear, applicationMonth) != null
  );
}

/** 月額変更届カード：改定年月の随時改定が「適用済み」の従業員が1名以上いるか */
export function hasGetsugakuHenkoReportBadge(
  employees: Employee[],
  revisionYearMonth = resolveDefaultGeppenRevisionYearMonth()
): boolean {
  return employees.some((employee) =>
    (employee.revisionHistory ?? []).some(
      (entry) => entry.type === '随時改定' && entry.applicableMonth === revisionYearMonth
    )
  );
}
