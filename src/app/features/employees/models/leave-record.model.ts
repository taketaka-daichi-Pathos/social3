export type LeaveType = 'maternity' | 'childcare';

/** 社会保険料免除・バッジ表示の対象となる休業種別 */
export const SOCIAL_INSURANCE_EXEMPT_LEAVE_TYPES: readonly LeaveType[] = [
  'maternity',
  'childcare',
];

export function isSocialInsuranceExemptLeaveType(type: LeaveType): boolean {
  return SOCIAL_INSURANCE_EXEMPT_LEAVE_TYPES.includes(type);
}

/** 育児休業届用：養育する子の情報（保存は YYYY-MM-DD 文字列） */
export interface ChildcareLeaveChildRecord {
  nameKana: string;
  nameKanji: string;
  birthDate: string;
}

export interface LeaveRecord {
  type: LeaveType;
  /** 休業開始日（YYYY-MM-DD） */
  startDate: string;
  /** 休業終了予定日（YYYY-MM-DD） */
  endDate: string;
  /** 出産予定日（YYYY-MM-DD。UI上は日付型として扱う） */
  expectedDeliveryDate?: string;
  /** 出産種別（'1': 単胎, '2': 多胎） */
  deliveryType?: '1' | '2';
  /** 実際の出産日（YYYY-MM-DD。UI上は日付型として扱う） */
  actualDeliveryDate?: string;
  /** 変更後出産予定年月日 YYYY-MM-DD */
  changedExpectedDeliveryDate?: string;
  /** 変更後休業終了予定年月日 YYYY-MM-DD */
  changedExpectedLeaveEndDate?: string;
  /** 休業終了年月日 YYYY-MM-DD（終了届用） */
  leaveEndDate?: string;
  /** 変更・終了届かどうか */
  isChangeOrEnd?: boolean;
  /** 育児休業：養育する子（最大2名） */
  children?: ChildcareLeaveChildRecord[];
  /** 育児休業：延長届フラグ */
  isExtension?: boolean;
  /** 育児休業：終了届フラグ */
  isTermination?: boolean;
  /** 育児休業：実際の終了年月日 YYYY-MM-DD */
  actualEndDate?: string;
}

export interface LeaveTableRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  record: LeaveRecord;
  status: 'active' | 'scheduled' | 'ended';
}
