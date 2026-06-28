import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from '@angular/fire/firestore';
import { FirestoreCollections } from '@core/models/firestore-collections';
import { CompanyService } from '@core/services/company.service';
import { EmployeeService } from '@core/services/employee.service';
import { parseEmployeeAuthEmail } from '@core/utils/employee-auth.utils';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { Employee } from '@features/employees/models/employee.model';
import { resolveLinkedEmployeeForAdmin } from '@features/employees/utils/current-admin-employee.utils';
import { firstValueFrom, take } from 'rxjs';

export interface EmployeeSession {
  authUid: string;
  companyOwnerUid: string;
  companyId: string;
  employee: Employee;
  /** 管理者セッションから従業員ポータルを閲覧している場合 true */
  isAdminProxy: boolean;
}

@Injectable({ providedIn: 'root' })
export class EmployeeSessionService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly employeeService = inject(EmployeeService);
  private readonly companyService = inject(CompanyService);

  async isCompanyAdmin(uid: string): Promise<boolean> {
    const snapshot = await getDoc(doc(this.firestore, FirestoreCollections.companies, uid));
    return snapshot.exists();
  }

  async resolveCurrentSession(): Promise<EmployeeSession | null> {
    const user = await requireAuthenticatedUser(this.auth).catch(() => null);
    if (!user) {
      return null;
    }

    if (await this.isCompanyAdmin(user.uid)) {
      return this.resolveAdminLinkedSession(user.uid);
    }

    return this.resolveEmployeeSessionByAuthUser(user.uid, user.email ?? '');
  }

  async resolveLinkedEmployeeForCurrentAdmin(): Promise<Employee | null> {
    const user = await requireAuthenticatedUser(this.auth).catch(() => null);
    if (!user || !(await this.isCompanyAdmin(user.uid))) {
      return null;
    }

    const session = await this.resolveAdminLinkedSession(user.uid);
    return session?.employee ?? null;
  }

  private async resolveAdminLinkedSession(adminUid: string): Promise<EmployeeSession | null> {
    const user = this.auth.currentUser;
    const company = await this.companyService.getCompanyForCurrentUser();
    if (!company) {
      return null;
    }

    const employees = await firstValueFrom(this.employeeService.watchEmployees().pipe(take(1)));
    const employee = resolveLinkedEmployeeForAdmin(employees, company, user?.email ?? null);
    if (!employee) {
      return null;
    }

    return {
      authUid: adminUid,
      companyOwnerUid: adminUid,
      companyId: company.companyId,
      employee,
      isAdminProxy: true,
    };
  }

  async resolveEmployeeSessionByAuthUser(
    authUid: string,
    email: string
  ): Promise<EmployeeSession | null> {
    const parsed = parseEmployeeAuthEmail(email);
    if (!parsed) {
      return null;
    }

    const companySnapshot = await getDocs(
      query(
        collection(this.firestore, FirestoreCollections.companies),
        where('companyId', '==', parsed.companyId),
        limit(1)
      )
    );

    const companyDoc = companySnapshot.docs[0];
    if (!companyDoc) {
      return null;
    }

    const companyOwnerUid = companyDoc.id;
    const employee = await this.employeeService.findEmployeeByNumber(
      companyOwnerUid,
      parsed.employeeNumber
    );

    if (!employee) {
      return null;
    }

    return {
      authUid,
      companyOwnerUid,
      companyId: parsed.companyId,
      employee,
      isAdminProxy: false,
    };
  }
}
