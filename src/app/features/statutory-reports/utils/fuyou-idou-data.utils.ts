import { Dependent } from '@features/dependents/models/dependent.model';
import { Employee } from '@features/employees/models/employee.model';
import { mapDependentsForHealthInsuranceLoss } from '@features/employees/utils/age-event.utils';
import { isAge75HealthLossExportCandidate } from '@features/employees/utils/age-event-notification.utils';
import { getCurrentYearMonthKey } from '@features/payroll/utils/compensation.utils';

/** 扶養異動届 CSV 1行分の出力対象（従業員 + 異動対象扶養家族） */
export interface FuyouIdouExportTarget {
  employee: Employee;
  dependents: Dependent[];
}

/**
 * 従業員マスタ上の全扶養家族を異動届出力対象として返す。
 * 扶養タブで更新された `employee.dependents` をそのまま渡せる。
 */
export function buildFuyouIdouExportTarget(employee: Employee): FuyouIdouExportTarget {
  return {
    employee,
    dependents: [...(employee.dependents ?? [])],
  };
}

export function buildFuyouIdouExportTargets(employees: Employee[]): FuyouIdouExportTarget[] {
  return employees.map((employee) => buildFuyouIdouExportTarget(employee));
}

/** 75歳到達者は扶養家族を喪失理由付きで出力する */
export function buildFuyouIdouExportTargetsWithAgeLoss(employees: Employee[]): FuyouIdouExportTarget[] {
  const referenceMonth = getCurrentYearMonthKey();

  return employees.map((employee) => {
    if (
      isAge75HealthLossExportCandidate(employee, referenceMonth) &&
      (employee.dependents?.length ?? 0) > 0
    ) {
      return buildFuyouIdouExportTargetWithDependents(
        employee,
        mapDependentsForHealthInsuranceLoss(employee.birthDate, employee.dependents ?? [])
      );
    }

    return buildFuyouIdouExportTarget(employee);
  });
}

/** 指定した扶養家族のみを出力対象にする（差分出力用） */
export function buildFuyouIdouExportTargetWithDependents(
  employee: Employee,
  dependents: Dependent[]
): FuyouIdouExportTarget {
  return { employee, dependents: [...dependents] };
}

export function splitDependentsForFuyouIdou(dependents: Dependent[]): {
  spouse: Dependent | null;
  others: Dependent[];
} {
  const spouse = dependents.find((dependent) => dependent.relationship === 'spouse') ?? null;
  const others = dependents.filter((dependent) => dependent.relationship !== 'spouse').slice(0, 3);

  return { spouse, others };
}

export function employeeHasFuyouIdouDependents(employee: Employee): boolean {
  return (employee.dependents?.length ?? 0) > 0;
}

export function targetHasExportableDependents(target: FuyouIdouExportTarget): boolean {
  return target.dependents.length > 0;
}
