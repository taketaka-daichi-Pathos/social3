import { inject, Injectable } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import {
  collection,
  collectionData,
  doc,
  Firestore,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { FirestoreCollections } from '@core/models/firestore-collections';
import { CompanyService } from '@core/services/company.service';
import { EmployeeAuthService } from '@core/services/employee-auth.service';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee, EmployeeAllowance } from '@features/employees/models/employee.model';
import { EmployeeRegistrationFormData } from '@features/onboarding/models/employee-registration.model';
import { catchError, map, Observable, switchMap, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly companyService = inject(CompanyService);
  private readonly employeeAuthService = inject(EmployeeAuthService);

  watchEmployees(): Observable<Employee[]> {
    return authState(this.auth).pipe(
      switchMap((user) => {
        if (!user) {
          return throwError(() => new Error('ログインしていません'));
        }

        const employeesRef = collection(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees
        );

        return collectionData(query(employeesRef, orderBy('createdAt', 'desc')), {
          idField: 'id',
        }).pipe(
          map((rows) => rows.map((row) => this.toEmployee(row))),
          catchError((error) => {
            console.error('[EmployeeService] 従業員一覧の取得に失敗しました', error);
            return throwError(
              () =>
                new Error(
                  toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました')
                )
            );
          })
        );
      })
    );
  }

  async createEmployee(data: EmployeeRegistrationFormData): Promise<Employee> {
    const user = await requireAuthenticatedUser(this.auth);
    const companyUid = user.uid;
    const companyId = await this.companyService.getCompanyIdForCurrentUser();
    const employeeNumber = data.employeeNumber.trim();

    try {
      await this.ensureEmployeeNumberAvailable(companyUid, employeeNumber);
    } catch (error) {
      throw new Error(
        toFirestoreErrorMessage(error, '社員番号の確認に失敗しました')
      );
    }

    let authUid: string;
    let loginEmail: string;

    try {
      const account = await this.employeeAuthService.createEmployeeAccount(
        employeeNumber,
        companyId,
        data.birthDate
      );
      authUid = account.uid;
      loginEmail = account.email;
    } catch (error) {
      throw new Error(this.toAuthErrorMessage(error));
    }

    const employeesRef = collection(
      this.firestore,
      FirestoreCollections.companies,
      companyUid,
      FirestoreCollections.employees
    );
    const employeeRef = doc(employeesRef);

    const payload = {
      ...data,
      employeeNumber,
      applicableStartMonth:
        data.registrationType === 'existing' ? data.applicableStartMonth : '',
      companyOwnerUid: companyUid,
      authUid,
      loginEmail,
      resignationDate: null,
      status: 'active' as const,
      createdAt: serverTimestamp(),
    };

    try {
      await setDoc(employeeRef, payload);
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '従業員の保存に失敗しました'));
    }

    return {
      id: employeeRef.id,
      companyOwnerUid: companyUid,
      authUid,
      loginEmail,
      resignationDate: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      allowances: [],
      ...data,
      employeeNumber,
    };
  }

  async updateEmployeePayrollData(
    employeeId: string,
    data: { baseSalary: number; allowances: EmployeeAllowance[] }
  ): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        {
          baseSalary: data.baseSalary,
          allowances: data.allowances,
        }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '従業員マスタの更新に失敗しました'));
    }
  }

  private async ensureEmployeeNumberAvailable(
    companyUid: string,
    employeeNumber: string
  ): Promise<void> {
    const employeesRef = collection(
      this.firestore,
      FirestoreCollections.companies,
      companyUid,
      FirestoreCollections.employees
    );
    const snapshot = await getDocs(
      query(employeesRef, where('employeeNumber', '==', employeeNumber))
    );

    if (!snapshot.empty) {
      throw new Error('この社員番号は既に登録されています');
    }
  }

  private toEmployee(row: Record<string, unknown>): Employee {
    return {
      id: String(row['id'] ?? ''),
      employeeNumber: String(row['employeeNumber'] ?? ''),
      companyOwnerUid: String(row['companyOwnerUid'] ?? ''),
      authUid: row['authUid'] ? String(row['authUid']) : null,
      loginEmail: row['loginEmail'] ? String(row['loginEmail']) : null,
      registrationType: row['registrationType'] as Employee['registrationType'],
      lastName: String(row['lastName'] ?? ''),
      firstName: String(row['firstName'] ?? ''),
      lastNameKana: String(row['lastNameKana'] ?? ''),
      firstNameKana: String(row['firstNameKana'] ?? ''),
      birthDate: this.normalizeDateField(row['birthDate']),
      gender: row['gender'] === 'female' ? 'female' : 'male',
      hireDate: this.normalizeDateField(row['hireDate']),
      myNumber: String(row['myNumber'] ?? ''),
      hasDependents: Boolean(row['hasDependents']),
      insuredPersonNumber: String(row['insuredPersonNumber'] ?? ''),
      baseSalary: Number(row['baseSalary'] ?? 0),
      healthStandardRemuneration: Number(
        row['healthStandardRemuneration'] ?? row['standardRemuneration'] ?? 0
      ),
      pensionStandardRemuneration: Number(
        row['pensionStandardRemuneration'] ?? row['standardRemuneration'] ?? 0
      ),
      applicableStartMonth: this.resolveApplicableStartMonth(row),
      resignationDate: row['resignationDate'] ? String(row['resignationDate']) : null,
      status: row['status'] === 'retired' ? 'retired' : 'active',
      allowances: this.toEmployeeAllowances(row['allowances']),
      createdAt: this.toIsoString(row['createdAt']),
    };
  }

  private resolveApplicableStartMonth(row: Record<string, unknown>): string {
    const direct = String(row['applicableStartMonth'] ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(direct)) {
      return direct;
    }

    const legacyBase = String(row['baseSalaryStartMonth'] ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(legacyBase)) {
      return legacyBase;
    }

    const legacyStandard = String(row['standardRemunerationStartMonth'] ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(legacyStandard)) {
      return legacyStandard;
    }

    return '';
  }

  private toEmployeeAllowances(value: unknown): EmployeeAllowance[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        name: String(item['name'] ?? ''),
        amount: item['amount'] == null ? null : Number(item['amount']),
      };
    });
  }

  private normalizeDateField(value: unknown): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      const isoPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
      if (isoPrefix) {
        return isoPrefix[1];
      }

      return trimmed;
    }

    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      const date = (value as { toDate: () => Date }).toDate();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return String(value);
  }

  private toIsoString(value: unknown): string {
    if (value && typeof value === 'object' && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    return typeof value === 'string' ? value : new Date().toISOString();
  }

  private toAuthErrorMessage(error: unknown): string {
    const code = (error as { code?: string })?.code;

    switch (code) {
      case 'auth/email-already-in-use':
        return 'この社員番号は既にログインアカウントとして登録されています';
      case 'auth/weak-password':
        return '生年月日から生成したパスワードが弱すぎます';
      case 'auth/invalid-email':
        return '社員番号の形式が正しくありません';
      default:
        return 'ログインアカウントの作成に失敗しました';
    }
  }
}
