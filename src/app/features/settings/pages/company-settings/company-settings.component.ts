import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import { ActivatedRoute } from '@angular/router';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { CompanyService } from '@core/services/company.service';
import { AdminEmployeeLinkService } from '@core/services/admin-employee-link.service';
import { EmployeeService } from '@core/services/employee.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { PostalCodeInputComponent } from '@shared/components/postal-code-input/postal-code-input.component';
import { getCurrentYearAprilMonthKey, getCurrentYearMonthKey, getNextYearMonthKey } from '@features/payroll/utils/compensation.utils';
import {
  normalizeYearMonthKey,
  resolveSystemOperationMonthFromLatestLock,
} from '@features/payroll/utils/system-operation-month.utils';
import {
  BonusPaymentSetting,
  CompanyAllowance,
  CompanyAllowanceFormField,
  CompanySettings,
  CompanySettingsFormField,
  CompanySettingsTab,
} from '../../models/company-settings.model';
import { InsuranceRateHistoryEntry } from '../../models/insurance-rate-history.model';
import { PREFECTURE_INSURANCE_RATES } from '../../models/prefecture-insurance-rates.constants';
import { resolveSocialInsurancePrefectureCode } from '../../models/social-insurance-prefecture-codes.constants';
import { resolveCompanyInsuranceRatesForPrefecture } from '../../utils/company-insurance-rate.utils';
import { toRateTargetDateFromYearMonth } from '../../utils/insurance-rate-date.utils';
import {
  formatApplicableMonthLabel,
  shouldAppendInsuranceRateHistory,
  sortInsuranceRateHistoryDesc,
} from '../../utils/insurance-rate-history.utils';
import {
  bonusPaymentSettingsFromFormValues,
  compareBonusPaymentSettingsForDisplay,
  isBonusPaymentRowEmpty,
  normalizeBonusPaymentSettingDate,
  resolveBonusPaymentYear,
  resolveMinBonusPaymentDateFromSystemStart,
} from '../../utils/bonus-payment-settings.utils';
import {
  bonusPaymentDateDuplicateValidator,
  bonusPaymentDateNotBeforeSystemStartValidator,
  DUPLICATE_BONUS_PAYMENT_DATE_ERROR_MESSAGE,
} from '../../validators/bonus-payment-settings.validators';
import {
  COMPANY_ALLOWANCE_FORM_FIELDS,
  companyAllowancesFromFormValues,
  formValuesFromCompanyAllowances,
} from '../../utils/allowance-sync.utils';
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

const APPLICABLE_MONTH_PATTERN = /^\d{4}-\d{2}$/;

const ALLOWANCE_AMOUNT_VALIDATORS = [Validators.min(0)];

type BonusPaymentSettingFormGroup = FormGroup<{
  id: FormControl<string>;
  name: FormControl<string>;
  paymentDate: FormControl<string>;
}>;

interface BonusPaymentRowView {
  index: number;
  group: BonusPaymentSettingFormGroup;
}

interface BonusPaymentYearGroupView {
  year: number;
  rows: BonusPaymentRowView[];
}

interface BonusPaymentDisplayRowView extends BonusPaymentRowView {
  displayYear: number;
  showYearDivider: boolean;
}

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
  private readonly route = inject(ActivatedRoute);

  readonly prefectures = PREFECTURE_INSURANCE_RATES;
  readonly activeTab = signal<CompanySettingsTab>('basic');
  readonly insuranceRateHistory = signal<InsuranceRateHistoryEntry[]>([]);
  readonly editingInsuranceRateEntryId = signal<string | null>(null);
  readonly editingInsuranceRateEntry = computed(() => {
    const editingId = this.editingInsuranceRateEntryId();
    if (!editingId) {
      return null;
    }

    return this.insuranceRateHistory().find((entry) => entry.id === editingId) ?? null;
  });
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
    applicableMonth: this.fb.control(getCurrentYearAprilMonthKey(), [
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
    familyAllowance: this.fb.control<number | null>(null, ALLOWANCE_AMOUNT_VALIDATORS),
    rentAllowance: this.fb.control<number | null>(null, ALLOWANCE_AMOUNT_VALIDATORS),
    fixedOvertimeAllowance: this.fb.control<number | null>(null, ALLOWANCE_AMOUNT_VALIDATORS),
    commutingAllowance: this.fb.control<number | null>(null, ALLOWANCE_AMOUNT_VALIDATORS),
    otherAllowance: this.fb.control<number | null>(null, ALLOWANCE_AMOUNT_VALIDATORS),
    bonusPaymentSettings: this.fb.array<BonusPaymentSettingFormGroup>([]),
  });

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');
  readonly saveSuccess = signal('');

  /** 賞与支払日の「今年以降 / 過去」判定の基準年 */
  readonly bonusReferenceYear = new Date().getFullYear();
  readonly duplicateBonusPaymentDateMessage = DUPLICATE_BONUS_PAYMENT_DATE_ERROR_MESSAGE;
  /** FormArray の行追加・削除後にテンプレートへ変更を伝える */
  readonly bonusRegistryRevision = signal(0);
  readonly bonusPaymentDuplicateActive = computed(() => {
    this.bonusRegistryRevision();
    return this.detectBonusPaymentDuplicate();
  });
  readonly showPastBonuses = signal(false);

  readonly currentBonusPaymentDisplayRows = computed(() => {
    this.bonusRegistryRevision();
    return this.buildBonusPaymentDisplayRows((group) =>
      this.isCurrentOrFutureBonusPayment(group)
    );
  });

  readonly pastBonusPaymentDisplayRows = computed(() => {
    this.bonusRegistryRevision();
    return this.buildBonusPaymentDisplayRows(
      (group) => !this.isCurrentOrFutureBonusPayment(group)
    );
  });

  readonly pastBonusPaymentCount = computed(
    () => this.pastBonusPaymentDisplayRows().length
  );

  submitted = false;
  private successMessageTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.setupApplicableMonthValidator();
    this.applyInitialTabFromQuery();

    this.form.controls.prefecture.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((prefectureName) => {
        this.applySocialInsurancePrefectureCode(prefectureName);

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
        this.syncEditingEntryIdWithApplicableMonth();
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

  formatApplicableMonth(applicableMonth: string): string {
    return formatApplicableMonthLabel(applicableMonth);
  }

  isEditingInsuranceRateHistory(): boolean {
    return this.editingInsuranceRateEntryId() != null;
  }

  isEditingInsuranceRateHistoryEntry(entryId: string): boolean {
    return this.editingInsuranceRateEntryId() === entryId;
  }

  submitButtonLabel(): string {
    if (this.activeTab() === 'rates') {
      return this.isEditingInsuranceRateHistory() ? '更新' : '保存';
    }

    return '設定を保存';
  }

  selectInsuranceRateHistoryEntry(entry: InsuranceRateHistoryEntry): void {
    this.enterInsuranceRateEditMode(entry);
  }

  cancelInsuranceRateEditMode(): void {
    this.resetInsuranceRateFormForNewEntry();
  }

  setTab(tab: CompanySettingsTab): void {
    this.activeTab.set(tab);

    if (tab === 'rates') {
      this.applyMasterRatesForCurrentSelection();
    }
  }

  get bonusPaymentSettingsArray(): FormArray<BonusPaymentSettingFormGroup> {
    return this.form.controls.bonusPaymentSettings;
  }

  get currentBonusPaymentRowViews(): BonusPaymentRowView[] {
    return this.buildBonusPaymentRowViews().filter((row) =>
      this.isCurrentOrFutureBonusPayment(row.group)
    );
  }

  get currentBonusPaymentYearGroups(): BonusPaymentYearGroupView[] {
    return this.buildBonusPaymentYearGroups(this.currentBonusPaymentRowViews);
  }

  get pastBonusPaymentRowViews(): BonusPaymentRowView[] {
    return this.buildBonusPaymentRowViews().filter(
      (row) => !this.isCurrentOrFutureBonusPayment(row.group)
    );
  }

  get pastBonusPaymentYearGroups(): BonusPaymentYearGroupView[] {
    return this.buildBonusPaymentYearGroups(this.pastBonusPaymentRowViews);
  }

  private bumpBonusRegistryRevision(): void {
    this.bonusRegistryRevision.update((value) => value + 1);
  }

  private buildBonusPaymentDisplayRows(
    includeRow: (group: BonusPaymentSettingFormGroup) => boolean
  ): BonusPaymentDisplayRowView[] {
    const rows = this.buildBonusPaymentRowViews().filter((row) => includeRow(row.group));
    let previousYear: number | null = null;

    return rows.map((row) => {
      const displayYear =
        resolveBonusPaymentYear(row.group.controls.paymentDate.value) ?? this.bonusReferenceYear;
      const showYearDivider = previousYear !== displayYear;
      previousYear = displayYear;

      return {
        ...row,
        displayYear,
        showYearDivider,
      };
    });
  }

  togglePastBonuses(): void {
    this.showPastBonuses.update((value) => !value);
  }

  onAddBonusPaymentRow(): void {
    this.addBonusPaymentSetting();
    this.refreshBonusPaymentDateValidation();
    this.bumpBonusRegistryRevision();

    const newIndex = this.bonusPaymentSettingsArray.length - 1;
    queueMicrotask(() => {
      document.getElementById(`bonusName${newIndex}`)?.focus();
    });
  }

  isBonusPaymentDateDuplicate(index: number): boolean {
    if (!this.bonusPaymentDuplicateActive()) {
      return false;
    }

    const paymentDate = normalizeBonusPaymentSettingDate(
      this.bonusPaymentSettingsArray.at(index).controls.paymentDate.value
    );
    if (!paymentDate) {
      return false;
    }

    let matchCount = 0;
    for (const group of this.bonusPaymentSettingsArray.controls) {
      const otherDate = normalizeBonusPaymentSettingDate(group.controls.paymentDate.value);
      if (otherDate === paymentDate) {
        matchCount += 1;
      }
    }

    return matchCount > 1;
  }

  private addBonusPaymentSetting(): void {
    const group = this.createBonusPaymentSettingGroup();
    this.bonusPaymentSettingsArray.push(group);
    this.wireBonusPaymentRowChange(group);
    this.syncBonusPaymentRowValidators(group);
  }

  onBonusPaymentDateBlur(index: number): void {
    const control = this.bonusPaymentSettingsArray.at(index).controls.paymentDate;
    const normalized = normalizeBonusPaymentSettingDate(control.value);
    if (normalized) {
      control.setValue(normalized, { emitEvent: false });
    }
    this.refreshBonusPaymentDateValidation();
    this.bumpBonusRegistryRevision();
  }

  showBonusPaymentFieldError(index: number, field: 'name' | 'paymentDate'): boolean {
    const control = this.bonusPaymentSettingsArray.at(index).controls[field];
    if (
      field === 'paymentDate' &&
      control.hasError('duplicatePaymentDate') &&
      this.bonusPaymentDuplicateActive()
    ) {
      return false;
    }

    return control.invalid && (control.touched || control.dirty || this.submitted);
  }

  bonusPaymentFieldErrorMessage(index: number, field: 'name' | 'paymentDate'): string {
    const control = this.bonusPaymentSettingsArray.at(index).controls[field];
    if (control.hasError('required')) {
      return field === 'name' ? '賞与名を入力してください' : '支払年月日を入力してください';
    }

    if (field === 'paymentDate' && control.hasError('invalidDateBeforeStart')) {
      return 'システム利用開始年月より前の日付は設定できません';
    }

    if (field === 'paymentDate' && control.hasError('invalidPaymentDate')) {
      return '支払年月日は YYYY-MM-DD 形式で入力してください（例: 2026-07-10）';
    }

    return '入力内容を確認してください';
  }

  bonusPaymentMinDate(): string {
    return resolveMinBonusPaymentDateFromSystemStart(this.getSystemStartDateValue()) ?? '';
  }

  private applyInitialTabFromQuery(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'basic' || tab === 'rates' || tab === 'allowances' || tab === 'bonus') {
      this.setTab(tab);
    }
  }

  private createBonusPaymentSettingGroup(
    row?: Partial<BonusPaymentSetting>
  ): BonusPaymentSettingFormGroup {
    const group = this.fb.group({
      id: this.fb.control(row?.id ?? crypto.randomUUID()),
      name: this.fb.control(row?.name ?? ''),
      paymentDate: this.fb.control(row?.paymentDate ?? ''),
    });

    this.syncBonusPaymentRowValidators(group);
    return group;
  }

  private buildBonusPaymentDateValidators(getRowId: () => string): ValidatorFn[] {
    return [
      Validators.required,
      (control) =>
        normalizeBonusPaymentSettingDate(String(control.value ?? '').trim())
          ? null
          : { invalidPaymentDate: true },
      bonusPaymentDateNotBeforeSystemStartValidator(() => this.getSystemStartDateValue()),
      bonusPaymentDateDuplicateValidator(() => this.bonusPaymentSettingsArray, getRowId),
    ];
  }

  private wireBonusPaymentRowChange(group: BonusPaymentSettingFormGroup): void {
    group.controls.name.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncBonusPaymentRowValidators(group);
      });

    group.controls.paymentDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncBonusPaymentRowValidators(group);
        this.refreshBonusPaymentDateValidation();
        this.bumpBonusRegistryRevision();
      });
  }

  private syncBonusPaymentRowValidators(group: BonusPaymentSettingFormGroup): void {
    const row = {
      name: group.controls.name.value,
      paymentDate: group.controls.paymentDate.value,
    };

    if (isBonusPaymentRowEmpty(row)) {
      group.controls.name.clearValidators();
      group.controls.paymentDate.clearValidators();
    } else if (!this.isCurrentOrFutureBonusPayment(group)) {
      group.controls.name.setValidators(Validators.required);
      group.controls.paymentDate.setValidators([
        Validators.required,
        (control) =>
          normalizeBonusPaymentSettingDate(String(control.value ?? '').trim())
            ? null
            : { invalidPaymentDate: true },
        bonusPaymentDateDuplicateValidator(
          () => this.bonusPaymentSettingsArray,
          () => group.controls.id.value
        ),
      ]);
    } else {
      group.controls.name.setValidators(Validators.required);
      group.controls.paymentDate.setValidators(
        this.buildBonusPaymentDateValidators(() => group.controls.id.value)
      );
    }

    group.controls.name.updateValueAndValidity({ emitEvent: false });
    group.controls.paymentDate.updateValueAndValidity({ emitEvent: false });
  }

  private syncAllBonusPaymentRowValidators(): void {
    for (const group of this.bonusPaymentSettingsArray.controls) {
      this.syncBonusPaymentRowValidators(group);
    }
  }

  private bonusSaveDiagnosticFingerprint = '';

  private getSystemStartDateValue(): string {
    return String(this.form.getRawValue().systemStartDate ?? '').trim();
  }

  private logBonusSaveDiagnosticsIfNeeded(canSave: boolean): void {
    if (canSave || this.activeTab() !== 'bonus') {
      return;
    }

    const diagnostics = this.buildBonusSaveDiagnostics();
    const fingerprint = JSON.stringify(diagnostics);
    if (fingerprint === this.bonusSaveDiagnosticFingerprint) {
      return;
    }

    this.bonusSaveDiagnosticFingerprint = fingerprint;
    console.warn('[CompanySettings] 賞与タブ: 設定を保存が無効です', diagnostics);
  }

  private buildBonusSaveDiagnostics(): Record<string, unknown> {
    const rows = this.bonusPaymentSettingsArray.controls.map((group, index) => ({
      index,
      id: group.controls.id.value,
      name: group.controls.name.value,
      paymentDate: group.controls.paymentDate.value,
      isEmpty: isBonusPaymentRowEmpty({
        name: group.controls.name.value,
        paymentDate: group.controls.paymentDate.value,
      }),
      isCurrentOrFuture: this.isCurrentOrFutureBonusPayment(group),
      nameErrors: group.controls.name.errors,
      paymentDateErrors: group.controls.paymentDate.errors,
    }));

    return {
      systemStartDate: this.getSystemStartDateValue(),
      bonusPaymentMinDate: this.bonusPaymentMinDate(),
      duplicateActive: this.bonusPaymentDuplicateActive(),
      rowCount: this.bonusPaymentSettingsArray.length,
      rows,
      blockingReasons: this.collectBonusSaveBlockingReasons(rows),
    };
  }

  private collectBonusSaveBlockingReasons(
    rows: Array<{
      index: number;
      nameErrors: Record<string, unknown> | null;
      paymentDateErrors: Record<string, unknown> | null;
      isEmpty: boolean;
      isCurrentOrFuture: boolean;
    }>
  ): string[] {
    const reasons: string[] = [];

    for (const row of rows) {
      if (row.isEmpty || !row.isCurrentOrFuture) {
        continue;
      }

      if (row.nameErrors) {
        reasons.push(`行${row.index + 1} 賞与名: ${JSON.stringify(row.nameErrors)}`);
      }

      if (row.paymentDateErrors) {
        reasons.push(`行${row.index + 1} 支払日: ${JSON.stringify(row.paymentDateErrors)}`);
      }
    }

    if (this.bonusPaymentDuplicateActive()) {
      reasons.push('支払年月日の重複');
    }

    return reasons;
  }

  private canSaveBonusTab(): boolean {
    return this.evaluateBonusPaymentSettings(false);
  }

  private validateBonusPaymentSettings(markTouched: boolean): boolean {
    this.refreshBonusPaymentDateValidation();
    return this.evaluateBonusPaymentSettings(markTouched);
  }

  private evaluateBonusPaymentSettings(markTouched: boolean): boolean {
    const enteredCurrentRows = this.bonusPaymentSettingsArray.controls.filter(
      (group) =>
        !isBonusPaymentRowEmpty({
          name: group.controls.name.value,
          paymentDate: group.controls.paymentDate.value,
        }) && this.isCurrentOrFutureBonusPayment(group)
    );

    if (enteredCurrentRows.length === 0) {
      return !this.detectBonusPaymentDuplicate();
    }

    let valid = true;

    for (const group of enteredCurrentRows) {
      for (const field of ['name', 'paymentDate'] as const) {
        const control = group.controls[field];
        control.updateValueAndValidity({ emitEvent: false });
        if (control.invalid) {
          valid = false;
          if (markTouched) {
            control.markAsTouched();
          }
        }
      }
    }

    if (markTouched && this.detectBonusPaymentDuplicate()) {
      for (let index = 0; index < this.bonusPaymentSettingsArray.length; index += 1) {
        if (this.isBonusPaymentDateDuplicate(index)) {
          this.bonusPaymentSettingsArray.at(index).controls.paymentDate.markAsTouched();
        }
      }
    }

    return valid && !this.detectBonusPaymentDuplicate();
  }

  private detectBonusPaymentDuplicate(): boolean {
    const seenDates = new Set<string>();

    for (const group of this.bonusPaymentSettingsArray.controls) {
      const paymentDate = normalizeBonusPaymentSettingDate(
        group.controls.paymentDate.value
      );
      if (!paymentDate) {
        continue;
      }

      if (seenDates.has(paymentDate)) {
        return true;
      }

      seenDates.add(paymentDate);
    }

    return false;
  }

  private purgeEmptyBonusPaymentRows(): void {
    let removed = false;

    for (let index = this.bonusPaymentSettingsArray.length - 1; index >= 0; index -= 1) {
      const group = this.bonusPaymentSettingsArray.at(index);
      if (
        isBonusPaymentRowEmpty({
          name: group.controls.name.value,
          paymentDate: group.controls.paymentDate.value,
        })
      ) {
        this.bonusPaymentSettingsArray.removeAt(index);
        removed = true;
      }
    }

    if (removed) {
      this.bumpBonusRegistryRevision();
    }
  }

  private refreshBonusPaymentDateValidation(): void {
    for (const group of this.bonusPaymentSettingsArray.controls) {
      group.controls.paymentDate.updateValueAndValidity({ emitEvent: false });
    }
  }

  private populateBonusPaymentSettings(settings: BonusPaymentSetting[] | undefined): void {
    this.bonusPaymentSettingsArray.clear();
    this.showPastBonuses.set(false);

    for (const row of settings ?? []) {
      const group = this.createBonusPaymentSettingGroup(row);
      this.bonusPaymentSettingsArray.push(group);
      this.wireBonusPaymentRowChange(group);
    }

    this.sortBonusPaymentFormArray();
    this.refreshBonusPaymentDateValidation();
    this.bumpBonusRegistryRevision();
  }

  private buildBonusPaymentYearGroups(
    rowViews: BonusPaymentRowView[]
  ): BonusPaymentYearGroupView[] {
    const sortedRows = [...rowViews].sort((left, right) =>
      this.compareBonusPaymentRowViews(left, right)
    );
    const groups = new Map<number, BonusPaymentRowView[]>();

    for (const row of sortedRows) {
      const year =
        resolveBonusPaymentYear(row.group.controls.paymentDate.value) ?? this.bonusReferenceYear;
      const bucket = groups.get(year) ?? [];
      bucket.push(row);
      groups.set(year, bucket);
    }

    return [...groups.entries()]
      .sort(([leftYear], [rightYear]) => leftYear - rightYear)
      .map(([year, rows]) => ({ year, rows }));
  }

  private compareBonusPaymentRowViews(
    left: BonusPaymentRowView,
    right: BonusPaymentRowView
  ): number {
    return compareBonusPaymentSettingsForDisplay(
      {
        id: left.group.controls.id.value,
        name: left.group.controls.name.value,
        paymentDate: left.group.controls.paymentDate.value,
      },
      {
        id: right.group.controls.id.value,
        name: right.group.controls.name.value,
        paymentDate: right.group.controls.paymentDate.value,
      }
    );
  }

  private sortBonusPaymentFormArray(): void {
    const controls = [...this.bonusPaymentSettingsArray.controls];
    controls.sort((left, right) =>
      compareBonusPaymentSettingsForDisplay(
        {
          id: left.controls.id.value,
          name: left.controls.name.value,
          paymentDate: left.controls.paymentDate.value,
        },
        {
          id: right.controls.id.value,
          name: right.controls.name.value,
          paymentDate: right.controls.paymentDate.value,
        }
      )
    );

    this.bonusPaymentSettingsArray.clear();
    for (const group of controls) {
      this.bonusPaymentSettingsArray.push(group);
    }

    this.bumpBonusRegistryRevision();
  }

  private buildBonusPaymentRowViews(): BonusPaymentRowView[] {
    return this.bonusPaymentSettingsArray.controls.map((group, index) => ({
      index,
      group,
    }));
  }

  private isCurrentOrFutureBonusPayment(group: BonusPaymentSettingFormGroup): boolean {
    const paymentDate = group.controls.paymentDate.value.trim();
    if (!paymentDate) {
      return true;
    }

    const normalized = normalizeBonusPaymentSettingDate(paymentDate);
    if (!normalized) {
      return true;
    }

    const paymentYear = Number(normalized.slice(0, 4));
    return paymentYear >= this.bonusReferenceYear;
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

    if (this.activeTab() === 'bonus') {
      const canSave = this.canSaveBonusTab();
      this.logBonusSaveDiagnosticsIfNeeded(canSave);
      return !canSave;
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
    this.applySocialInsurancePrefectureCode(prefectureName);
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
    this.syncEditingEntryIdWithApplicableMonth();
    this.refreshApplicableMonthValidation();
    this.applyMasterRatesForPrefecture(this.form.controls.prefecture.value, applicableMonth);
  }

  async onSubmit(): Promise<void> {
    console.log('[CompanySettings] onSubmit 開始', {
      activeTab: this.activeTab(),
      formValue: this.form.getRawValue(),
    });

    this.submitted = true;
    this.saveError.set('');
    this.saveSuccess.set('');

    if (this.activeTab() === 'bonus') {
      this.purgeEmptyBonusPaymentRows();
    }

    if (!this.validateActiveTab()) {
      console.warn('[CompanySettings] バリデーションエラー', {
        tab: this.activeTab(),
        bonusDiagnostics:
          this.activeTab() === 'bonus' ? this.buildBonusSaveDiagnostics() : null,
        invalidFields: this.collectInvalidFieldsForActiveTab(),
      });
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
    const editingEntryId = this.editingInsuranceRateEntryId();
    const shouldSaveHistory =
      this.activeTab() === 'rates' &&
      historyEntry != null &&
      (editingEntryId != null ||
        shouldAppendInsuranceRateHistory(this.insuranceRateHistory(), historyEntry));
    const shouldSyncAllowances = this.activeTab() === 'allowances';
    const wasEditingInsuranceRate = editingEntryId != null;

    this.saving.set(true);
    try {
      const updatedHistory = await this.companyService.updateCompany(data, {
        insuranceRateHistoryEntry: shouldSaveHistory ? historyEntry : null,
        insuranceRateHistoryEntryId: shouldSaveHistory ? editingEntryId : null,
      });
      this.insuranceRateHistory.set(updatedHistory);
      this.submitted = false;

      if (shouldSyncAllowances) {
        await this.employeeService.syncAllowancesFromCompany(data.allowances);
        this.showSaveSuccessMessage(
          '手当設定を保存し、未確定の従業員データに反映しました（※確定済みの給与には影響しません）'
        );
      } else if (this.activeTab() === 'rates') {
        this.completeRatesTabSave(historyEntry, updatedHistory, wasEditingInsuranceRate);
      } else if (this.activeTab() === 'basic') {
        await this.syncLinkedEmployeeEmailIfNeeded(data);
        await this.adminEmployeeLinkService.reloadLink();
        this.showSaveSuccessMessage('基本情報を保存しました');
      } else if (this.activeTab() === 'bonus') {
        this.sortBonusPaymentFormArray();
        this.bumpBonusRegistryRevision();
        this.showSaveSuccessMessage('賞与支払日設定を保存しました');
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
      let valid = true;

      for (const field of COMPANY_ALLOWANCE_FORM_FIELDS) {
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

    if (tab === 'bonus') {
      return this.validateBonusPaymentSettings(markTouched);
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

  showAllowanceFieldError(field: CompanyAllowanceFormField): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  allowanceFieldErrorMessage(field: CompanyAllowanceFormField): string {
    const control = this.form.controls[field];

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
        editingEntryId: this.editingInsuranceRateEntryId(),
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
        editingEntryId: this.editingInsuranceRateEntryId(),
        systemStartDate: this.form.controls.systemStartDate.value,
        userEditedApplicableMonth: this.userEditedApplicableMonth(),
      }))
    );
  }

  private completeRatesTabSave(
    historyEntry: ReturnType<CompanySettingsComponent['buildInsuranceRateHistoryEntry']>,
    updatedHistory: InsuranceRateHistoryEntry[],
    wasEditing: boolean
  ): void {
    if (historyEntry) {
      const savedMonth =
        normalizeYearMonthKey(historyEntry.applicableMonth) ?? historyEntry.applicableMonth.trim();
      const savedEntry = updatedHistory.find(
        (entry) =>
          (normalizeYearMonthKey(entry.applicableMonth) ?? entry.applicableMonth.trim()) ===
          savedMonth
      );

      if (savedEntry) {
        this.enterInsuranceRateEditMode(savedEntry, { markPristine: true });
      } else {
        this.resetInsuranceRateFormForNewEntry();
      }
    }

    this.showSaveSuccessMessage(
      wasEditing
        ? '社会保険料率の履歴を更新しました'
        : '社会保険料率と適用都道府県を保存しました'
    );
  }

  private enterInsuranceRateEditMode(
    entry: InsuranceRateHistoryEntry,
    options: { markPristine?: boolean } = {}
  ): void {
    this.editingInsuranceRateEntryId.set(entry.id);
    this.userEditedApplicableMonth.set(true);
    this.form.patchValue(
      {
        applicableMonth: entry.applicableMonth,
        healthInsuranceRate: entry.healthInsuranceRate,
        longTermCareInsuranceRate: entry.careInsuranceRate,
      },
      { emitEvent: false }
    );

    const rateFields = [
      'applicableMonth',
      'healthInsuranceRate',
      'longTermCareInsuranceRate',
    ] as const;

    for (const field of rateFields) {
      const control = this.form.controls[field];
      if (options.markPristine) {
        control.markAsPristine();
        control.markAsUntouched();
      } else {
        control.markAsDirty();
      }
    }

    this.refreshApplicableMonthValidation();
  }

  private resetInsuranceRateFormForNewEntry(): void {
    this.editingInsuranceRateEntryId.set(null);
    this.userEditedApplicableMonth.set(false);

    const nextMonth = this.resolveNextApplicableMonthForNewEntry();
    this.form.patchValue({ applicableMonth: nextMonth }, { emitEvent: false });
    this.applyMasterRatesForPrefecture(this.form.controls.prefecture.value, nextMonth);

    const control = this.form.controls.applicableMonth;
    control.markAsPristine();
    control.markAsUntouched();
    this.refreshApplicableMonthValidation();
  }

  private resolveNextApplicableMonthForNewEntry(): string {
    const history = this.insuranceRateHistory();
    if (history.length === 0) {
      return getCurrentYearAprilMonthKey();
    }

    const latestMonth =
      normalizeYearMonthKey(history[0].applicableMonth) ?? history[0].applicableMonth.trim();
    return getNextYearMonthKey(latestMonth);
  }

  private syncEditingEntryIdWithApplicableMonth(): void {
    const editingId = this.editingInsuranceRateEntryId();
    if (!editingId) {
      return;
    }

    const editingEntry = this.insuranceRateHistory().find((entry) => entry.id === editingId);
    if (!editingEntry) {
      this.editingInsuranceRateEntryId.set(null);
      return;
    }

    const currentMonth =
      normalizeYearMonthKey(this.form.controls.applicableMonth.value) ??
      this.form.controls.applicableMonth.value.trim();
    const entryMonth =
      normalizeYearMonthKey(editingEntry.applicableMonth) ?? editingEntry.applicableMonth.trim();

    if (currentMonth !== entryMonth) {
      this.editingInsuranceRateEntryId.set(null);
    }
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
    this.editingInsuranceRateEntryId.set(null);
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
    this.populateBonusPaymentSettings(company.bonusPaymentSettings);
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

  private applySocialInsurancePrefectureCode(prefectureName: string): void {
    const code = resolveSocialInsurancePrefectureCode(prefectureName);
    this.form.controls.prefectureCode.setValue(code, { emitEvent: false });
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
          ? [...COMPANY_ALLOWANCE_FORM_FIELDS]
          : tab === 'bonus'
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
      allowances: companyAllowancesFromFormValues({
        familyAllowance: raw.familyAllowance,
        rentAllowance: raw.rentAllowance,
        fixedOvertimeAllowance: raw.fixedOvertimeAllowance,
        commutingAllowance: raw.commutingAllowance,
        otherAllowance: raw.otherAllowance,
      }),
      bonusPaymentSettings: bonusPaymentSettingsFromFormValues(raw.bonusPaymentSettings),
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

    if (history.length === 0) {
      return getCurrentYearAprilMonthKey();
    }

    return resolveSystemOperationMonthFromLatestLock(latestLockedMonth, {
      systemStartDate: company.systemStartDate,
      calendarMonth: getCurrentYearAprilMonthKey(),
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
    this.form.patchValue(formValuesFromCompanyAllowances(allowances), { emitEvent: false });
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
