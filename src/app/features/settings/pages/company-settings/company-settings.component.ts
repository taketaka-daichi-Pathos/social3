import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CompanyService } from '@core/services/company.service';
import { AdminEmployeeLinkService } from '@core/services/admin-employee-link.service';
import { EmployeeService } from '@core/services/employee.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { PostalCodeInputComponent } from '@shared/components/postal-code-input/postal-code-input.component';
import { getCurrentYearMonthKey } from '@features/payroll/utils/compensation.utils';
import {
  normalizeYearMonthKey,
  resolveSystemOperationMonthFromLatestLock,
} from '@features/payroll/utils/system-operation-month.utils';
import {
  CompanyAllowance,
  CompanySettings,
  CompanySettingsFormField,
  CompanySettingsTab,
  DEFAULT_COMPANY_ALLOWANCES,
} from '../../models/company-settings.model';
import { InsuranceRateHistoryEntry } from '../../models/insurance-rate-history.model';
import { PREFECTURE_INSURANCE_RATES } from '../../models/prefecture-insurance-rates.constants';
import { resolveCompanyInsuranceRatesForPrefecture } from '../../utils/company-insurance-rate.utils';
import { toRateTargetDateFromYearMonth } from '../../utils/insurance-rate-date.utils';
import {
  formatApplicableMonthLabel,
  shouldAppendInsuranceRateHistory,
  sortInsuranceRateHistoryDesc,
} from '../../utils/insurance-rate-history.utils';
import { normalizeCompanyAllowancesForSave } from '../../utils/allowance-sync.utils';
import { employeeFullName } from '@features/payroll/utils/compensation.utils';
import { Employee } from '@features/employees/models/employee.model';
import { duplicateApplicableMonthValidator, lockedApplicableMonthValidator, statutoryMasterPeriodValidator } from '../../validators/insurance-rate-history.validators';
import {
  isManualInsuranceRateApplicableMonthAllowed,
  isSystemSeedInsuranceRateApplicableMonth,
  STATUTORY_MASTER_MANUAL_ENTRY_ERROR_MESSAGE,
  STATUTORY_MASTER_MANUAL_ENTRY_RESTRICTION_HINT,
} from '../../utils/statutory-insurance-rate-period.utils';
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

const APPLICABLE_MONTH_PATTERN = /^\d{4}-\d{2}$/;

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [ReactiveFormsModule, PostalCodeInputComponent, DecimalPipe, DatePipe],
  templateUrl: './company-settings.component.html',
  styleUrl: './company-settings.component.scss',
})
export class CompanySettingsComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly companyService = inject(CompanyService);
  private readonly employeeService = inject(EmployeeService);
  private readonly adminEmployeeLinkService = inject(AdminEmployeeLinkService);
  private readonly monthlyLockService = inject(MonthlyLockService);

  readonly prefectures = PREFECTURE_INSURANCE_RATES;
  readonly activeTab = signal<CompanySettingsTab>('basic');
  readonly insuranceRateHistory = signal<InsuranceRateHistoryEntry[]>([]);
  readonly latestLockedMonth = signal<string | null>(null);
  readonly statutoryMasterPeriodHint = STATUTORY_MASTER_MANUAL_ENTRY_RESTRICTION_HINT;
  readonly adminEmail = signal('');
  readonly employeeOptions = signal<Employee[]>([]);
  /** 適用開始月をユーザーが手動変更したか（systemStartDate 自動セットとの区別用） */
  private readonly userEditedApplicableMonth = signal(false);

  readonly form = this.fb.group({
    companyId: this.fb.control(
      { value: '', disabled: true },
      [Validators.required, Validators.pattern(COMPANY_ID_PATTERN)]
    ),
    linkedEmployeeId: this.fb.control(''),
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
    systemStartDate: this.fb.control({ value: '', disabled: true }),
    applicableMonth: this.fb.control(getCurrentYearMonthKey(), [
      Validators.required,
      Validators.pattern(APPLICABLE_MONTH_PATTERN),
    ]),
    healthInsuranceRate: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
    ]),
    longTermCareInsuranceRate: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
    ]),
    allowances: this.fb.array<AllowanceFormGroup>([]),
  });

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');
  readonly saveSuccess = signal('');

  submitted = false;
  private successMessageTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.populateAllowances([...DEFAULT_COMPANY_ALLOWANCES]);
    this.setupApplicableMonthValidator();

    this.form.controls.prefecture.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((prefectureName) => {
        if (this.activeTab() !== 'rates') {
          return;
        }

        console.log('[CompanySettings] prefecture valueChanges', prefectureName);
        this.applyMasterRatesForPrefecture(prefectureName);
      });

    this.form.controls.applicableMonth.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((applicableMonth) => {
        if (this.activeTab() !== 'rates') {
          return;
        }

        this.userEditedApplicableMonth.set(true);
        this.refreshApplicableMonthValidation();

        console.log('[CompanySettings] applicableMonth valueChanges', applicableMonth);
        this.applyMasterRatesForPrefecture(this.form.controls.prefecture.value, applicableMonth);
      });

    void this.loadCompany();

    this.adminEmail.set(this.auth.currentUser?.email?.trim() ?? '');

    this.employeeService
      .watchEmployees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employees) => this.employeeOptions.set(employees),
        error: () => this.employeeOptions.set([]),
      });
  }

  linkedEmployeeOptionLabel(employee: Employee): string {
    const name = employeeFullName(employee);
    const email = employee.email?.trim();
    const emailSuffix = email ? ` / ${email}` : '';
    return `${employee.employeeNumber} ${name}${emailSuffix}`;
  }

  get allowances(): FormArray<AllowanceFormGroup> {
    return this.form.controls.allowances;
  }

  formatApplicableMonth(applicableMonth: string): string {
    return formatApplicableMonthLabel(applicableMonth);
  }

  setTab(tab: CompanySettingsTab): void {
    this.activeTab.set(tab);

    if (tab === 'rates') {
      this.applyMasterRatesForCurrentSelection();
    }
  }

  isSubmitDisabled(): boolean {
    if (this.saving() || this.loading()) {
      return true;
    }

    if (this.activeTab() === 'rates') {
      this.refreshApplicableMonthValidation();
      const control = this.form.controls.applicableMonth;
      return !!(
        control.errors?.['duplicateMonth'] ||
        control.errors?.['lockedApplicableMonth'] ||
        control.errors?.['statutoryMasterPeriod']
      );
    }

    return false;
  }

  showDuplicateMonthError(): boolean {
    const control = this.form.controls.applicableMonth;
    return (
      !!control.errors?.['duplicateMonth'] &&
      (control.touched || control.dirty || this.submitted)
    );
  }

  showLockedApplicableMonthError(): boolean {
    const control = this.form.controls.applicableMonth;
    return (
      !!control.errors?.['lockedApplicableMonth'] &&
      (control.touched || control.dirty || this.submitted)
    );
  }

  showStatutoryMasterPeriodError(): boolean {
    const control = this.form.controls.applicableMonth;
    return (
      !!control.errors?.['statutoryMasterPeriod'] &&
      (control.touched || control.dirty || this.submitted)
    );
  }

  onApplicablePrefectureChange(event: Event): void {
    const prefectureName = (event.target as HTMLSelectElement).value;
    console.log('[CompanySettings] 適用都道府県変更', prefectureName);
    this.applyMasterRatesForPrefecture(prefectureName);
  }

  onApplicableMonthInput(event: Event): void {
    const applicableMonth = (event.target as HTMLInputElement).value.trim();
    this.userEditedApplicableMonth.set(true);
    console.log('[CompanySettings] 適用開始月変更', applicableMonth);

    if (!APPLICABLE_MONTH_PATTERN.test(applicableMonth)) {
      return;
    }

    this.form.controls.applicableMonth.setValue(applicableMonth, { emitEvent: false });
    this.refreshApplicableMonthValidation();
    this.applyMasterRatesForPrefecture(this.form.controls.prefecture.value, applicableMonth);
  }

  addAllowance(): void {
    this.allowances.push(this.createAllowanceGroup());
  }

  removeAllowance(index: number): void {
    this.allowances.removeAt(index);
  }

  async onSubmit(): Promise<void> {
    console.log('[CompanySettings] onSubmit 開始', {
      activeTab: this.activeTab(),
      formValue: this.form.getRawValue(),
    });

    this.submitted = true;
    this.saveError.set('');
    this.saveSuccess.set('');

    if (!this.validateActiveTab()) {
      console.warn('[CompanySettings] バリデーションエラー', this.collectInvalidFieldsForActiveTab());
      this.form.markAllAsTouched();
      return;
    }

    if (this.activeTab() === 'rates' && !this.assertRatesTabSubmitAllowed()) {
      this.form.markAllAsTouched();
      return;
    }

    const data = this.buildCompanySettings();
    console.log('保存する会社データ:', data);
    const historyEntry = this.buildInsuranceRateHistoryEntry();
    const shouldSaveHistory =
      this.activeTab() === 'rates' &&
      historyEntry != null &&
      shouldAppendInsuranceRateHistory(this.insuranceRateHistory(), historyEntry);
    const shouldSyncAllowances = this.activeTab() === 'allowances';

    this.saving.set(true);
    try {
      const updatedHistory = await this.companyService.updateCompany(data, {
        insuranceRateHistoryEntry: shouldSaveHistory ? historyEntry : null,
      });
      this.insuranceRateHistory.set(updatedHistory);
      this.refreshApplicableMonthValidation();

      if (shouldSyncAllowances) {
        await this.employeeService.syncAllowancesFromCompany(data.allowances);
        this.showSaveSuccessMessage(
          '手当設定を保存し、未確定の従業員データに反映しました（※確定済みの給与には影響しません）'
        );
      } else if (this.activeTab() === 'rates') {
        this.showSaveSuccessMessage('社会保険料率と適用都道府県を保存しました');
      } else if (this.activeTab() === 'basic') {
        await this.syncLinkedEmployeeEmailIfNeeded(data);
        await this.adminEmployeeLinkService.reloadLink();
        this.showSaveSuccessMessage('基本情報を保存しました');
      }
    } catch {
      this.saveError.set('保存に失敗しました。時間をおいて再度お試しください。');
    } finally {
      this.saving.set(false);
    }
  }

  canSaveActiveTab(): boolean {
    return this.validateActiveTab(false);
  }

  private validateActiveTab(markTouched = true): boolean {
    const tab = this.activeTab();

    if (tab === 'allowances') {
      if (this.allowances.length === 0) {
        return false;
      }

      let valid = true;
      for (const group of this.allowances.controls) {
        group.controls.name.updateValueAndValidity({ emitEvent: false });
        group.controls.amount.updateValueAndValidity({ emitEvent: false });

        if (group.invalid) {
          valid = false;
          if (markTouched) {
            group.markAllAsTouched();
          }
        }
      }

      return valid;
    }

    if (tab === 'rates') {
      return this.validateFields(
        ['prefecture', 'applicableMonth', 'healthInsuranceRate', 'longTermCareInsuranceRate'],
        markTouched
      );
    }

    return this.validateFields(
      [
        'companyName',
        'employerLastName',
        'employerFirstName',
        'employerLastNameKana',
        'employerFirstNameKana',
        'postalCode',
        'prefecture',
        'cityAddress',
        'phoneNumber',
        'prefectureCode',
        'districtCode',
        'referenceMark',
        'officeNumber',
      ],
      markTouched
    );
  }

  private validateFields(
    fields: Array<keyof typeof this.form.controls>,
    markTouched: boolean
  ): boolean {
    let valid = true;

    for (const field of fields) {
      const control = this.form.controls[field];
      control.updateValueAndValidity({ emitEvent: false });

      if (control.invalid) {
        valid = false;
        if (markTouched) {
          control.markAsTouched();
        }
      }
    }

    return valid;
  }

  private showSaveSuccessMessage(message: string): void {
    if (this.successMessageTimer) {
      clearTimeout(this.successMessageTimer);
    }

    this.saveSuccess.set(message);
    this.successMessageTimer = setTimeout(() => {
      this.saveSuccess.set('');
      this.successMessageTimer = null;
    }, 6000);
  }

  showError(field: CompanySettingsFormField): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  showApplicableMonthError(): boolean {
    const control = this.form.controls.applicableMonth;
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

  applicableMonthErrorMessage(): string {
    const control = this.form.controls.applicableMonth;
    if (control.errors?.['lockedApplicableMonth']) {
      return '※確定済みの月（またはそれ以前）に新しい料率を割り込むことはできません。未来の月を指定してください。';
    }
    if (control.errors?.['duplicateMonth']) {
      return '※この適用開始月は既に登録されています。';
    }
    if (control.errors?.['statutoryMasterPeriod']) {
      return STATUTORY_MASTER_MANUAL_ENTRY_ERROR_MESSAGE;
    }
    if (control.errors?.['required']) {
      return '必須項目です';
    }
    if (control.errors?.['pattern']) {
      return 'YYYY-MM 形式で入力してください';
    }
    return '入力内容を確認してください';
  }

  private setupApplicableMonthValidator(): void {
    this.form.controls.applicableMonth.addValidators(
      duplicateApplicableMonthValidator(() => ({
        history: this.insuranceRateHistory(),
        editingEntryId: null,
      }))
    );
    this.form.controls.applicableMonth.addValidators(
      lockedApplicableMonthValidator(() => ({
        latestLockedMonth: this.latestLockedMonth(),
      }))
    );
    this.form.controls.applicableMonth.addValidators(
      statutoryMasterPeriodValidator(() => ({
        history: this.insuranceRateHistory(),
        editingEntryId: null,
        systemStartDate: this.form.controls.systemStartDate.value,
        userEditedApplicableMonth: this.userEditedApplicableMonth(),
      }))
    );
  }

  private refreshApplicableMonthValidation(): void {
    this.form.controls.applicableMonth.updateValueAndValidity({ emitEvent: false });
  }

  private async loadCompany(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');

    try {
      const [company, latestLockedMonth] = await Promise.all([
        this.companyService.getCompanyForCurrentUser(),
        this.monthlyLockService.getLatestLockedMonth(),
      ]);

      this.latestLockedMonth.set(latestLockedMonth);

      if (!company) {
        this.loadError.set('会社情報が見つかりません。新規登録を行ってください。');
        return;
      }

      const defaultApplicableMonth = this.resolveDefaultApplicableMonth(
        company,
        latestLockedMonth
      );

      this.patchCompanySettings(company, defaultApplicableMonth);
    } catch {
      this.loadError.set('会社情報の取得に失敗しました。');
    } finally {
      this.loading.set(false);
    }
  }

  private patchCompanySettings(company: CompanySettings, defaultApplicableMonth: string): void {
    this.userEditedApplicableMonth.set(false);
    this.form.patchValue(
      {
        companyName: company.companyName,
        linkedEmployeeId: company.linkedEmployeeId ?? '',
        employerLastName: company.employerLastName,
        employerFirstName: company.employerFirstName,
        employerLastNameKana: company.employerLastNameKana,
        employerFirstNameKana: company.employerFirstNameKana,
        postalCode: company.postalCode,
        prefecture: company.prefecture,
        cityAddress: company.cityAddress,
        phoneNumber: company.phoneNumber,
        prefectureCode: company.prefectureCode,
        districtCode: company.districtCode,
        referenceMark: company.referenceMark,
        officeNumber: company.officeNumber,
        systemStartDate: company.systemStartDate,
        applicableMonth: defaultApplicableMonth,
        healthInsuranceRate: company.healthInsuranceRate,
        longTermCareInsuranceRate: company.longTermCareInsuranceRate,
      },
      { emitEvent: false }
    );
    this.form.controls.companyId.setValue(company.companyId);
    this.populateAllowances(company.allowances);
    this.insuranceRateHistory.set(sortInsuranceRateHistoryDesc(company.insuranceRateHistory ?? []));
    this.refreshApplicableMonthValidation();

    if (company.prefecture) {
      this.applyMasterRatesForPrefecture(company.prefecture, defaultApplicableMonth);
    } else if (
      company.healthInsuranceRate == null ||
      company.longTermCareInsuranceRate == null
    ) {
      this.form.patchValue(
        {
          healthInsuranceRate: company.healthInsuranceRate,
          longTermCareInsuranceRate: company.longTermCareInsuranceRate,
        },
        { emitEvent: false }
      );
    }
  }

  private applyMasterRatesForCurrentSelection(): void {
    this.applyMasterRatesForPrefecture(
      this.form.controls.prefecture.value,
      this.form.controls.applicableMonth.value
    );
  }

  private applyMasterRatesForPrefecture(
    prefectureName: string,
    applicableMonth = this.form.controls.applicableMonth.value
  ): void {
    const normalizedPrefecture = prefectureName.trim();
    const normalizedMonth = applicableMonth.trim();

    if (!normalizedPrefecture) {
      console.warn('[CompanySettings] 都道府県未選択のため料率を自動反映できません');
      return;
    }

    if (!APPLICABLE_MONTH_PATTERN.test(normalizedMonth)) {
      console.warn('[CompanySettings] 適用開始月が不正のため料率を自動反映できません', normalizedMonth);
      return;
    }

    const targetDate = toRateTargetDateFromYearMonth(normalizedMonth);
    const rates = resolveCompanyInsuranceRatesForPrefecture(normalizedPrefecture, targetDate);

    console.log('[CompanySettings] マスター料率を反映', {
      prefecture: normalizedPrefecture,
      applicableMonth: normalizedMonth,
      rates,
    });

    this.form.patchValue(rates, { emitEvent: false });
    this.form.controls.healthInsuranceRate.updateValueAndValidity({ emitEvent: false });
    this.form.controls.longTermCareInsuranceRate.updateValueAndValidity({ emitEvent: false });
  }

  private collectInvalidFieldsForActiveTab(): string[] {
    const tab = this.activeTab();
    const fields: Array<keyof typeof this.form.controls> =
      tab === 'rates'
        ? ['prefecture', 'applicableMonth', 'healthInsuranceRate', 'longTermCareInsuranceRate']
        : tab === 'allowances'
          ? []
          : [
              'companyName',
              'employerLastName',
              'employerFirstName',
              'employerLastNameKana',
              'employerFirstNameKana',
              'postalCode',
              'prefecture',
              'cityAddress',
              'phoneNumber',
              'prefectureCode',
              'districtCode',
              'referenceMark',
              'officeNumber',
            ];

    return fields.filter((field) => this.form.controls[field].invalid);
  }

  private async syncLinkedEmployeeEmailIfNeeded(settings: CompanySettings): Promise<void> {
    const linkedEmployeeId = settings.linkedEmployeeId?.trim();
    const adminEmail = this.adminEmail().trim();
    if (!linkedEmployeeId || !adminEmail) {
      return;
    }

    const employee = this.employeeOptions().find((row) => row.id === linkedEmployeeId);
    if (!employee || employee.email?.trim()) {
      return;
    }

    await this.employeeService.updateEmployeeEmail(linkedEmployeeId, adminEmail);
  }

  private buildCompanySettings(): CompanySettings {
    const raw = this.form.getRawValue();

    return {
      companyId: raw.companyId,
      linkedEmployeeId: raw.linkedEmployeeId.trim() || null,
      companyName: raw.companyName,
      employerLastName: raw.employerLastName,
      employerFirstName: raw.employerFirstName,
      employerLastNameKana: raw.employerLastNameKana,
      employerFirstNameKana: raw.employerFirstNameKana,
      postalCode: raw.postalCode,
      prefecture: raw.prefecture,
      cityAddress: raw.cityAddress,
      phoneNumber: raw.phoneNumber,
      prefectureCode: raw.prefectureCode,
      districtCode: raw.districtCode,
      referenceMark: raw.referenceMark,
      officeNumber: raw.officeNumber,
      systemStartDate: raw.systemStartDate,
      healthInsuranceRate: raw.healthInsuranceRate,
      longTermCareInsuranceRate: raw.longTermCareInsuranceRate,
      allowances: normalizeCompanyAllowancesForSave(raw.allowances),
      insuranceRateHistory: this.insuranceRateHistory(),
    };
  }

  private buildInsuranceRateHistoryEntry() {
    const raw = this.form.getRawValue();
    if (
      raw.healthInsuranceRate == null ||
      raw.longTermCareInsuranceRate == null ||
      !APPLICABLE_MONTH_PATTERN.test(raw.applicableMonth)
    ) {
      return null;
    }

    const applicableMonth =
      normalizeYearMonthKey(raw.applicableMonth) ?? raw.applicableMonth.trim();

    return {
      applicableMonth,
      healthInsuranceRate: raw.healthInsuranceRate,
      careInsuranceRate: raw.longTermCareInsuranceRate,
    };
  }

  private resolveDefaultApplicableMonth(
    company: CompanySettings,
    latestLockedMonth: string | null
  ): string {
    const history = company.insuranceRateHistory ?? [];
    const normalizedSystemStart = normalizeYearMonthKey(company.systemStartDate);

    if (history.length === 0 && normalizedSystemStart) {
      return normalizedSystemStart;
    }

    return resolveSystemOperationMonthFromLatestLock(latestLockedMonth, {
      systemStartDate: company.systemStartDate,
      calendarMonth: getCurrentYearMonthKey(),
    });
  }

  /** 保存時ガード: 禁止期間への手動追加をブロック（初回 systemStartDate シードは許可） */
  private assertRatesTabSubmitAllowed(): boolean {
    const raw = this.form.getRawValue();
    const applicableMonth = normalizeYearMonthKey(raw.applicableMonth) ?? raw.applicableMonth.trim();
    const systemStartDate = raw.systemStartDate;
    const history = this.insuranceRateHistory();

    const isInitialSystemSeed =
      history.length === 0 &&
      !this.userEditedApplicableMonth() &&
      isSystemSeedInsuranceRateApplicableMonth(applicableMonth, systemStartDate);

    if (isInitialSystemSeed || isManualInsuranceRateApplicableMonthAllowed(applicableMonth)) {
      return true;
    }

    this.saveError.set(STATUTORY_MASTER_MANUAL_ENTRY_ERROR_MESSAGE);
    this.form.controls.applicableMonth.setErrors({
      ...this.form.controls.applicableMonth.errors,
      statutoryMasterPeriod: true,
    });
    return false;
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

  private patternErrorMessage(field: CompanySettingsFormField): string {
    const messages: Partial<Record<CompanySettingsFormField, string>> = {
      companyId: '5桁の数字で入力してください',
      postalCode: '7桁すべて入力してください',
      phoneNumber: '「03-1234-5678」の形式で入力してください',
      prefectureCode: '2桁の数字で入力してください',
      districtCode: '2桁の数字で入力してください',
      officeNumber: '1〜5桁の半角数字で入力してください',
    };

    return messages[field] ?? '形式が正しくありません';
  }
}
