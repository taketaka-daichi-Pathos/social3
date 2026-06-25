import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CompanyService } from '@core/services/company.service';
import { PostalCodeInputComponent } from '@shared/components/postal-code-input/postal-code-input.component';
import {
  CompanyAllowance,
  CompanySettings,
  CompanySettingsFormField,
  CompanySettingsTab,
  DEFAULT_COMPANY_ALLOWANCES,
} from '../../models/company-settings.model';
import {
  findHealthInsuranceRate,
  LONG_TERM_CARE_INSURANCE_RATE,
  PREFECTURE_INSURANCE_RATES,
} from '../../models/prefecture-insurance-rates.constants';
import {
  COMPANY_ID_PATTERN,
  DISTRICT_CODE_PATTERN,
  OFFICE_NUMBER_PATTERN,
  PHONE_NUMBER_PATTERN,
  POSTAL_CODE_PATTERN,
  PREFECTURE_CODE_PATTERN,
} from '../../validators/company-settings.validators';

type AllowanceFormGroup = FormGroup<{
  name: FormControl<string>;
  amount: FormControl<number | null>;
}>;

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [ReactiveFormsModule, PostalCodeInputComponent],
  templateUrl: './company-settings.component.html',
  styleUrl: './company-settings.component.scss',
})
export class CompanySettingsComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly companyService = inject(CompanyService);

  readonly prefectures = PREFECTURE_INSURANCE_RATES;
  readonly activeTab = signal<CompanySettingsTab>('basic');

  readonly form = this.fb.group({
    companyId: this.fb.control(
      { value: '', disabled: true },
      [Validators.required, Validators.pattern(COMPANY_ID_PATTERN)]
    ),
    companyName: this.fb.control('', Validators.required),
    ownerName: this.fb.control('', Validators.required),
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
    ]),
    healthInsuranceRate: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
    ]),
    longTermCareInsuranceRate: this.fb.control<number | null>(LONG_TERM_CARE_INSURANCE_RATE, [
      Validators.required,
      Validators.min(0),
    ]),
    allowances: this.fb.array<AllowanceFormGroup>([]),
  });

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');

  submitted = false;

  ngOnInit(): void {
    this.populateAllowances([...DEFAULT_COMPANY_ALLOWANCES]);

    this.form.controls.prefecture.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((prefectureName) => this.applyInsuranceRates(prefectureName));

    void this.loadCompany();
  }

  get allowances(): FormArray<AllowanceFormGroup> {
    return this.form.controls.allowances;
  }

  setTab(tab: CompanySettingsTab): void {
    this.activeTab.set(tab);
  }

  addAllowance(): void {
    this.allowances.push(this.createAllowanceGroup());
  }

  removeAllowance(index: number): void {
    this.allowances.removeAt(index);
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.saveError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const data = this.buildCompanySettings();

    this.saving.set(true);
    try {
      await this.companyService.updateCompany(data);
    } catch {
      this.saveError.set('保存に失敗しました。時間をおいて再度お試しください。');
    } finally {
      this.saving.set(false);
    }
  }

  showError(field: CompanySettingsFormField): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  showAllowanceError(index: number, field: 'name' | 'amount'): boolean {
    const control = this.allowances.at(index).controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  allowanceErrorMessage(index: number, field: 'name' | 'amount'): string {
    const control = this.allowances.at(index).controls[field];

    if (control.errors?.['required']) {
      return '必須項目です';
    }

    if (control.errors?.['min']) {
      return '0以上の数値を入力してください';
    }

    return '入力内容を確認してください';
  }

  errorMessage(field: CompanySettingsFormField): string {
    const control = this.form.controls[field];

    if (!control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return '必須項目です';
    }

    if (control.errors['pattern']) {
      return this.patternErrorMessage(field);
    }

    if (control.errors['min']) {
      return '0以上の数値を入力してください';
    }

    return '入力内容を確認してください';
  }

  private async loadCompany(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');

    try {
      const company = await this.companyService.getCompanyForCurrentUser();

      if (!company) {
        this.loadError.set('会社情報が見つかりません。新規登録を行ってください。');
        return;
      }

      this.patchCompanySettings(company);
    } catch {
      this.loadError.set('会社情報の取得に失敗しました。');
    } finally {
      this.loading.set(false);
    }
  }

  private patchCompanySettings(company: CompanySettings): void {
    this.form.patchValue(
      {
        companyName: company.companyName,
        ownerName: company.ownerName,
        postalCode: company.postalCode,
        prefecture: company.prefecture,
        cityAddress: company.cityAddress,
        phoneNumber: company.phoneNumber,
        prefectureCode: company.prefectureCode,
        districtCode: company.districtCode,
        referenceMark: company.referenceMark,
        officeNumber: company.officeNumber,
        healthInsuranceRate: company.healthInsuranceRate,
        longTermCareInsuranceRate: company.longTermCareInsuranceRate,
      },
      { emitEvent: false }
    );
    this.form.controls.companyId.setValue(company.companyId);
    this.populateAllowances(company.allowances);

    if (!company.healthInsuranceRate && company.prefecture) {
      this.applyInsuranceRates(company.prefecture);
    }
  }

  private buildCompanySettings(): CompanySettings {
    const raw = this.form.getRawValue();

    return {
      ...raw,
      allowances: raw.allowances.map((allowance) => ({
        name: allowance.name,
        amount: allowance.amount ?? null,
      })),
    };
  }

  private populateAllowances(allowances: CompanyAllowance[]): void {
    this.allowances.clear();

    const items = allowances.length > 0 ? allowances : [...DEFAULT_COMPANY_ALLOWANCES];

    for (const allowance of items) {
      this.allowances.push(this.createAllowanceGroup(allowance.name, allowance.amount));
    }
  }

  private createAllowanceGroup(name = '', amount: number | null = null): AllowanceFormGroup {
    return this.fb.group({
      name: this.fb.control(name, Validators.required),
      amount: this.fb.control<number | null>(amount, Validators.min(0)),
    });
  }

  private applyInsuranceRates(prefectureName: string): void {
    const healthRate = findHealthInsuranceRate(prefectureName);
    if (healthRate == null) {
      return;
    }

    this.form.patchValue(
      {
        healthInsuranceRate: healthRate,
        longTermCareInsuranceRate: LONG_TERM_CARE_INSURANCE_RATE,
      },
      { emitEvent: false }
    );
  }

  private patternErrorMessage(field: CompanySettingsFormField): string {
    const messages: Partial<Record<CompanySettingsFormField, string>> = {
      companyId: '5桁の数字で入力してください',
      postalCode: '7桁すべて入力してください',
      phoneNumber: '「03-1234-5678」の形式で入力してください',
      prefectureCode: '2桁の数字で入力してください',
      districtCode: '2桁の数字で入力してください',
      officeNumber: '5桁の数字で入力してください',
    };

    return messages[field] ?? '形式が正しくありません';
  }
}
