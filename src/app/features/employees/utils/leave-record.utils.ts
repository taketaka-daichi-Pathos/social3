import { Employee } from '@features/employees/models/employee.model';
import {
  LeaveRecord,
  LeaveTableRow,
  LeaveType,
  ChildcareLeaveChildRecord,
  isSocialInsuranceExemptLeaveType,
} from '@features/employees/models/leave-record.model';
import { getPreviousYearMonthKey, compareYearMonths } from '@features/payroll/utils/compensation.utils';

export interface EmployeeLeaveDisplayInfo {
  activeTypes: LeaveType[];
  exemptionPeriodTexts: string[];
  showLeaveStatus: boolean;
}

function normalizeStartMonth(value: unknown): string {
  if (value == null || value === '') {
    return '';
  }

  const fromDate = toLocalDate(value);
  if (fromDate) {
    return `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}`;
  }

  const trimmed = String(value).trim();
  const match = /^(\d{4})[-/.]?(\d{1,2})/.exec(trimmed);
  if (!match) {
    return '';
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return '';
  }

  return `${match[1]}-${String(month).padStart(2, '0')}`;
}

function normalizeLeaveType(value: unknown): LeaveType | null {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();

  if (raw === 'maternity' || raw === '産休') {
    return 'maternity';
  }

  if (raw === 'childcare' || raw === '育休' || raw === 'paternity' || raw === 'パパ育休') {
    return 'childcare';
  }

  return null;
}

function toLocalDate(value: unknown): Date | null {
  if (value == null || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'object' && value !== null) {
    if ('toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
      const date = (value as { toDate: () => Date }).toDate();
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    if ('seconds' in value) {
      const seconds = Number((value as { seconds: number }).seconds);
      if (!Number.isNaN(seconds)) {
        const date = new Date(seconds * 1000);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
      }
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
    if (isoMatch) {
      return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    }

    const yearMonthMatch = /^(\d{4})-(\d{1,2})$/.exec(trimmed);
    if (yearMonthMatch) {
      return new Date(Number(yearMonthMatch[1]), Number(yearMonthMatch[2]) - 1, 1);
    }
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function normalizeLeaveEndDate(value: unknown): string {
  const date = toLocalDate(value);
  return date ? formatLocalIsoDate(date) : '';
}

function normalizeLeaveStartDate(startDateValue: unknown, legacyStartMonth?: unknown): string {
  const direct = normalizeLeaveEndDate(startDateValue);
  if (direct) {
    return direct;
  }

  const legacyMonth = normalizeStartMonth(legacyStartMonth ?? startDateValue);
  if (legacyMonth) {
    return `${legacyMonth}-01`;
  }

  return '';
}

export function leaveStartDate(record: LeaveRecord): string {
  return normalizeLeaveStartDate(record.startDate);
}

/** 社会保険料免除判定用: 開始日から YYYY-MM を抽出 */
export function leaveStartYearMonth(record: LeaveRecord): string {
  return normalizeStartMonth(record.startDate);
}

function coerceLeaveRecord(value: unknown): LeaveRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Record<string, unknown>;
  const type = normalizeLeaveType(item['type'] ?? item['leaveType'] ?? item['kind']);
  const startDate = normalizeLeaveStartDate(
    item['startDate'] ?? item['start_date'],
    item['startMonth'] ?? item['start_month']
  );
  const endDate = normalizeLeaveEndDate(
    item['endDate'] ?? item['end_date'] ?? item['endMonth'] ?? item['end_month']
  );

  if (!type || !isSocialInsuranceExemptLeaveType(type) || !startDate || !endDate) {
    return null;
  }

  const deliveryTypeRaw = String(item['deliveryType'] ?? '').trim();
  const deliveryType = deliveryTypeRaw === '2' ? '2' : deliveryTypeRaw === '1' ? '1' : undefined;

  return {
    type,
    startDate,
    endDate,
    expectedDeliveryDate: normalizeLeaveStartDate(item['expectedDeliveryDate'], null) || undefined,
    deliveryType,
    actualDeliveryDate: normalizeLeaveStartDate(item['actualDeliveryDate'], null) || undefined,
    changedExpectedDeliveryDate:
      normalizeLeaveStartDate(item['changedExpectedDeliveryDate'], null) || undefined,
    changedExpectedLeaveEndDate:
      normalizeLeaveStartDate(item['changedExpectedLeaveEndDate'], null) || undefined,
    leaveEndDate: normalizeLeaveStartDate(item['leaveEndDate'], null) || undefined,
    isChangeOrEnd: Boolean(item['isChangeOrEnd']),
    children: parseChildcareLeaveChildren(item['children']),
    isExtension: Boolean(item['isExtension']),
    isTermination: Boolean(item['isTermination']),
    actualEndDate: normalizeLeaveStartDate(item['actualEndDate'], null) || undefined,
  };
}

function parseChildcareLeaveChildren(value: unknown): ChildcareLeaveChildRecord[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const children = value
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }

      const item = row as Record<string, unknown>;
      const nameKana = String(item['nameKana'] ?? '').trim();
      const nameKanji = String(item['nameKanji'] ?? '').trim();
      const birthDate = normalizeLeaveStartDate(item['birthDate'], null);

      if (!nameKana || !nameKanji || !birthDate) {
        return null;
      }

      return { nameKana, nameKanji, birthDate };
    })
    .filter((child): child is ChildcareLeaveChildRecord => child != null)
    .slice(0, 2);

  return children.length > 0 ? children : undefined;
}

export function parseLeaveRecords(value: unknown): LeaveRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((row) => coerceLeaveRecord(row))
    .filter((record): record is LeaveRecord => record != null);
}

function parseYearMonthToDate(yearMonth: string): Date | null {
  const normalized = normalizeStartMonth(yearMonth);
  if (!normalized) {
    return null;
  }

  const [year, month] = normalized.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function toYearMonthIndex(yearMonth: string): number | null {
  const date = parseYearMonthToDate(yearMonth);
  if (!date) {
    return null;
  }

  return date.getFullYear() * 12 + date.getMonth();
}

function getReferenceYearMonth(referenceDate: Date): string {
  return `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
}

/** 終了日の翌日が属する月の「前月」までが社会保険料免除対象（YYYY-MM） */
export function leaveExemptionEndYearMonth(record: LeaveRecord): string {
  const endDate = toLocalDate(record.endDate);
  if (!endDate) {
    return '';
  }

  const startMonth = leaveStartYearMonth(record);
  const dayAfterEndDate = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate() + 1
  );
  const returnMonth = getReferenceYearMonth(dayAfterEndDate);
  const exemptionEndMonth = getPreviousYearMonthKey(returnMonth);

  if (!startMonth) {
    return exemptionEndMonth;
  }

  if (!exemptionEndMonth || compareYearMonths(exemptionEndMonth, startMonth) < 0) {
    return startMonth;
  }

  return exemptionEndMonth;
}

export function isDateWithinLeaveRecord(record: LeaveRecord, date: string | Date): boolean {
  const start = toLocalDate(leaveStartDate(record));
  const end = toLocalDate(record.endDate);
  const target = typeof date === 'string' ? toLocalDate(date) : toLocalDate(date);

  if (!start || !end || !target) {
    return false;
  }

  return target.getTime() >= start.getTime() && target.getTime() <= end.getTime();
}

export function isYearMonthWithinLeaveRecord(
  record: LeaveRecord,
  targetYearMonth: string
): boolean {
  const targetIdx = toYearMonthIndex(targetYearMonth);
  const startIdx = toYearMonthIndex(leaveStartYearMonth(record));
  const endIdx = toYearMonthIndex(leaveExemptionEndYearMonth(record));

  if (targetIdx == null || startIdx == null || endIdx == null) {
    return false;
  }

  return targetIdx >= startIdx && targetIdx <= endIdx;
}

export function isSocialInsuranceExemptForMonth(
  employee: Pick<Employee, 'leaveRecords'> | null | undefined,
  targetYearMonth: string
): boolean {
  const records = normalizeEmployeeLeaveRecords(employee?.leaveRecords);
  return records
    .filter((record) => isSocialInsuranceExemptLeaveType(record.type))
    .some((record) => isYearMonthWithinLeaveRecord(record, targetYearMonth));
}

/** 対象日が休業期間（開始日〜終了日）内か（バッジ表示用） */
export function isOnCalendarLeave(
  employee: Pick<Employee, 'leaveRecords'> | null | undefined,
  referenceDate: Date = new Date()
): boolean {
  if (!employee) {
    return false;
  }

  const records = normalizeEmployeeLeaveRecords(employee.leaveRecords);
  return records
    .filter((record) => isSocialInsuranceExemptLeaveType(record.type))
    .some((record) => isDateWithinLeaveRecord(record, referenceDate));
}

export function isSocialInsuranceExemptForDate(
  employee: Pick<Employee, 'leaveRecords'> | null | undefined,
  targetDate: string
): boolean {
  const target = toLocalDate(targetDate);
  if (!target) {
    return false;
  }

  return isSocialInsuranceExemptForMonth(employee, getReferenceYearMonth(target));
}

export function formatLeaveExemptionPeriodDisplayText(record: LeaveRecord): string {
  const startLabel = formatLeaveYearMonthLabel(leaveStartYearMonth(record));
  const endLabel = formatLeaveYearMonthLabel(leaveExemptionEndYearMonth(record));
  return `（${startLabel}〜${endLabel} 免除予定）`;
}

export function formatLeaveYearMonthLabel(yearMonth: string): string {
  const normalized = normalizeStartMonth(yearMonth);
  if (!normalized) {
    return yearMonth;
  }

  const [year, month] = normalized.split('-');
  return `${year}年${Number(month)}月`;
}

export function normalizeEmployeeLeaveRecords(records: unknown[] | undefined): LeaveRecord[] {
  const input = records ?? [];
  const parsed = parseLeaveRecords(input);
  if (parsed.length > 0) {
    return parsed;
  }

  return input
    .map((row) => coerceLeaveRecord(row))
    .filter((record): record is LeaveRecord => record != null);
}

function isLeaveRecordNotEnded(record: LeaveRecord, referenceDate: Date): boolean {
  const end = toLocalDate(record.endDate);
  const today = toLocalDate(referenceDate);

  if (!end || !today) {
    return false;
  }

  return today.getTime() <= end.getTime();
}

function isLeaveRecordOnCalendarLeave(record: LeaveRecord, referenceDate: Date): boolean {
  if (!isSocialInsuranceExemptLeaveType(record.type)) {
    return false;
  }

  return isDateWithinLeaveRecord(record, referenceDate);
}

function isLeaveRecordScheduled(record: LeaveRecord, referenceDate: Date): boolean {
  const start = toLocalDate(leaveStartDate(record));
  const today = toLocalDate(referenceDate);

  if (!start || !today) {
    return false;
  }

  return today.getTime() < start.getTime() && isLeaveRecordNotEnded(record, referenceDate);
}

function isLeaveRecordActive(record: LeaveRecord, referenceDate: Date): boolean {
  const referenceYearMonth = getReferenceYearMonth(referenceDate);

  return (
    isYearMonthWithinLeaveRecord(record, referenceYearMonth) ||
    isDateWithinLeaveRecord(record, referenceDate)
  );
}

/** バッジ表示対象: 対象日が休業期間（開始日〜終了日）内の産休・育休のみ */
function isLeaveRecordBadgeVisible(record: LeaveRecord, referenceDate: Date): boolean {
  return isLeaveRecordOnCalendarLeave(record, referenceDate);
}

function resolveBadgeVisibleLeaveRecords(
  records: LeaveRecord[],
  referenceDate: Date = new Date()
): LeaveRecord[] {
  return records.filter((record) => isLeaveRecordBadgeVisible(record, referenceDate));
}

function getLeaveTypeNameForRecord(record: LeaveRecord): string {
  return record.type === 'maternity' ? '産休中' : '育休中';
}

export function getEmployeeLeaveInfo(
  employee: Pick<Employee, 'leaveRecords'> | null | undefined,
  referenceDate: Date = new Date()
): EmployeeLeaveDisplayInfo {
  const records = normalizeEmployeeLeaveRecords(employee?.leaveRecords);
  const visibleRecords = resolveBadgeVisibleLeaveRecords(records, referenceDate);
  const activeTypes = [...new Set(visibleRecords.map((record) => record.type))];
  const exemptionPeriodTexts = visibleRecords.map(formatLeaveExemptionPeriodDisplayText);

  return {
    activeTypes,
    exemptionPeriodTexts,
    showLeaveStatus: visibleRecords.length > 0,
  };
}

/** テンプレート用: 休業バッジを表示するか（休業中のみ、予定は非表示） */
export function hasLeaveRecord(
  employee: Employee | null | undefined,
  referenceDate: Date = new Date()
): boolean {
  return isOnCalendarLeave(employee, referenceDate);
}

function resolvePrimaryBadgeRecord(
  records: LeaveRecord[],
  referenceDate: Date
): LeaveRecord | null {
  const visible = resolveBadgeVisibleLeaveRecords(records, referenceDate);
  if (visible.length === 0) {
    return null;
  }

  return visible.find((record) => record.type === 'maternity') ?? visible[0];
}

/** テンプレート用: バッジ文言（産休中・育休中） */
export function getLeaveTypeName(
  employee: Employee | null | undefined,
  referenceDate: Date = new Date()
): string {
  if (!employee) {
    return '';
  }

  try {
    const records = normalizeEmployeeLeaveRecords(employee.leaveRecords);
    const primary = resolvePrimaryBadgeRecord(records, referenceDate);

    if (!primary) {
      return '';
    }

    return getLeaveTypeNameForRecord(primary);
  } catch {
    return '';
  }
}

/** テンプレート用: バッジの修飾クラス（マスタバッジと同形状のアウトライン） */
export function getLeaveBadgeClass(
  employee: Employee | null | undefined,
  referenceDate: Date = new Date()
): Record<string, boolean> {
  if (!employee) {
    return {
      'leave-compact-badge--maternity': false,
      'leave-compact-badge--childcare': false,
    };
  }

  const records = normalizeEmployeeLeaveRecords(employee.leaveRecords);
  const primary = resolvePrimaryBadgeRecord(records, referenceDate);

  return {
    'leave-compact-badge--maternity': primary?.type === 'maternity',
    'leave-compact-badge--childcare': primary?.type === 'childcare',
  };
}

/** テンプレート用: 免除期間テキスト（休業中のみ） */
export function getLeavePeriodText(
  employee: Employee | null | undefined,
  referenceDate: Date = new Date()
): string {
  if (!employee) {
    return '';
  }

  try {
    const records = normalizeEmployeeLeaveRecords(employee.leaveRecords);
    const visible = resolveBadgeVisibleLeaveRecords(records, referenceDate);

    if (visible.length === 0) {
      return '';
    }

    return visible.map(formatLeaveExemptionPeriodDisplayText).join(' ');
  } catch {
    return '';
  }
}

export function getActiveLeaveRecordsAtDate(
  employee: Pick<Employee, 'leaveRecords'>,
  referenceDate: Date = new Date()
): LeaveRecord[] {
  const records = normalizeEmployeeLeaveRecords(employee.leaveRecords);
  return records.filter((record) => isDateWithinLeaveRecord(record, referenceDate));
}

export function getLeaveExemptionPeriodLabels(
  employee: Pick<Employee, 'leaveRecords'>,
  referenceDate: Date = new Date()
): string[] {
  return getEmployeeLeaveInfo(employee, referenceDate).exemptionPeriodTexts;
}

export function isCurrentlyOnLeave(
  employee: Pick<Employee, 'leaveRecords'>,
  referenceDate: Date = new Date()
): boolean {
  return hasLeaveRecord(employee as Employee, referenceDate);
}

export function getActiveLeaveTypesAtDate(
  employee: Pick<Employee, 'leaveRecords'>,
  referenceDate: Date = new Date()
): LeaveType[] {
  return getEmployeeLeaveInfo(employee, referenceDate).activeTypes;
}

export function resolveLeaveRecordStatus(
  record: LeaveRecord,
  referenceDate: Date = new Date()
): LeaveTableRow['status'] {
  const today = toLocalDate(referenceDate);
  const start = toLocalDate(leaveStartDate(record));
  const end = toLocalDate(record.endDate);

  if (!today || !start || !end) {
    return 'ended';
  }

  if (today.getTime() > end.getTime()) {
    return 'ended';
  }

  if (today.getTime() < start.getTime()) {
    return 'scheduled';
  }

  return 'active';
}

export function listActiveOrScheduledLeaveRows(
  employees: Employee[],
  referenceDate: Date = new Date()
): LeaveTableRow[] {
  const rows: LeaveTableRow[] = [];

  for (const employee of employees) {
    for (const record of normalizeEmployeeLeaveRecords(employee.leaveRecords)) {
      if (!isSocialInsuranceExemptLeaveType(record.type)) {
        continue;
      }

      const status = resolveLeaveRecordStatus(record, referenceDate);
      if (status === 'ended') {
        continue;
      }

      rows.push({
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        employeeName: `${employee.lastName} ${employee.firstName}`,
        record,
        status,
      });
    }
  }

  return rows.sort((a, b) => {
    const byStart = a.record.startDate.localeCompare(b.record.startDate);
    if (byStart !== 0) {
      return byStart;
    }

    return a.employeeNumber.localeCompare(b.employeeNumber);
  });
}

export function leaveTypeLabel(type: LeaveType): string {
  return type === 'maternity' ? '産休' : '育休';
}

export function leaveStatusLabel(status: LeaveTableRow['status']): string {
  switch (status) {
    case 'active':
      return '取得中';
    case 'scheduled':
      return '取得予定';
    default:
      return '終了';
  }
}

/** デバッグ用: 判定詳細 */
export function debugLeaveRecordEvaluation(
  employee: Employee | null | undefined,
  referenceDate: Date = new Date()
) {
  const raw = employee?.leaveRecords ?? [];
  const normalized = normalizeEmployeeLeaveRecords(raw);
  const referenceYearMonth = getReferenceYearMonth(referenceDate);

  return {
    referenceDate: formatLocalIsoDate(referenceDate),
    referenceYearMonth,
    rawRecords: raw,
    normalizedRecords: normalized,
    evaluations: normalized.map((record) => ({
      record,
      exemptionEndMonth: leaveExemptionEndYearMonth(record),
      calendarLeave: isDateWithinLeaveRecord(record, referenceDate),
      exemptMonth: isYearMonthWithinLeaveRecord(record, referenceYearMonth),
      scheduled: isLeaveRecordScheduled(record, referenceDate),
      active: isLeaveRecordActive(record, referenceDate),
      badgeVisible: isLeaveRecordBadgeVisible(record, referenceDate),
      typeName: getLeaveTypeNameForRecord(record),
      periodText: formatLeaveExemptionPeriodDisplayText(record),
    })),
    show: hasLeaveRecord(employee, referenceDate),
    typeName: getLeaveTypeName(employee, referenceDate),
    periodText: getLeavePeriodText(employee, referenceDate),
  };
}

function formatLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 対象月（YYYY-MM）の基準日（15日）を返す */
export function referenceDateForYearMonth(yearMonth: string): Date {
  const normalized = normalizeStartMonth(yearMonth);
  if (!normalized) {
    return new Date();
  }

  const [year, month] = normalized.split('-').map(Number);
  return new Date(year, month - 1, 15);
}
