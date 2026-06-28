import { EmployeeAllowance } from '@features/employees/models/employee.model';
import { CompanyAllowance } from '@features/settings/models/company-settings.model';
import { getAllowanceTemplate } from '@features/payroll/utils/compensation.utils';

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

/** Firestore 保存用に会社手当配列を正規化（空の手当名は除外） */
export function normalizeCompanyAllowancesForSave(
  rows: ReadonlyArray<{ name: string; amount: number | null }>
): CompanyAllowance[] {
  return rows
    .map((row) => ({
      name: String(row.name ?? '').trim(),
      amount: normalizeAllowanceAmount(row.amount),
    }))
    .filter((row) => row.name.length > 0);
}

function normalizeAllowanceAmount(value: number | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}