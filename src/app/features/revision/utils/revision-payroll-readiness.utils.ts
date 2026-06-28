import {
  AnnualDeterminationMonthDetail,
  OccasionalRevisionMonthDetail,
} from '@features/revision/models/revision.model';

export const REVISION_MISSING_PAYROLL_NOTE = '給与未保存';

export const REVISION_MISSING_PAYROLL_APPLY_TOOLTIP =
  '※対象月の給与が未保存のため適用できません';

export const REVISION_MISSING_PAYROLL_APPLY_ERROR =
  '対象月の給与が未保存のため適用できません';

type RevisionMonthDetail = Pick<
  AnnualDeterminationMonthDetail | OccasionalRevisionMonthDetail,
  'note'
>;

/** 計算対象月のいずれかに給与未保存があるか（月次チップの note 判定と同一） */
export function hasMissingPayrollInRevisionMonthDetails(
  monthDetails: readonly RevisionMonthDetail[]
): boolean {
  return monthDetails.some((month) => month.note === REVISION_MISSING_PAYROLL_NOTE);
}
