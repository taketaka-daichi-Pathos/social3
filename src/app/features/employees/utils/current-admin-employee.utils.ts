import { Employee } from '@features/employees/models/employee.model';
import { CompanySettings } from '@features/settings/models/company-settings.model';

export function normalizeContactEmail(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * 管理者アカウントに紐づく従業員レコードを解決する。
 * 優先順位: 管理者メールと従業員 email の一致 > linkedEmployeeId（明示的紐付け）
 */
export function resolveLinkedEmployeeForAdmin(
  employees: Employee[],
  company: CompanySettings | null | undefined,
  adminEmail: string | null | undefined
): Employee | null {
  if (!company) {
    return null;
  }

  const normalizedAdminEmail = normalizeContactEmail(adminEmail);
  if (normalizedAdminEmail) {
    const byEmail = employees.find(
      (employee) => normalizeContactEmail(employee.email) === normalizedAdminEmail
    );
    if (byEmail) {
      return byEmail;
    }
  }

  const linkedId = company.linkedEmployeeId?.trim();
  if (linkedId) {
    const byLinkedId = employees.find((employee) => employee.id === linkedId);
    if (byLinkedId) {
      return byLinkedId;
    }
  }

  return null;
}

/** resolveLinkedEmployeeForAdmin のエイリアス（既存呼び出し互換） */
export function resolveCurrentAdminEmployee(
  employees: Employee[],
  _authUid: string | null | undefined,
  company: CompanySettings | null | undefined,
  adminEmail?: string | null
): Employee | null {
  return resolveLinkedEmployeeForAdmin(employees, company, adminEmail);
}
