import { Component, inject, signal } from '@angular/core';
import { Auth, signInWithEmailAndPassword } from '@angular/fire/auth';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EmployeeAuthService } from '@core/services/employee-auth.service';
import { EmployeeSessionService } from '@core/services/employee-session.service';
import { COMPANY_ID_PATTERN } from '@features/settings/validators/company-settings.validators';
import { EMPLOYEE_NUMBER_PATTERN } from '@features/onboarding/validators/employee-registration.validators';
import { HalfWidthDigitsOnlyDirective } from '@shared/directives/half-width-digits-only.directive';

type LoginMode = 'admin' | 'employee';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, HalfWidthDigitsOnlyDirective],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly employeeAuthService = inject(EmployeeAuthService);
  private readonly sessionService = inject(EmployeeSessionService);

  readonly loginMode = signal<LoginMode>('admin');

  readonly adminForm = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', Validators.required),
  });

  readonly employeeForm = this.fb.group({
    companyId: this.fb.control('', [Validators.required, Validators.pattern(COMPANY_ID_PATTERN)]),
    employeeNumber: this.fb.control('', [
      Validators.required,
      Validators.pattern(EMPLOYEE_NUMBER_PATTERN),
    ]),
    password: this.fb.control('', Validators.required),
  });

  submitted = false;
  loggingIn = false;
  loginError = '';

  setLoginMode(mode: LoginMode): void {
    this.loginMode.set(mode);
    this.submitted = false;
    this.loginError = '';
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.loginError = '';

    if (this.loginMode() === 'admin') {
      await this.loginAsAdmin();
      return;
    }

    await this.loginAsEmployee();
  }

  showAdminError(field: 'email' | 'password'): boolean {
    const control = this.adminForm.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  showEmployeeError(field: 'companyId' | 'employeeNumber' | 'password'): boolean {
    const control = this.employeeForm.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  adminErrorMessage(field: 'email' | 'password'): string {
    const control = this.adminForm.controls[field];

    if (control.errors?.['required']) {
      return '必須項目です';
    }

    if (control.errors?.['email']) {
      return '有効なメールアドレスを入力してください';
    }

    return '入力内容を確認してください';
  }

  employeeErrorMessage(field: 'companyId' | 'employeeNumber' | 'password'): string {
    const control = this.employeeForm.controls[field];

    if (control.errors?.['required']) {
      return '必須項目です';
    }

    if (control.errors?.['pattern']) {
      if (field === 'companyId') {
        return '5桁の数字で入力してください';
      }
      if (field === 'employeeNumber') {
        return '半角数字で1〜20桁以内で入力してください';
      }
    }

    return '入力内容を確認してください';
  }

  private async loginAsAdmin(): Promise<void> {
    if (this.adminForm.invalid) {
      this.adminForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.adminForm.getRawValue();

    this.loggingIn = true;
    try {
      await signInWithEmailAndPassword(this.auth, email, password);
      await this.navigateAfterLogin();
    } catch {
      this.loginError = 'メールアドレスまたはパスワードが正しくありません';
    } finally {
      this.loggingIn = false;
    }
  }

  private async loginAsEmployee(): Promise<void> {
    if (this.employeeForm.invalid) {
      this.employeeForm.markAllAsTouched();
      return;
    }

    const { companyId, employeeNumber, password } = this.employeeForm.getRawValue();

    this.loggingIn = true;
    try {
      await this.employeeAuthService.signIn(companyId, employeeNumber, password);
      await this.navigateAfterLogin();
    } catch {
      this.loginError = '会社ID・社員番号・パスワードが正しくありません';
    } finally {
      this.loggingIn = false;
    }
  }

  private async navigateAfterLogin(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return;
    }

    const isAdmin = await this.sessionService.isCompanyAdmin(user.uid);
    await this.router.navigate([isAdmin ? '/employees' : '/employee/dashboard']);
  }
}
