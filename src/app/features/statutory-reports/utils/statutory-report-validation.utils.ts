import { Employee } from '@features/employees/models/employee.model';
import { EmployeeTask, EmployeeTaskRequestedField } from '@features/employee-portal/models/employee-task.model';
import {
  EmployeeReportReadiness,
  STATUTORY_REQUIRED_FIELD_LABELS,
  StatutoryReportDefinition,
  StatutoryReportId,
  StatutoryRequiredFieldKey,
} from '@features/statutory-reports/models/statutory-report-validation.model';
import { employeeHasFuyouIdouDependents } from '@features/statutory-reports/utils/fuyou-idou-data.utils';
import {
  employeeHasMaternityLeaveRecord,
  findPrimaryMaternityLeaveRecord,
  hasMaternityDeliveryType,
  hasMaternityExpectedDeliveryDate,
} from '@features/statutory-reports/utils/maternity-leave-data.utils';
import {
  employeeHasChildcareLeaveRecord,
  findPrimaryChildcareLeaveRecord,
  hasCompleteChildcareChildrenInfo,
} from '@features/statutory-reports/utils/childcare-leave-data.utils';
import { groupEmployees } from '@features/employees/utils/employee-list.utils';
import { isRetiredExportCandidate } from '@features/employees/utils/retirement.utils';
import {
  isAge70GaitouExportCandidate,
  isAge75FuyouIdouExportCandidate,
  isAge75HealthLossExportCandidate,
} from '@features/employees/utils/age-event-notification.utils';
import { getCurrentYearMonthKey } from '@features/payroll/utils/compensation.utils';
import {
  hasEmployeeBonusForPaymentDate,
  resolveDefaultSyouyoPaymentDate,
} from '@features/statutory-reports/utils/syouyo-data.utils';

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function isFieldPresent(employee: Employee, field: StatutoryRequiredFieldKey): boolean {
  switch (field) {
    case 'myNumber':
      return normalizeDigits(employee.myNumber).length === 12;
    case 'hireDate':
      return Boolean(employee.hireDate?.trim());
    case 'birthDate':
      return Boolean(employee.birthDate?.trim());
    case 'resignationDate':
      return Boolean(employee.resignationDate?.trim());
    case 'insuranceCardReturned':
      return employee.insuranceCardReturned != null;
    case 'maternityExpectedDeliveryDate': {
      const record = findPrimaryMaternityLeaveRecord(employee);
      return record ? hasMaternityExpectedDeliveryDate(record) : false;
    }
    case 'maternityDeliveryType': {
      const record = findPrimaryMaternityLeaveRecord(employee);
      return record ? hasMaternityDeliveryType(record) : false;
    }
    case 'childcareChildrenInfo': {
      const record = findPrimaryChildcareLeaveRecord(employee);
      return record ? hasCompleteChildcareChildrenInfo(record) : false;
    }
    default:
      return true;
  }
}

export const STATUTORY_REPORT_DEFINITIONS: Record<StatutoryReportId, StatutoryReportDefinition> = {
  'shikaku-shutoku': {
    exportImplemented: true,
    requiredFields: ['myNumber', 'hireDate', 'birthDate'],
    taskType: 'SHIKAKU_SHUTOKU_INFO',
    taskFieldMapping: {
      myNumber: 'myNumber',
      hireDate: 'hireDate',
      birthDate: 'birthDate',
    },
    filterCandidates: (employee) => {
      const grouped = groupEmployees([employee]);
      const referenceMonth = getCurrentYearMonthKey();
      return (
        grouped.preEmployment.length > 0 ||
        grouped.active.length > 0 ||
        isAge70GaitouExportCandidate(employee, referenceMonth)
      );
    },
  },
  'shikaku-soshitsu': {
    exportImplemented: true,
    requiredFields: ['resignationDate', 'insuranceCardReturned'],
    taskType: 'RETIREMENT_INFO',
    taskFieldMapping: {
      resignationDate: 'retirementDate',
      insuranceCardReturned: 'insuranceCardReturned',
    },
    filterCandidates: (employee) =>
      isRetiredExportCandidate(employee) ||
      isAge75HealthLossExportCandidate(employee, getCurrentYearMonthKey()),
  },
  'santei-kiso': {
    exportImplemented: true,
    requiredFields: ['myNumber', 'birthDate'],
    taskType: null,
    taskFieldMapping: {},
    filterCandidates: (employee) => employee.status === 'active',
  },
  'getsugaku-henko': {
    exportImplemented: true,
    requiredFields: ['myNumber', 'birthDate'],
    taskType: null,
    taskFieldMapping: {},
    filterCandidates: (employee) => employee.status === 'active',
  },
  'shoyo-shiharai': {
    exportImplemented: true,
    requiredFields: ['myNumber', 'birthDate'],
    taskType: null,
    taskFieldMapping: {},
    filterCandidates: (employee) => employee.status === 'active',
  },
  'fuyo-ido': {
    exportImplemented: true,
    requiredFields: ['myNumber', 'birthDate'],
    taskType: null,
    taskFieldMapping: {},
    filterCandidates: (employee) =>
      (employee.status === 'active' && employeeHasFuyouIdouDependents(employee)) ||
      isAge75FuyouIdouExportCandidate(employee, getCurrentYearMonthKey()),
  },
  'sankyu-shinsei': {
    exportImplemented: true,
    requiredFields: ['myNumber', 'birthDate', 'maternityExpectedDeliveryDate', 'maternityDeliveryType'],
    taskType: 'MATERNITY_LEAVE_INFO_REQUEST',
    taskFieldMapping: {
      maternityExpectedDeliveryDate: 'expectedDeliveryDate',
      maternityDeliveryType: 'deliveryType',
    },
    filterCandidates: (employee) =>
      employee.status === 'active' &&
      employee.gender === 'female' &&
      employeeHasMaternityLeaveRecord(employee),
  },
  'ikuji-shinsei': {
    exportImplemented: true,
    requiredFields: ['myNumber', 'birthDate', 'childcareChildrenInfo'],
    taskType: 'CHILDCARE_LEAVE_INFO_REQUEST',
    taskFieldMapping: {
      childcareChildrenInfo: 'childcareChild1NameKana',
    },
    filterCandidates: (employee) =>
      employee.status === 'active' && employeeHasChildcareLeaveRecord(employee),
  },
};

export function getStatutoryReportDefinition(reportId: StatutoryReportId): StatutoryReportDefinition {
  return STATUTORY_REPORT_DEFINITIONS[reportId];
}

export function evaluateEmployeeReportReadiness(
  employee: Employee,
  reportId: StatutoryReportId
): EmployeeReportReadiness {
  const definition = getStatutoryReportDefinition(reportId);
  const missingFields = definition.requiredFields.filter((field) => !isFieldPresent(employee, field));

  return {
    employeeId: employee.id,
    ready: missingFields.length === 0,
    missingFields,
    missingLabels: missingFields.map((field) => STATUTORY_REQUIRED_FIELD_LABELS[field]),
  };
}

export function filterReportCandidates(employees: Employee[], reportId: StatutoryReportId): Employee[] {
  const definition = getStatutoryReportDefinition(reportId);
  return employees.filter((employee) => definition.filterCandidates(employee));
}

export function mapMissingFieldsToTaskRequestedFields(
  reportId: StatutoryReportId,
  missingFields: StatutoryRequiredFieldKey[]
) {
  const mapping = getStatutoryReportDefinition(reportId).taskFieldMapping;

  return missingFields
    .flatMap((field) => {
      if (field === 'childcareChildrenInfo') {
        return [
          'childcareChild1NameKana',
          'childcareChild1NameKanji',
          'childcareChild1BirthDate',
        ] as EmployeeTaskRequestedField[];
      }

      const mapped = mapping[field];
      return mapped ? [mapped] : [];
    })
    .filter((field): field is EmployeeTaskRequestedField => Boolean(field));
}

function hasPendingStatutoryInputTask(
  employee: Employee,
  companyTasks: EmployeeTask[],
  reportId: StatutoryReportId
): boolean {
  const taskType = getStatutoryReportDefinition(reportId).taskType;
  if (!taskType) {
    return false;
  }

  return companyTasks.some(
    (task) =>
      task.employeeId === employee.id &&
      task.taskType === taskType &&
      task.status === 'PENDING'
  );
}

function isStatutoryEmployeeExportReady(
  employee: Employee,
  reportId: StatutoryReportId,
  employees: Employee[]
): boolean {
  const readiness = evaluateEmployeeReportReadiness(employee, reportId);
  if (!readiness.ready) {
    return false;
  }

  switch (reportId) {
    case 'shoyo-shiharai':
      return hasEmployeeBonusForPaymentDate(
        employee,
        resolveDefaultSyouyoPaymentDate(employees)
      );
    case 'fuyo-ido':
      return employeeHasFuyouIdouDependents(employee);
    case 'sankyu-shinsei':
      return employeeHasMaternityLeaveRecord(employee);
    case 'ikuji-shinsei':
      return employeeHasChildcareLeaveRecord(employee);
    default:
      return true;
  }
}

function needsStatutoryLaborAction(
  employee: Employee,
  companyTasks: EmployeeTask[],
  reportId: StatutoryReportId
): boolean {
  if (hasPendingStatutoryInputTask(employee, companyTasks, reportId)) {
    return true;
  }

  const readiness = evaluateEmployeeReportReadiness(employee, reportId);
  if (readiness.ready) {
    return false;
  }

  const definition = getStatutoryReportDefinition(reportId);
  if (!definition.taskType || !employee.authUid) {
    return readiness.missingFields.length > 0;
  }

  const requestedFields = mapMissingFieldsToTaskRequestedFields(
    reportId,
    readiness.missingFields
  );

  return requestedFields.length > 0;
}

/** 帳票カードの通知バッジ表示判定（出力可能な対象者または未処理の入力依頼あり） */
export function hasStatutoryReportExportTargets(
  employees: Employee[],
  companyTasks: EmployeeTask[],
  reportId: StatutoryReportId
): boolean {
  const candidates = filterReportCandidates(employees, reportId);

  return candidates.some(
    (employee) =>
      isStatutoryEmployeeExportReady(employee, reportId, employees) ||
      needsStatutoryLaborAction(employee, companyTasks, reportId)
  );
}
