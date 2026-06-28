import {
  DEPENDENT_OCCUPATION_OPTIONS,
  DEPENDENT_RELATIONSHIP_OPTIONS,
  DEPENDENT_SITUATION_OPTIONS,
  Dependent,
  DependentCurrentSituation,
  DependentLivingArrangement,
  DependentOccupation,
  DependentRelationship,
} from '@features/dependents/models/dependent.model';

export interface DependentTableRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  dependent: Dependent;
}

export function dependentFullName(dependent: Dependent): string {
  return `${dependent.lastName} ${dependent.firstName}`;
}

export function dependentRelationshipLabel(relationship: DependentRelationship): string {
  return (
    DEPENDENT_RELATIONSHIP_OPTIONS.find((option) => option.value === relationship)?.label ?? 'その他'
  );
}

export function dependentOccupationLabel(occupation: DependentOccupation): string {
  return DEPENDENT_OCCUPATION_OPTIONS.find((option) => option.value === occupation)?.label ?? '—';
}

export function dependentSituationLabel(situation: DependentCurrentSituation): string {
  return DEPENDENT_SITUATION_OPTIONS.find((option) => option.value === situation)?.label ?? '—';
}

export function dependentLivingArrangementLabel(
  livingArrangement: DependentLivingArrangement
): string {
  return livingArrangement === 'separate' ? '別居' : '同居';
}

/** 閲覧用: 扶養状況の要約 */
export function dependentStatusLabel(dependent: Dependent): string {
  const living = dependentLivingArrangementLabel(dependent.livingArrangement);
  const disability = dependent.hasDisability ? '障害あり' : '障害なし';
  return `${living} / ${disability}`;
}

export function listDependentRowsForEmployee(
  employeeId: string,
  employeeNumber: string,
  employeeName: string,
  dependents: Dependent[] | undefined
): DependentTableRow[] {
  return (dependents ?? []).map((dependent) => ({
    employeeId,
    employeeNumber,
    employeeName,
    dependent,
  }));
}
