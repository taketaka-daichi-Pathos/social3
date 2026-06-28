import {

  HEALTH_INSURANCE_GRADES,

  InsuranceGrade,

  PENSION_INSURANCE_GRADES,

} from '@core/models/insurance-grade.model';

import {

  compareYearMonths,

  getCurrentYearMonthKey,

  getNextYearMonthKey,

  getPreviousYearMonthKey,

} from '@features/payroll/utils/compensation.utils';

import { PayrollHistoryRow } from '../models/employee-registration.model';



export function findHealthGradeByNumber(grade: number): InsuranceGrade | null {

  return HEALTH_INSURANCE_GRADES.find((row) => row.grade === grade) ?? null;

}



export function findPensionGradeByNumber(grade: number): InsuranceGrade | null {

  return PENSION_INSURANCE_GRADES.find((row) => row.grade === grade) ?? null;

}



export function sortPayrollHistoryRows(rows: PayrollHistoryRow[]): PayrollHistoryRow[] {

  return [...rows].sort((left, right) => compareYearMonths(left.targetMonth, right.targetMonth));

}



export function resolveNewestPayrollHistoryRow(rows: PayrollHistoryRow[]): PayrollHistoryRow | null {

  const sorted = sortPayrollHistoryRows(rows);

  return sorted.length > 0 ? sorted[sorted.length - 1] : null;

}



export function resolveOldestPayrollHistoryRow(rows: PayrollHistoryRow[]): PayrollHistoryRow | null {

  const sorted = sortPayrollHistoryRows(rows);

  return sorted.length > 0 ? sorted[0] : null;

}



/** 履歴保存の終了月（入力の最新月と現在月のうち遅い方） */

export function resolvePayrollHistoryEndMonth(

  newestMonth: string,

  referenceDate = new Date()

): string {

  const currentMonth = getCurrentYearMonthKey(referenceDate);

  return compareYearMonths(newestMonth, currentMonth) >= 0 ? newestMonth : currentMonth;

}



/** fromMonth から toMonth までの連続 YYYY-MM 配列（両端含む） */

export function listYearMonthsInclusive(fromMonth: string, toMonth: string): string[] {

  if (compareYearMonths(fromMonth, toMonth) > 0) {

    return [];

  }



  const months: string[] = [];

  let cursor = fromMonth;



  while (compareYearMonths(cursor, toMonth) <= 0) {

    months.push(cursor);

    if (cursor === toMonth) {

      break;

    }

    cursor = getNextYearMonthKey(cursor);

  }



  return months;

}



function copyPayrollHistoryForMonth(

  source: PayrollHistoryRow,

  targetMonth: string

): PayrollHistoryRow {

  return {

    targetMonth,

    fixedWages: source.fixedWages,

    nonFixedWages: source.nonFixedWages,

    baseDays: source.baseDays,

    healthGrade: source.healthGrade,

    pensionGrade: source.pensionGrade,

  };

}



/**

 * 入力履歴の欠損月を補完する。

 * - 履歴と履歴の間: 直前（古い方）の履歴の給与情報をコピー

 * - 最新履歴〜現在月: 最新履歴の給与情報をコピー

 */

export function fillPayrollHistoryGaps(

  rows: PayrollHistoryRow[],

  referenceDate = new Date()

): PayrollHistoryRow[] {

  const sorted = sortPayrollHistoryRows(rows);

  if (sorted.length === 0) {

    return [];

  }



  const filled: PayrollHistoryRow[] = [];



  for (let index = 0; index < sorted.length; index += 1) {

    const anchor = sorted[index];

    filled.push({ ...anchor });



    const next = sorted[index + 1];

    if (!next) {

      continue;

    }



    const gapStart = getNextYearMonthKey(anchor.targetMonth);

    const gapEnd = getPreviousYearMonthKey(next.targetMonth);



    if (compareYearMonths(gapStart, gapEnd) > 0) {

      continue;

    }



    for (const month of listYearMonthsInclusive(gapStart, gapEnd)) {

      filled.push(copyPayrollHistoryForMonth(anchor, month));

    }

  }



  const newest = sorted[sorted.length - 1];

  const endMonth = resolvePayrollHistoryEndMonth(newest.targetMonth, referenceDate);

  const extensionStart = getNextYearMonthKey(newest.targetMonth);



  if (compareYearMonths(extensionStart, endMonth) <= 0) {

    for (const month of listYearMonthsInclusive(extensionStart, endMonth)) {

      filled.push(copyPayrollHistoryForMonth(newest, month));

    }

  }



  return sortPayrollHistoryRows(filled);

}


