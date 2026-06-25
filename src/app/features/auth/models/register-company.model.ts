export interface RegisterCompanyData {
  companyName: string;
  ownerName: string;
  postalCode: string;
  address: string;
  phoneNumber: string;
  prefectureCode: string;
  districtCode: string;
  referenceMark: string;
  officeNumber: string;
  email: string;
  password: string;
  companyId: string;
}

export type RegisterCompanyField = keyof RegisterCompanyData | 'confirmPassword';
