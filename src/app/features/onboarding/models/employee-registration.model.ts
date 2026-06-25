export type EmployeeRegistrationType = 'new' | 'existing';

export type EmployeeGender = 'male' | 'female';

export interface EmployeeRegistrationFormData {
  employeeNumber: string;
  registrationType: EmployeeRegistrationType;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: string;
  gender: EmployeeGender;
  hireDate: string;
  myNumber: string;
  hasDependents: boolean;
  insuredPersonNumber: string;
  baseSalary: number;
  healthStandardRemuneration: number;
  pensionStandardRemuneration: number;
  /** 既存社員の給与・保険料適用開始年月（YYYY-MM）。新入社員は空文字 */
  applicableStartMonth: string;
}

export type EmployeeRegistrationField = keyof EmployeeRegistrationFormData;
