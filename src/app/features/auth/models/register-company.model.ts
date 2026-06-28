export interface RegisterCompanyData {
  companyName: string;
  employerLastName: string;
  employerFirstName: string;
  employerLastNameKana: string;
  employerFirstNameKana: string;
  postalCode: string;
  prefecture: string;
  cityAddress: string;
  phoneNumber: string;
  prefectureCode: string;
  districtCode: string;
  referenceMark: string;
  officeNumber: string;
  /** システム利用開始年月（YYYY-MM） */
  systemStartDate: string;
  email: string;
  password: string;
  companyId: string;
}

export type RegisterCompanyField = keyof RegisterCompanyData | 'confirmPassword';
