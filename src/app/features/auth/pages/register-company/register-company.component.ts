import { Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CompanyService } from '@core/services/company.service';
import { PostalCodeInputComponent } from '@shared/components/postal-code-input/postal-code-input.component';
import { REIWA_8_PREFECTURE_NAMES } from '@features/settings/models/reiwa-8-health-insurance-rates.constants';
import {
  COMPANY_ID_PATTERN,
  DISTRICT_CODE_PATTERN,
  generateRandomCompanyId,
  OFFICE_NUMBER_PATTERN,
  PHONE_NUMBER_PATTERN,
  POSTAL_CODE_PATTERN,
  PREFECTURE_CODE_PATTERN,
} from '@features/settings/validators/company-settings.validators';
import { RegisterCompanyData, RegisterCompanyField } from '../../models/register-company.model';
import { resolveCompanyInsuranceRatesForPrefecture } from '@features/settings/utils/company-insurance-rate.utils';
import { getCurrentYearMonthKey } from '@features/payroll/utils/compensation.utils';
import { passwordMatchValidator } from '../../validators/auth.validators';

@Component({
  selector: 'app-register-company',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PostalCodeInputComponent],
  templateUrl: './register-company.component.html',
  styleUrl: './register-company.component.scss',
})
export class RegisterCompanyComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly companyService = inject(CompanyService);

  /** 47都道府県（北海道〜沖縄） */
  readonly prefectureNames = REIWA_8_PREFECTURE_NAMES;

  readonly form = this.fb.group(
    {
      companyName: this.fb.control('', Validators.required),
      employerLastName: this.fb.control('', Validators.required),
      employerFirstName: this.fb.control('', Validators.required),
      employerLastNameKana: this.fb.control('', Validators.required),
      employerFirstNameKana: this.fb.control('', Validators.required),
      postalCode: this.fb.control('', [
        Validators.required,
        Validators.pattern(POSTAL_CODE_PATTERN),
      ]),
      prefecture: this.fb.control('', Validators.required),
      cityAddress: this.fb.control('', Validators.required),
      phoneNumber: this.fb.control('', [
        Validators.required,
        Validators.pattern(PHONE_NUMBER_PATTERN),
      ]),
      prefectureCode: this.fb.control('', [
        Validators.required,
        Validators.pattern(PREFECTURE_CODE_PATTERN),
      ]),
      districtCode: this.fb.control('', [
        Validators.required,
        Validators.pattern(DISTRICT_CODE_PATTERN),
      ]),
      referenceMark: this.fb.control('', Validators.required),
      officeNumber: this.fb.control('', [
        Validators.required,
        Validators.pattern(OFFICE_NUMBER_PATTERN),
        Validators.maxLength(5),
      ]),
      systemStartDate: this.fb.control(getCurrentYearMonthKey(), [
        Validators.required,
        Validators.pattern(/^\d{4}-\d{2}$/),
      ]),
      email: this.fb.control('', [Validators.required, Validators.email]),
      password: this.fb.control('', Validators.required),
      confirmPassword: this.fb.control('', Validators.required),
      companyId: this.fb.control('', [
        Validators.required,
        Validators.pattern(COMPANY_ID_PATTERN),
      ]),
    },
    { validators: passwordMatchValidator('password', 'confirmPassword') }
  );

  readonly saving = signal(false);
  readonly submitError = signal('');

  submitted = false;

  ngOnInit(): void {
    this.generateCompanyId();
  }

  generateCompanyId(): void {
    this.form.controls.companyId.setValue(generateRandomCompanyId());
    this.form.controls.companyId.markAsDirty();
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.submitError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { confirmPassword: _, ...data } = this.form.getRawValue();
    const payload: RegisterCompanyData = data;
    const insuranceRates = resolveCompanyInsuranceRatesForPrefecture(payload.prefecture);

    console.log('[RegisterCompany] Firestore 保存直前 payload', {
      ...payload,
      password: '[REDACTED]',
      healthInsuranceRate: insuranceRates.healthInsuranceRate,
      longTermCareInsuranceRate: insuranceRates.longTermCareInsuranceRate,
    });

    this.saving.set(true);
    try {
      await this.companyService.registerCompany(payload);
      await this.router.navigate(['/settings/company']);
    } catch (error) {
      this.submitError.set(this.toErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  showError(field: RegisterCompanyField): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  showPasswordMismatch(): boolean {
    return (
      this.form.hasError('passwordMismatch') &&
      (this.form.controls.confirmPassword.touched || this.submitted)
    );
  }

  errorMessage(field: RegisterCompanyField): string {
    const control = this.form.controls[field];

    if (control.errors?.['required']) {
      return '必須項目です';
    }

    if (control.errors?.['email']) {
      return '有効なメールアドレスを入力してください';
    }

    if (control.errors?.['pattern']) {
      return this.patternErrorMessage(field);
    }

    return '入力内容を確認してください';
  }

  private patternErrorMessage(field: RegisterCompanyField): string {
    const messages: Partial<Record<RegisterCompanyField, string>> = {
      postalCode: '7桁すべて入力してください',
      phoneNumber: '「03-1234-5678」の形式で入力してください',
      prefectureCode: '2桁の数字で入力してください',
      districtCode: '2桁の数字で入力してください',
      officeNumber: '1〜5桁の半角数字で入力してください',
      systemStartDate: 'YYYY-MM 形式で入力してください',
      companyId: '5桁の数字で入力してください',
    };

    return messages[field] ?? '形式が正しくありません';
  }

  private toErrorMessage(error: unknown): string {
    const code = (error as { code?: string })?.code;

    switch (code) {
      case 'auth/email-already-in-use':
        return 'このメールアドレスは既に登録されています';
      case 'auth/invalid-email':
        return 'メールアドレスの形式が正しくありません';
      case 'auth/weak-password':
        return 'パスワードは6文字以上で設定してください';
      default:
        return '登録に失敗しました。時間をおいて再度お試しください';
    }
  }
}
