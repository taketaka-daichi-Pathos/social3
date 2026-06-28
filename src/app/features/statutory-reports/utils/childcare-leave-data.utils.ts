import { Employee } from '@features/employees/models/employee.model';
import {
  ChildcareLeaveChildRecord,
  LeaveRecord,
} from '@features/employees/models/leave-record.model';
import {
  ChildcareLeaveChild,
  ChildcareLeaveData,
} from '@features/statutory-reports/models/egov-export.model';

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

export function isValidChildcareChildRecord(child: ChildcareLeaveChildRecord | undefined): boolean {
  if (!child) {
    return false;
  }

  return (
    Boolean(child.nameKana?.trim()) &&
    Boolean(child.nameKanji?.trim()) &&
    Boolean(child.birthDate?.trim())
  );
}

export function findPrimaryChildcareLeaveRecord(employee: Employee): LeaveRecord | null {
  const records = (employee.leaveRecords ?? []).filter((record) => record.type === 'childcare');
  if (records.length === 0) {
    return null;
  }

  return [...records].sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
}

export function employeeHasChildcareLeaveRecord(employee: Employee): boolean {
  return findPrimaryChildcareLeaveRecord(employee) != null;
}

export function hasCompleteChildcareChildrenInfo(record: LeaveRecord): boolean {
  const children = record.children ?? [];
  return children.some((child) => isValidChildcareChildRecord(child));
}

export function hasCompleteChildcareLeaveForExport(employee: Employee): boolean {
  const record = findPrimaryChildcareLeaveRecord(employee);
  if (!record || !record.startDate?.trim() || !record.endDate?.trim()) {
    return false;
  }

  return hasCompleteChildcareChildrenInfo(record);
}

function mapChildRecord(child: ChildcareLeaveChildRecord): ChildcareLeaveChild {
  return {
    nameKana: child.nameKana.trim(),
    nameKanji: child.nameKanji.trim(),
    birthDate: parseIsoDateLocal(child.birthDate),
  };
}

export function buildChildcareLeaveDataFromRecord(record: LeaveRecord): ChildcareLeaveData | null {
  if (!record.startDate?.trim() || !record.endDate?.trim() || !hasCompleteChildcareChildrenInfo(record)) {
    return null;
  }

  const children = (record.children ?? [])
    .filter((child) => isValidChildcareChildRecord(child))
    .slice(0, 2)
    .map((child) => mapChildRecord(child));

  if (children.length === 0) {
    return null;
  }

  return {
    leaveStartDate: parseIsoDateLocal(record.startDate),
    expectedLeaveEndDate: parseIsoDateLocal(record.endDate),
    children,
    isExtension: Boolean(record.isExtension),
    isTermination: Boolean(record.isTermination),
    actualEndDate: parseOptionalIsoDate(record.actualEndDate),
  };
}

export function buildChildcareLeaveDataFromEmployee(employee: Employee): ChildcareLeaveData | null {
  const record = findPrimaryChildcareLeaveRecord(employee);
  if (!record) {
    return null;
  }

  return buildChildcareLeaveDataFromRecord(record);
}

export function buildChildcareLeaveDataForEmployees(
  employees: Employee[]
): Map<string, ChildcareLeaveData> {
  const result = new Map<string, ChildcareLeaveData>();

  for (const employee of employees) {
    const childcareData = buildChildcareLeaveDataFromEmployee(employee);
    if (!childcareData) {
      throw new Error(
        `${employee.lastName}${employee.firstName} の育児休業データが不足しています（養育する子の情報を確認してください）`
      );
    }

    result.set(employee.id, childcareData);
  }

  return result;
}

export function updatePrimaryChildcareLeaveRecord(
  leaveRecords: LeaveRecord[],
  updates: Partial<
    Pick<
      LeaveRecord,
      'children' | 'isExtension' | 'isTermination' | 'actualEndDate'
    >
  >
): LeaveRecord[] {
  const primary = findPrimaryChildcareLeaveRecord({ leaveRecords } as Employee);
  if (!primary) {
    throw new Error('育児休業データが見つかりません');
  }

  return leaveRecords.map((record) =>
    record.type === primary.type && record.startDate === primary.startDate
      ? { ...record, ...updates }
      : record
  );
}

export function mergePrimaryChildcareChild1(
  leaveRecords: LeaveRecord[],
  child: ChildcareLeaveChildRecord
): LeaveRecord[] {
  const primary = findPrimaryChildcareLeaveRecord({ leaveRecords } as Employee);
  if (!primary) {
    throw new Error('育児休業データが見つかりません');
  }

  const existingChildren = [...(primary.children ?? [])];
  if (existingChildren.length === 0) {
    existingChildren.push(child);
  } else {
    existingChildren[0] = { ...existingChildren[0], ...child };
  }

  return updatePrimaryChildcareLeaveRecord(leaveRecords, { children: existingChildren.slice(0, 2) });
}
