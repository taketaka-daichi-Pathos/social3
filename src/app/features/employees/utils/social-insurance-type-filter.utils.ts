import { Employee } from '@features/employees/models/employee.model';
import { SocialInsuranceType } from '@features/onboarding/models/employee-registration.model';

export type SocialInsuranceCategoryFilter = 'all' | SocialInsuranceType;

export const SOCIAL_INSURANCE_CATEGORY_FILTER_OPTIONS: ReadonlyArray<{
  value: SocialInsuranceCategoryFilter;
  label: string;
}> = [
  { value: 'all', label: 'すべて表示' },
  { value: 'general', label: '一般の被保険者' },
  { value: 'short_time_worker', label: '短時間就労者' },
  { value: 'part_time_special', label: '短時間労働者' },
];

export function matchesSocialInsuranceCategoryFilter(
  employee: Pick<Employee, 'socialInsuranceType'>,
  filter: SocialInsuranceCategoryFilter
): boolean {
  if (filter === 'all') {
    return true;
  }

  return (employee.socialInsuranceType ?? 'general') === filter;
}

export function filterEmployeesBySocialInsuranceCategory<T extends Pick<Employee, 'socialInsuranceType'>>(
  employees: T[],
  filter: SocialInsuranceCategoryFilter
): T[] {
  if (filter === 'all') {
    return employees;
  }

  return employees.filter((employee) => matchesSocialInsuranceCategoryFilter(employee, filter));
}
