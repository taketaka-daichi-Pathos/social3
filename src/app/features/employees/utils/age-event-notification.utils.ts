import { Employee } from '@features/employees/models/employee.model';
import {
  AgeMilestoneEvent,
  detectAgeEventsForMonth,
  hasReachedHealthInsuranceLossMonth,
  hasReachedPensionInsuranceLossMonth,
} from '@features/employees/utils/age-event.utils';
import { isAfterRetirementMonth, isRetiredEmployee } from '@features/employees/utils/retirement.utils';
import { employeeFullName } from '@features/payroll/utils/compensation.utils';
import { employeeHasFuyouIdouDependents } from '@features/statutory-reports/utils/fuyou-idou-data.utils';

export interface AgeBellNotification {
  id: string;
  employeeId: string;
  event: AgeMilestoneEvent;
  message: string;
}

function isAgeEventEmployee(employee: Employee, targetYearMonth: string): boolean {
  if (!employee.birthDate?.trim()) {
    return false;
  }

  if (isRetiredEmployee(employee) && isAfterRetirementMonth(employee, targetYearMonth)) {
    return false;
  }

  return true;
}

function bellMessageForEvent(event: AgeMilestoneEvent, employeeName: string): string | null {
  switch (event) {
    case 'CARE_START_40':
      return `💡 ${employeeName}さんが40歳に到達したため、今月より介護保険料の天引きが開始されています。`;
    case 'CARE_STOP_65':
      return `💡 ${employeeName}さんが65歳に到達したため、今月より介護保険料の天引きが停止されています。`;
    case 'PENSION_STOP_70':
      return `【手続き必須】${employeeName}さんが70歳に到達しました。今月より厚生年金保険料の天引きが停止されています。『法定帳票出力』より70歳以上被用者該当届を出力してください。`;
    case 'HEALTH_STOP_75':
      return `【手続き必須】${employeeName}さんが75歳に到達しました。今月より健康保険料・介護保険料の天引きが停止されています。『法定帳票出力』より資格喪失届を出力し、保険証を回収してください。また、対象の扶養家族への国保切り替え案内を行ってください。`;
    default:
      return null;
  }
}

export function buildAgeBellNotifications(
  employees: Employee[],
  targetYearMonth: string
): AgeBellNotification[] {
  const notifications: AgeBellNotification[] = [];

  for (const employee of employees) {
    if (!isAgeEventEmployee(employee, targetYearMonth)) {
      continue;
    }

    const employeeName = employeeFullName(employee);
    const events = detectAgeEventsForMonth(employee.birthDate, targetYearMonth);

    for (const event of events) {
      const message = bellMessageForEvent(event, employeeName);
      if (!message) {
        continue;
      }

      notifications.push({
        id: `${employee.id}_${event}_${targetYearMonth}`,
        employeeId: employee.id,
        event,
        message,
      });
    }
  }

  return notifications;
}

/** 70歳以上被用者該当届（資格取得届画面）の出力候補 */
export function isAge70GaitouExportCandidate(
  employee: Employee,
  referenceYearMonth: string
): boolean {
  if (!employee.birthDate?.trim() || employee.status !== 'active') {
    return false;
  }

  return hasReachedPensionInsuranceLossMonth(employee.birthDate, referenceYearMonth);
}

/** 75歳到達による健康保険資格喪失届の出力候補 */
export function isAge75HealthLossExportCandidate(
  employee: Employee,
  referenceYearMonth: string
): boolean {
  if (!employee.birthDate?.trim() || employee.status !== 'active') {
    return false;
  }

  return hasReachedHealthInsuranceLossMonth(employee.birthDate, referenceYearMonth);
}

/** 75歳到達時の被扶養者（異動）届（喪失）出力候補 */
export function isAge75FuyouIdouExportCandidate(
  employee: Employee,
  referenceYearMonth: string
): boolean {
  return (
    isAge75HealthLossExportCandidate(employee, referenceYearMonth) &&
    employeeHasFuyouIdouDependents(employee)
  );
}
