import { Dependent } from '@features/dependents/models/dependent.model';
import { AddDependentWorkflowRequestPayload } from '@features/workflow/models/workflow-request-payload.model';
import { parseAddDependentWorkflowPayload } from '@features/workflow/utils/workflow-payload.utils';

const VALID_RELATIONSHIPS: Dependent['relationship'][] = [
  'spouse',
  'child',
  'parent',
  'grandparent',
  'sibling',
  'other',
];

const VALID_LIVING_ARRANGEMENTS: Dependent['livingArrangement'][] = ['cohabiting', 'separate'];

const VALID_OCCUPATIONS: Dependent['occupation'][] = [
  'unemployed',
  'part_time',
  'student',
  'employee',
  'self_employed',
  'other',
];

const VALID_SITUATIONS: Dependent['currentSituation'][] = [
  'student_over_16',
  'recently_unemployed',
  'ongoing_unemployed_or_part_time',
  'pension_recipient',
  'other',
];

export function isPdfDocumentUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return normalized.includes('.pdf') || normalized.includes('application%2fpdf');
}

export function isImageDocumentUrl(url: string): boolean {
  if (!url.trim() || isPdfDocumentUrl(url)) {
    return false;
  }

  return true;
}

export function extractAddDependentDocumentUrls(payload: Record<string, unknown>): string[] {
  return parseAddDependentWorkflowPayload(payload).documentUrls;
}

/** 扶養追加申請 payload から扶養家族マスタ登録用データを生成 */
export function buildDependentFromAddDependentWorkflowPayload(
  payload: Record<string, unknown>
): Dependent | null {
  const parsed = parseAddDependentWorkflowPayload(payload);
  return buildDependentFromParsedPayload(parsed);
}

export function buildDependentFromParsedPayload(
  parsed: AddDependentWorkflowRequestPayload
): Dependent | null {
  const lastName = parsed.lastName.trim();
  const firstName = parsed.firstName.trim();
  const birthDate = parsed.birthDate.trim();
  const dependencyStartDate = parsed.dependencyStartDate.trim();

  if (!lastName || !firstName || !birthDate || !dependencyStartDate) {
    return null;
  }

  const relationship = parsed.relationship.trim();
  const livingArrangement = parsed.livingArrangement.trim();
  const occupation = parsed.occupation.trim();
  const currentSituation = parsed.currentSituation.trim();

  return {
    lastName,
    firstName,
    lastNameKana: parsed.lastNameKana.trim(),
    firstNameKana: parsed.firstNameKana.trim(),
    romanName: '',
    birthDate,
    relationship: VALID_RELATIONSHIPS.includes(relationship as Dependent['relationship'])
      ? (relationship as Dependent['relationship'])
      : 'other',
    livingArrangement: VALID_LIVING_ARRANGEMENTS.includes(
      livingArrangement as Dependent['livingArrangement']
    )
      ? (livingArrangement as Dependent['livingArrangement'])
      : 'cohabiting',
    dependencyStartDate,
    hasDisability: parsed.hasDisability === true,
    occupation: VALID_OCCUPATIONS.includes(occupation as Dependent['occupation'])
      ? (occupation as Dependent['occupation'])
      : 'other',
    currentSituation: VALID_SITUATIONS.includes(currentSituation as Dependent['currentSituation'])
      ? (currentSituation as Dependent['currentSituation'])
      : 'other',
    documentUrls: parsed.documentUrls,
  };
}
