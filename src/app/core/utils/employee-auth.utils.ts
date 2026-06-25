const EMPLOYEE_AUTH_EMAIL_DOMAIN = 'employees.social3.app';

/** 社員番号と会社IDから Firebase Auth 用のメールアドレスを生成する */
export function toEmployeeAuthEmail(employeeNumber: string, companyId: string): string {
  const normalizedNumber = employeeNumber.trim().toLowerCase();
  const normalizedCompanyId = companyId.trim();
  return `${normalizedNumber}@${normalizedCompanyId}.${EMPLOYEE_AUTH_EMAIL_DOMAIN}`;
}

/** 生年月日（YYYY-MM-DD）を初期パスワード（YYYYMMDD）に変換する */
export function birthDateToPassword(birthDate: string): string {
  return birthDate.replace(/-/g, '');
}
