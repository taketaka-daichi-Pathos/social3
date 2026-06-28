import { Employee } from '@features/employees/models/employee.model';
import { LeaveRecord } from '@features/employees/models/leave-record.model';
import { MaternityLeaveData } from '@features/statutory-reports/models/egov-export.model';

function parseIsoDateLocal(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`日付の形式が不正です: ${value}`);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseOptionalIsoDate(value: string | undefined): Date | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return parseIsoDateLocal(trimmed);
}

export function isValidDeliveryType(value: string | undefined): value is '1' | '2' {
  return value === '1' || value === '2';
}

/** 出力対象となる最新の産休レコードを返す */
export function findPrimaryMaternityLeaveRecord(employee: Employee): LeaveRecord | null {
  const records = (employee.leaveRecords ?? []).filter((record) => record.type === 'maternity');
  if (records.length === 0) {
    return null;
  }

  return [...records].sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
}

export function employeeHasMaternityLeaveRecord(employee: Employee): boolean {
  return findPrimaryMaternityLeaveRecord(employee) != null;
}

export function hasMaternityExpectedDeliveryDate(record: LeaveRecord): boolean {
  return Boolean(record.expectedDeliveryDate?.trim());
}

export function hasMaternityDeliveryType(record: LeaveRecord): boolean {
  return isValidDeliveryType(record.deliveryType);
}

export function hasCompleteMaternityLeaveForExport(employee: Employee): boolean {
  const record = findPrimaryMaternityLeaveRecord(employee);
  if (!record || !record.startDate?.trim() || !record.endDate?.trim()) {
    return false;
  }

  return hasMaternityExpectedDeliveryDate(record) && hasMaternityDeliveryType(record);
}

/** @deprecated hasCompleteMaternityLeaveForExport を使用 */
export function hasEmployeeMaternityLeaveForExport(employee: Employee): boolean {
  return hasCompleteMaternityLeaveForExport(employee);
}

export function updatePrimaryMaternityLeaveRecord(
  leaveRecords: LeaveRecord[],
  updates: Partial<Pick<LeaveRecord, 'expectedDeliveryDate' | 'deliveryType' | 'actualDeliveryDate'>>
): LeaveRecord[] {
  const primary = findPrimaryMaternityLeaveRecord({ leaveRecords } as Employee);
  if (!primary) {
    throw new Error('産休データが見つかりません');
  }

  return leaveRecords.map((record) =>
    record.type === primary.type && record.startDate === primary.startDate
      ? { ...record, ...updates }
      : record
  );
}

export function buildMaternityLeaveDataFromRecord(record: LeaveRecord): MaternityLeaveData | null {
  if (
    !record.startDate?.trim() ||
    !record.endDate?.trim() ||
    !hasMaternityExpectedDeliveryDate(record) ||
    !hasMaternityDeliveryType(record)
  ) {
    return null;
  }

  return {
    expectedDeliveryDate: parseIsoDateLocal(record.expectedDeliveryDate!),
    deliveryType: record.deliveryType!,
    leaveStartDate: parseIsoDateLocal(record.startDate),
    expectedLeaveEndDate: parseIsoDateLocal(record.endDate),
    actualDeliveryDate: parseOptionalIsoDate(record.actualDeliveryDate),
    isChangeOrEnd: Boolean(record.isChangeOrEnd),
    changedExpectedDeliveryDate: parseOptionalIsoDate(record.changedExpectedDeliveryDate),
    changedExpectedLeaveEndDate: parseOptionalIsoDate(record.changedExpectedLeaveEndDate),
    leaveEndDate: parseOptionalIsoDate(record.leaveEndDate),
  };
}

export function buildMaternityLeaveDataFromEmployee(employee: Employee): MaternityLeaveData | null {
  const record = findPrimaryMaternityLeaveRecord(employee);
  if (!record) {
    return null;
  }

  return buildMaternityLeaveDataFromRecord(record);
}

export function buildMaternityLeaveDataForEmployees(
  employees: Employee[]
): Map<string, MaternityLeaveData> {
  const result = new Map<string, MaternityLeaveData>();

  for (const employee of employees) {
    const maternityData = buildMaternityLeaveDataFromEmployee(employee);
    if (!maternityData) {
      throw new Error(
        `${employee.lastName}${employee.firstName} の産前産後休業データが不足しています（出産予定日・出産種別を確認してください）`
      );
    }

    result.set(employee.id, maternityData);
  }

  return result;
}
