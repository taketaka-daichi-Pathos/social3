import { inject, Injectable } from '@angular/core';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import {
  doc,
  Firestore,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { CompanyDocument } from '@core/models/company-document.model';
import { FirestoreCollections } from '@core/models/firestore-collections';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { RegisterCompanyData } from '@features/auth/models/register-company.model';
import { CompanySettings, DEFAULT_COMPANY_ALLOWANCES } from '@features/settings/models/company-settings.model';
import { LONG_TERM_CARE_INSURANCE_RATE } from '@features/settings/models/prefecture-insurance-rates.constants';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);

  async registerCompany(data: RegisterCompanyData): Promise<void> {
    const credential = await createUserWithEmailAndPassword(
      this.auth,
      data.email,
      data.password
    );
    const uid = credential.user.uid;
    const { password: _, address, ...companyFields } = data;

    const document: CompanyDocument = {
      ...companyFields,
      prefecture: '',
      cityAddress: address,
      healthInsuranceRate: null,
      longTermCareInsuranceRate: LONG_TERM_CARE_INSURANCE_RATE,
      allowances: [...DEFAULT_COMPANY_ALLOWANCES],
      ownerUid: uid,
    };

    await setDoc(doc(this.firestore, FirestoreCollections.companies, uid), {
      ...document,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async getCompanyForCurrentUser(): Promise<CompanySettings | null> {
    const user = await requireAuthenticatedUser(this.auth).catch(() => null);
    if (!user) {
      return null;
    }

    const snapshot = await getDoc(doc(this.firestore, FirestoreCollections.companies, user.uid));
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data() as CompanyDocument;
    return this.toCompanySettings(data);
  }

  async getCompanyIdForCurrentUser(): Promise<string> {
    const company = await this.getCompanyForCurrentUser();
    if (!company?.companyId) {
      throw new Error('会社情報が見つかりません');
    }
    return company.companyId;
  }

  async updateCompany(settings: CompanySettings): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);

    const { companyId, ...updatable } = settings;

    await updateDoc(doc(this.firestore, FirestoreCollections.companies, user.uid), {
      ...updatable,
      companyId,
      updatedAt: serverTimestamp(),
    });
  }

  private toCompanySettings(data: CompanyDocument): CompanySettings {
    const legacyAddress = data.address;

    return {
      companyId: data.companyId,
      companyName: data.companyName,
      ownerName: data.ownerName,
      postalCode: data.postalCode,
      prefecture: data.prefecture ?? '',
      cityAddress: data.cityAddress ?? legacyAddress ?? '',
      phoneNumber: data.phoneNumber,
      prefectureCode: data.prefectureCode,
      districtCode: data.districtCode,
      referenceMark: data.referenceMark,
      officeNumber: data.officeNumber,
      healthInsuranceRate: data.healthInsuranceRate ?? null,
      longTermCareInsuranceRate:
        data.longTermCareInsuranceRate ?? LONG_TERM_CARE_INSURANCE_RATE,
      allowances:
        data.allowances?.length ? data.allowances : [...DEFAULT_COMPANY_ALLOWANCES],
    };
  }
}
