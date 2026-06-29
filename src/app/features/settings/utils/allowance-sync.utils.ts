import { EmployeeAllowance } from '@features/employees/models/employee.model';
import {
  CompanyAllowance,
  CompanyAllowanceFormField,
  FIXED_COMPANY_ALLOWANCES,
} from '@features/settings/models/company-settings.model';
import { getAllowanceTemplate } from '@features/payroll/utils/compensation.utils';

export type CompanyAllowanceFormValues = Record<CompanyAllowanceFormField, number | null>;

export const COMPANY_ALLOWANCE_FORM_FIELDS: readonly CompanyAllowanceFormField[] =
  FIXED_COMPANY_ALLOWANCES.map(({ key }) => key);

/** 会社手当マスターの金額を従業員マスターへ反映（手当名は会社テンプレートに合わせる） */
export function syncEmployeeAllowancesFromCompany(
  employeeAllowances: EmployeeAllowance[],
  companyAllowances: CompanyAllowance[]
): EmployeeAllowance[] {
  const template = getAllowanceTemplate(companyAllowances);

  return template.map((companyRow) => {
    const existing = employeeAllowances.find((row) => row.name === companyRow.name);

    return {
      name: companyRow.name,
      amount: companyRow.amount ?? existing?.amount ?? null,
    };
  });
}

/** 新規従業員登録時に会社手当マスターを初期値として付与 */
export function initialEmployeeAllowancesFromCompany(
  companyAllowances: CompanyAllowance[]
): EmployeeAllowance[] {
  return syncEmployeeAllowancesFromCompany([], companyAllowances);
}

/** Firestore 保存用に会社手当を固定5項目へ正規化 */
export function normalizeCompanyAllowancesForSave(
  rows: ReadonlyArray<{ name: string; amount: number | null }>
): CompanyAllowance[] {
  return companyAllowancesFromFormValues(formValuesFromCompanyAllowances([...rows]));
}

export function formValuesFromCompanyAllowances(
  allowances: CompanyAllowance[]
): CompanyAllowanceFormValues {
  const template = getAllowanceTemplate(allowances);
  const byName = new Map(template.map((row) => [row.name, row.amount ?? null]));

  return Object.fromEntries(
    FIXED_COMPANY_ALLOWANCES.map(({ key, name }) => [key, byName.get(name) ?? null])
  ) as CompanyAllowanceFormValues;
}

export function companyAllowancesFromFormValues(
  values: CompanyAllowanceFormValues
): CompanyAllowance[] {
  return FIXED_COMPANY_ALLOWANCES.map(({ key, name }) => ({
    name,
    amount: normalizeAllowanceAmount(values[key]),
  }));
}

function normalizeAllowanceAmount(value: number | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
