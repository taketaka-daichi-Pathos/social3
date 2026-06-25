import { inject, Injectable } from '@angular/core';
import { Auth, signInWithEmailAndPassword } from '@angular/fire/auth';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { deleteApp, initializeApp } from 'firebase/app';
import { environment } from '../../../environments/environment';
import { birthDateToPassword, toEmployeeAuthEmail } from '@core/utils/employee-auth.utils';

@Injectable({ providedIn: 'root' })
export class EmployeeAuthService {
  private readonly auth = inject(Auth);

  async createEmployeeAccount(
    employeeNumber: string,
    companyId: string,
    birthDate: string
  ): Promise<{ uid: string; email: string }> {
    const email = toEmployeeAuthEmail(employeeNumber, companyId);
    const password = birthDateToPassword(birthDate);
    const appName = `employee-create-${Date.now()}`;
    const secondaryApp = initializeApp(environment.firebase, appName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      return { uid: credential.user.uid, email };
    } finally {
      await deleteApp(secondaryApp);
    }
  }

  async signIn(companyId: string, employeeNumber: string, password: string): Promise<void> {
    const email = toEmployeeAuthEmail(employeeNumber, companyId);
    await signInWithEmailAndPassword(this.auth, email, password);
  }
}
