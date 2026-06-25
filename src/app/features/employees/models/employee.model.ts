import { EmployeeRegistrationFormData } from '@features/onboarding/models/employee-registration.model';

export type EmployeeStatus = 'active' | 'retired';

export interface EmployeeAllowance {
  name: string;
  amount: number | null;
}

export interface Employee extends EmployeeRegistrationFormData {
  id: string;
  companyOwnerUid: string;
  authUid: string | null;
  loginEmail: string | null;
  resignationDate: string | null;
  status: EmployeeStatus;
  createdAt: string;
  allowances: EmployeeAllowance[];
}

export type EmployeeListTab = 'pre' | 'active' | 'retired';
