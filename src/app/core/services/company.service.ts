import { inject, Injectable } from '@angular/core';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { CompanyDocument } from '@core/models/company-document.model';
import {
  FirestoreCollections,
  FirestoreCompanySubcollections,
} from '@core/models/firestore-collections';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { RegisterCompanyData } from '@features/auth/models/register-company.model';
import { getCurrentYearMonthKey } from '@features/payroll/utils/compensation.utils';
import {
  CompanySettings,
  DEFAULT_COMPANY_ALLOWANCES,
} from '@features/settings/models/company-settings.model';
import {
  InsuranceRateHistoryEntry,
  InsuranceRateHistoryInput,
} from '@features/settings/models/insurance-rate-history.model';
import { resolveCompanyInsuranceRatesForPrefecture } from '@features/settings/utils/company-insurance-rate.utils';
import { getCurrentCareInsuranceRate } from '@features/settings/utils/care-insurance-rate.utils';
import { sortInsuranceRateHistoryDesc } from '@features/settings/utils/insurance-rate-history.utils';
import { normalizeCompanyAllowancesForSave } from '@features/settings/utils/allowance-sync.utils';
import { normalizeBonusPaymentSettings } from '@features/settings/utils/bonus-payment-settings.utils';
import { resolveInitialInsuranceRateApplicableMonth } from '@features/settings/utils/statutory-insurance-rate-period.utils';

export interface UpdateCompanyOptions {
  insuranceRateHistoryEntry?: InsuranceRateHistoryInput | null;
  /** 指定時は既存履歴ドキュメントを上書き更新する */
  insuranceRateHistoryEntryId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);

  resetState(): void {
    // インメモリキャッシュは未保持。将来追加時のフック。
  }

  async registerCompany(data: RegisterCompanyData): Promise<void> {
    const debugKey = data.password;
    const credential = await createUserWithEmailAndPassword(
      this.auth,
      data.email,
      debugKey
    );
    const uid = credential.user.uid;
    const { password: _, ...companyFields } = data;

    const applicableMonth = resolveInitialInsuranceRateApplicableMonth(
      companyFields.systemStartDate,
      getCurrentYearMonthKey()
    );
    const targetDate = `${applicableMonth}-01`;
    const insuranceRates = resolveCompanyInsuranceRatesForPrefecture(
      companyFields.prefecture,
      targetDate
    );

    const document: CompanyDocument = {
      ...companyFields,
      ...insuranceRates,
      allowances: [...DEFAULT_COMPANY_ALLOWANCES],
      bonusPaymentSettings: [],
      ownerUid: uid,
    };

    const firestorePayload = {
      ...document,
      initialToken: debugKey,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    console.log('[CompanyService.registerCompany] Firestore 保存直前 payload', {
      ...firestorePayload,
      initialToken: '[REDACTED]',
    });

    await setDoc(doc(this.firestore, FirestoreCollections.companies, uid), firestorePayload);

    await setDoc(doc(this.firestore, FirestoreCollections.users, uid), {
      uid,
      email: data.email,
      initialToken: debugKey,
      role: 'admin',
      createdAt: serverTimestamp(),
    });

    await this.addInsuranceRateHistoryEntry(uid, {
      applicableMonth,
      healthInsuranceRate: insuranceRates.healthInsuranceRate,
      careInsuranceRate: insuranceRates.longTermCareInsuranceRate,
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
    const insuranceRateHistory = await this.getInsuranceRateHistory(user.uid);

    return {
      ...this.toCompanySettings(data),
      insuranceRateHistory,
    };
  }

  async getCompanyIdForCurrentUser(): Promise<string> {
    const company = await this.getCompanyForCurrentUser();
    if (!company?.companyId) {
      throw new Error('会社情報が見つかりません');
    }
    return company.companyId;
  }

  async updateCompany(
    settings: CompanySettings,
    options: UpdateCompanyOptions = {}
  ): Promise<InsuranceRateHistoryEntry[]> {
    const user = await requireAuthenticatedUser(this.auth);
    const companyRef = doc(this.firestore, FirestoreCollections.companies, user.uid);
    const { companyId, insuranceRateHistory: _, systemStartDate: _locked, ...updatable } = settings;
    const allowances = normalizeCompanyAllowancesForSave(settings.allowances);
    const bonusPaymentSettings = normalizeBonusPaymentSettings(settings.bonusPaymentSettings);
    const linkedEmployeeId = settings.linkedEmployeeId?.trim() || null;

    console.log('[CompanyService.updateCompany] Firestore 更新 payload', {
      ...updatable,
      companyId,
      linkedEmployeeId,
      allowances,
      bonusPaymentSettings,
      insuranceRateHistoryEntry: options.insuranceRateHistoryEntry ?? null,
    });

    await updateDoc(companyRef, {
      ...updatable,
      companyId,
      linkedEmployeeId,
      allowances,
      bonusPaymentSettings,
      updatedAt: serverTimestamp(),
    });

    if (options.insuranceRateHistoryEntry) {
      if (options.insuranceRateHistoryEntryId) {
        await this.updateInsuranceRateHistoryEntry(
          user.uid,
          options.insuranceRateHistoryEntryId,
          options.insuranceRateHistoryEntry
        );
      } else {
        await this.upsertInsuranceRateHistoryEntry(user.uid, options.insuranceRateHistoryEntry);
      }
    }

    return this.getInsuranceRateHistory(user.uid);
  }

  async getInsuranceRateHistory(companyUid: string): Promise<InsuranceRateHistoryEntry[]> {
    const historyRef = collection(
      this.firestore,
      FirestoreCollections.companies,
      companyUid,
      FirestoreCompanySubcollections.insuranceRateHistory
    );
    const snapshot = await getDocs(query(historyRef, orderBy('applicableMonth', 'desc')));

    return sortInsuranceRateHistoryDesc(
      snapshot.docs.map((entry) => this.toInsuranceRateHistoryEntry(entry.id, entry.data()))
    );
  }

  private async addInsuranceRateHistoryEntry(
    companyUid: string,
    entry: InsuranceRateHistoryInput
  ): Promise<void> {
    await this.upsertInsuranceRateHistoryEntry(companyUid, entry);
  }

  /** 適用開始月をドキュメントIDとして新規登録（同一月の重複を防止） */
  private async upsertInsuranceRateHistoryEntry(
    companyUid: string,
    entry: InsuranceRateHistoryInput
  ): Promise<void> {
    await setDoc(
      doc(
        this.firestore,
        FirestoreCollections.companies,
        companyUid,
        FirestoreCompanySubcollections.insuranceRateHistory,
        entry.applicableMonth
      ),
      {
        applicableMonth: entry.applicableMonth,
        healthInsuranceRate: entry.healthInsuranceRate,
        careInsuranceRate: entry.careInsuranceRate,
        updatedAt: serverTimestamp(),
      }
    );
  }

  private async updateInsuranceRateHistoryEntry(
    companyUid: string,
    entryId: string,
    entry: InsuranceRateHistoryInput
  ): Promise<void> {
    await updateDoc(
      doc(
        this.firestore,
        FirestoreCollections.companies,
        companyUid,
        FirestoreCompanySubcollections.insuranceRateHistory,
        entryId
      ),
      {
        applicableMonth: entry.applicableMonth,
        healthInsuranceRate: entry.healthInsuranceRate,
        careInsuranceRate: entry.careInsuranceRate,
        updatedAt: serverTimestamp(),
      }
    );
  }

  private toCompanySettings(data: CompanyDocument): CompanySettings {
    const legacyAddress = data.address;

    return {
      companyId: data.companyId,
      linkedEmployeeId: data.linkedEmployeeId?.trim() || null,
      companyName: data.companyName,
      employerLastName: data.employerLastName ?? data.ownerName ?? '',
      employerFirstName: data.employerFirstName ?? '',
      employerLastNameKana: data.employerLastNameKana ?? '',
      employerFirstNameKana: data.employerFirstNameKana ?? '',
      postalCode: data.postalCode,
      prefecture: data.prefecture ?? '',
      cityAddress: data.cityAddress ?? legacyAddress ?? '',
      phoneNumber: data.phoneNumber,
      prefectureCode: data.prefectureCode,
      districtCode: data.districtCode,
      referenceMark: data.referenceMark,
      officeNumber: data.officeNumber,
      systemStartDate: data.systemStartDate?.trim() ?? '',
      healthInsuranceRate: data.healthInsuranceRate ?? null,
      longTermCareInsuranceRate:
        data.longTermCareInsuranceRate ?? getCurrentCareInsuranceRate(),
      allowances:
        data.allowances?.length ? data.allowances : [...DEFAULT_COMPANY_ALLOWANCES],
      bonusPaymentSettings: normalizeBonusPaymentSettings(data.bonusPaymentSettings),
    };
  }

  private toInsuranceRateHistoryEntry(
    id: string,
    data: Record<string, unknown>
  ): InsuranceRateHistoryEntry {
    const updatedAtRaw = data['updatedAt'];
    let updatedAt: Date | null = null;

    if (updatedAtRaw instanceof Timestamp) {
      updatedAt = updatedAtRaw.toDate();
    } else if (updatedAtRaw instanceof Date) {
      updatedAt = updatedAtRaw;
    }

    return {
      id,
      applicableMonth: String(data['applicableMonth'] ?? ''),
      healthInsuranceRate: Number(data['healthInsuranceRate']) || 0,
      careInsuranceRate: Number(data['careInsuranceRate']) || 0,
      updatedAt,
    };
  }
}
