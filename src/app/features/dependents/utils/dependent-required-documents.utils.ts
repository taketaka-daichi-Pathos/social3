import { calculateAgeAtDate } from '@core/utils/date.utils';
import {
  DependentCurrentSituation,
  DependentLivingArrangement,
  DependentOccupation,
} from '@features/dependents/models/dependent.model';

export interface DependentDocumentCriteria {
  birthDate: string;
  occupation: DependentOccupation | '';
  currentSituation: DependentCurrentSituation | '';
  livingArrangement: DependentLivingArrangement | '';
}

export const REMITTANCE_BANKBOOK_DOC = '仕送りしている通帳のコピー';

function formatTodayIso(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveAge(birthDate: string, referenceDate: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())) {
    return null;
  }

  return calculateAgeAtDate(birthDate, formatTodayIso(referenceDate));
}

function isCohabiting(livingArrangement: DependentLivingArrangement | ''): boolean {
  return livingArrangement === 'cohabiting';
}

function isSeparate(livingArrangement: DependentLivingArrangement | ''): boolean {
  return livingArrangement === 'separate';
}

function isUnemployedOrPartTime(occupation: DependentOccupation | ''): boolean {
  return occupation === 'unemployed' || occupation === 'part_time';
}

function matchesRule1(
  occupation: DependentOccupation | '',
  currentSituation: DependentCurrentSituation | ''
): boolean {
  return occupation === 'unemployed' && currentSituation === 'recently_unemployed';
}

/** 入力内容から必要な証明書類リストを算出 */
export function resolveRequiredDependentDocuments(
  criteria: DependentDocumentCriteria,
  referenceDate: Date = new Date()
): string[] {
  const { birthDate, occupation, currentSituation, livingArrangement } = criteria;
  const age = resolveAge(birthDate, referenceDate);
  const documents: string[] = [];

  const pushUnique = (label: string) => {
    if (!documents.includes(label)) {
      documents.push(label);
    }
  };

  // ① 職業=無職 かつ 現在の状況=直近で退職
  if (matchesRule1(occupation, currentSituation)) {
    pushUnique('退職証明書または離職票（１・２）のコピー');
  }

  // ② 年齢=16歳以上 かつ 職業=学生 かつ 同居
  if (age != null && age >= 16 && occupation === 'student' && isCohabiting(livingArrangement)) {
    pushUnique('学生証のコピーまたは、在学証明書');
  }

  // ③ 職業=無職またはパート かつ 同居（①を除く）
  if (
    isUnemployedOrPartTime(occupation) &&
    isCohabiting(livingArrangement) &&
    !matchesRule1(occupation, currentSituation)
  ) {
    pushUnique('最新の非課税証明書（または課税証明書）');
  }

  // ④ 職業=学生 かつ 別居
  if (occupation === 'student' && isSeparate(livingArrangement)) {
    pushUnique('学生証のコピー');
    pushUnique(REMITTANCE_BANKBOOK_DOC);
  }

  // ⑤ 年齢=60歳未満 かつ 職業=無職またはパート かつ 別居
  if (
    age != null &&
    age < 60 &&
    isUnemployedOrPartTime(occupation) &&
    isSeparate(livingArrangement)
  ) {
    pushUnique('最新の非課税証明書（6月に毎年更新）');
    pushUnique(REMITTANCE_BANKBOOK_DOC);
  }

  // ⑥ 現在の状況=直近で退職 かつ 別居
  if (currentSituation === 'recently_unemployed' && isSeparate(livingArrangement)) {
    pushUnique('退職証明書または離職票');
    pushUnique(REMITTANCE_BANKBOOK_DOC);
  }

  // ⑦ 年齢=60歳以上 かつ 現在の状況=年金受給者
  if (age != null && age >= 60 && currentSituation === 'pension_recipient') {
    pushUnique('年金振込通知書');
    pushUnique('年金額改定通知書');
  }

  return documents;
}
