import { DecimalPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { StandardRemunerationService } from '@core/services/standard-remuneration.service';
import { EmployeeService } from '@core/services/employee.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import {
  calculateEmployeeFixedWages,
  DEFAULT_PAYROLL_BASE_DAYS,
  formatTargetMonthLabel,
} from '@features/payroll/utils/compensation.utils';
import { CompanyAllowance } from '@features/settings/models/company-settings.model';
import { HalfWidthDigitsOnlyDirective } from '@shared/directives/half-width-digits-only.directive';
import { IsoDateInputComponent } from '@shared/components/iso-date-input/iso-date-input.component';
import { isoDateValidator } from '@shared/validators/iso-date.validators';
import { MyNumberInputComponent } from '@shared/components/my-number-input/my-number-input.component';
import { debounceTime, filter } from 'rxjs';
import {
  buildExistingEmployeeHistoryMonths,
  derivePensionGradeFromHealthGrade,
  formatExistingEmployeeHistoryPeriodLabel,
  isResolvableHireDateForRegistration,
  REGISTRATION_TYPE_MISMATCH_EXISTING_ERROR,
  REGISTRATION_TYPE_MISMATCH_NEW_ERROR,
  resolveRegistrationTypeMismatchError,
} from '../../utils/employee-registration-flow.utils';
import {
  EmployeeGender,
  EmployeeRegistrationField,
  EmployeeRegistrationFormData,
  EmployeeRegistrationType,
  SOCIAL_INSURANCE_TYPE_OPTIONS,
  SocialInsuranceType,
} from '../../models/employee-registration.model';
import { resolveNewestPayrollHistoryRow } from '../../utils/payroll-history-registration.utils';
import {
  BIRTH_AFTER_HIRE_ERROR,
  EMPLOYEE_NUMBER_DUPLICATE_ERROR,
  EMPLOYEE_NUMBER_PATTERN,
  employeeDateRulesValidator,
  KANA_PATTERN,
  MY_NUMBER_PATTERN,
  UNDER_MINIMUM_HIRE_AGE_ERROR,
} from '../../validators/employee-registration.validators';
import { createLockedMonthAsyncValidator } from '@features/payroll/validators/monthly-lock.validators';
import {
  HIRE_DATE_LOCKED_MONTH_MESSAGE,
  LOCKED_MONTH_ERROR,
} from '@features/payroll/utils/monthly-lock.utils';

type AllowanceFormGroup = FormGroup<{
  name: FormControl<string>;
  amount: FormControl<number | null>;
}>;

type PayrollHistoryRowFormGroup = FormGroup<{
  targetMonth: FormControl<string>;
  fixedWages: FormControl<number | null>;
  nonFixedWages: FormControl<number | null>;
  baseDays: FormControl<number | null>;
  healthGrade: FormControl<number | null>;
  pensionGrade: FormControl<number | null>;
}>;

type PayrollHistoryRowSnapshot = {
  targetMonth: string;
  fixedWages: number | null;
  nonFixedWages: number | null;
  baseDays: number | null;
  healthGrade: number | null;
  pensionGrade: number | null;
};

@Component({
  selector: 'app-employee-registration-modal',
  standalone: true,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    MyNumberInputComponent,
    IsoDateInputComponent,
    HalfWidthDigitsOnlyDirective,
  ],
  templateUrl: './employee-registration-modal.component.html',
  styleUrl: './employee-registration-modal.component.scss',
})
export class EmployeeRegistrationModalComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly standardRemunerationService = inject(StandardRemunerationService);
  private readonly employeeService = inject(EmployeeService);
  private readonly monthlyLockService = inject(MonthlyLockService);

  readonly open = input(false);
  readonly systemStartDate = input('');
  readonly companyAllowances = input<CompanyAllowance[]>([]);
  readonly closed = output<void>();
  readonly registered = output<EmployeeRegistrationFormData>();

  readonly socialInsuranceTypeOptions = SOCIAL_INSURANCE_TYPE_OPTIONS;
  readonly healthGrades = this.standardRemunerationService.healthGrades;
  readonly pensionGrades = this.standardRemunerationService.pensionGrades;
  readonly remunerationHint = signal('');
  readonly totalFixedWages = signal(0);
  readonly saving = signal(false);
  readonly checkingEmployeeNumber = signal(false);
  readonly submitError = signal('');

  private employeeNumberCheckVersion = 0;
  private readonly historyRowHealthGradeManualOverride = new WeakMap<
    PayrollHistoryRowFormGroup,
    boolean
  >();
  private readonly historyRowFixedWagesManualOverride = new WeakMap<
    PayrollHistoryRowFormGroup,
    boolean
  >();
  private isSyncingHistoryFixedWages = false;
  private isResettingForm = false;

  readonly form = this.fb.group(
    {
      employeeNumber: this.fb.control('', [
        Validators.required,
        Validators.pattern(EMPLOYEE_NUMBER_PATTERN),
      ]),
      registrationType: this.fb.control<EmployeeRegistrationType>('new', Validators.required),
      socialInsuranceType: this.fb.control<SocialInsuranceType>('general', Validators.required),
      lastName: this.fb.control('', Validators.required),
      firstName: this.fb.control('', Validators.required),
      lastNameKana: this.fb.control('', [Validators.required, Validators.pattern(KANA_PATTERN)]),
      firstNameKana: this.fb.control('', [Validators.required, Validators.pattern(KANA_PATTERN)]),
      birthDate: this.fb.control('', [Validators.required, isoDateValidator()]),
      gender: this.fb.control<EmployeeGender>('male', Validators.required),
      hireDate: this.fb.control('', [Validators.required, isoDateValidator()]),
      myNumber: this.fb.control('', [Validators.required, Validators.pattern(MY_NUMBER_PATTERN)]),
      hasDependents: this.fb.control<boolean>(false, Validators.required),
      insuredPersonNumber: this.fb.control(''),
      baseSalary: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
      allowances: this.fb.array<AllowanceFormGroup>([]),
      healthGrade: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
      pensionGrade: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
      healthStandardRemuneration: this.fb.control<number | null>(null),
      pensionStandardRemuneration: this.fb.control<number | null>(null),
      applicableStartMonth: this.fb.control(''),
      payrollHistoryRows: this.fb.array<PayrollHistoryRowFormGroup>([]),
    },
    { validators: employeeDateRulesValidator() }
  );

  submitted = false;

  private readonly syncFormWithModalOpen = effect(() => {
    if (this.open()) {
      this.initializeFormForOpen();
      return;
    }

    this.resetForm();
  });

  ngOnInit(): void {
    this.form.controls.hireDate.addAsyncValidators(
      createLockedMonthAsyncValidator(this.monthlyLockService)
    );

    this.updateConditionalValidators(this.form.controls.registrationType.value);

    this.form.controls.registrationType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        if (this.isResettingForm) {
          return;
        }

        this.updateConditionalValidators(type);
        this.syncRegistrationTypeCrossValidation();
        this.tryRebuildExistingHistoryRows();
      });

    this.form.controls.hireDate.valueChanges
      .pipe(
        debounceTime(500),
        filter((hireDate) => isResolvableHireDateForRegistration(hireDate)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (this.isResettingForm) {
          return;
        }

        this.syncRegistrationTypeCrossValidation();
        this.tryRebuildExistingHistoryRows();
      });

    this.form.controls.hireDate.valueChanges
      .pipe(
        debounceTime(500),
        filter((hireDate) => !isResolvableHireDateForRegistration(hireDate)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (this.isResettingForm) {
          return;
        }

        this.syncRegistrationTypeCrossValidation();
        this.payrollHistoryRows.clear({ emitEvent: false });
      });

    this.form.controls.baseSalary.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onCurrentFixedWagesChanged());

    this.form.controls.allowances.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onCurrentFixedWagesChanged());

    this.form.controls.birthDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.form.updateValueAndValidity({ emitEvent: false }));

    this.form.controls.employeeNumber.valueChanges
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        void this.validateEmployeeNumberAvailability(value);
      });
  }

  get isExistingEmployee(): boolean {
    return this.form.controls.registrationType.value === 'existing';
  }

  get isNewEmployee(): boolean {
    return !this.isExistingEmployee;
  }

  get allowanceRows(): FormArray<AllowanceFormGroup> {
    return this.form.controls.allowances;
  }

  get payrollHistoryRows(): FormArray<PayrollHistoryRowFormGroup> {
    return this.form.controls.payrollHistoryRows;
  }

  get existingHistoryPeriodLabel(): string {
    return formatExistingEmployeeHistoryPeriodLabel(
      this.form.controls.hireDate.value,
      this.systemStartDate()
    );
  }

  formatMonthLabel(month: string): string {
    return formatTargetMonthLabel(month);
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('employee-modal')) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  onSubmit(): void {
    void this.submitRegistration();
  }

  private async submitRegistration(): Promise<void> {
    this.submitted = true;
    this.submitError.set('');
    this.syncRegistrationTypeCrossValidation();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const data = this.buildRegistrationData();
    const employeeNumber = data.employeeNumber.trim();

    this.saving.set(true);

    try {
      const taken = await this.employeeService.isEmployeeNumberTaken(employeeNumber);
      if (taken) {
        this.setEmployeeNumberDuplicateError();
        return;
      }

      await this.employeeService.createEmployee(data);
      this.registered.emit(data);
      this.close();
    } catch (error) {
      const message = toFirestoreErrorMessage(
        error,
        error instanceof Error ? error.message : '従業員の保存に失敗しました'
      );

      if (this.isDuplicateEmployeeNumberMessage(message)) {
        this.setEmployeeNumberDuplicateError();
        return;
      }

      this.submitError.set(message);
    } finally {
      this.saving.set(false);
    }
  }

  private buildRegistrationData(): EmployeeRegistrationFormData {
    const raw = this.form.getRawValue();
    const payrollHistoryRows = raw.payrollHistoryRows.map((row) => ({
      targetMonth: row.targetMonth,
      fixedWages: row.fixedWages ?? 0,
      nonFixedWages: row.nonFixedWages ?? 0,
      baseDays: row.baseDays ?? DEFAULT_PAYROLL_BASE_DAYS,
      healthGrade: row.healthGrade ?? 0,
      pensionGrade: row.pensionGrade ?? 0,
    }));

    let healthGrade = raw.healthGrade ?? 0;
    let pensionGrade = raw.pensionGrade ?? 0;

    if (this.isExistingEmployee) {
      const newest = resolveNewestPayrollHistoryRow(payrollHistoryRows);
      healthGrade = newest?.healthGrade ?? 0;
      pensionGrade = newest?.pensionGrade ?? 0;
    }

    const healthGradeInfo = this.standardRemunerationService.healthGrades.find(
      (grade) => grade.grade === healthGrade
    );
    const pensionGradeInfo = this.standardRemunerationService.pensionGrades.find(
      (grade) => grade.grade === pensionGrade
    );

    const data: EmployeeRegistrationFormData = {
      employeeNumber: raw.employeeNumber,
      registrationType: raw.registrationType,
      socialInsuranceType: raw.socialInsuranceType,
      lastName: raw.lastName,
      firstName: raw.firstName,
      lastNameKana: raw.lastNameKana,
      firstNameKana: raw.firstNameKana,
      birthDate: raw.birthDate,
      gender: raw.gender,
      hireDate: raw.hireDate,
      myNumber: raw.myNumber,
      hasDependents: raw.hasDependents,
      insuredPersonNumber: raw.insuredPersonNumber,
      baseSalary: raw.baseSalary ?? 0,
      allowances: raw.allowances.map((row) => ({
        name: row.name.trim(),
        amount: row.amount ?? null,
      })),
      healthGrade,
      pensionGrade,
      healthStandardRemuneration: healthGradeInfo?.monthlyAmount ?? 0,
      pensionStandardRemuneration: pensionGradeInfo?.monthlyAmount ?? 0,
      applicableStartMonth: this.isExistingEmployee ? this.systemStartDate() : '',
      payrollHistoryRows: this.isExistingEmployee ? payrollHistoryRows : [],
    };

    return data;
  }

  showError(field: EmployeeRegistrationField): boolean {
    const control = this.form.controls[field];

    if (field === 'employeeNumber' && control.errors?.[EMPLOYEE_NUMBER_DUPLICATE_ERROR]) {
      return true;
    }

    if (field === 'hireDate' && control.errors?.[LOCKED_MONTH_ERROR]) {
      return true;
    }

    if (field === 'hireDate' && this.hasRegistrationTypeMismatchError(control)) {
      const hireDate = this.form.controls.hireDate.value;
      return (
        control.touched ||
        this.submitted ||
        isResolvableHireDateForRegistration(hireDate)
      );
    }

    return control.invalid && (control.touched || this.submitted);
  }

  showHistoryRowError(index: number, field: keyof PayrollHistoryRowFormGroup['controls']): boolean {
    const control = this.payrollHistoryRows.at(index)?.controls[field];
    return Boolean(control?.invalid && (control.touched || this.submitted));
  }

  historyRowErrorMessage(
    index: number,
    field: keyof PayrollHistoryRowFormGroup['controls']
  ): string {
    const control = this.payrollHistoryRows.at(index)?.controls[field];
    if (!control) {
      return '入力内容を確認してください';
    }

    if (control.errors?.['required']) {
      return field === 'targetMonth' ? '対象月が不正です' : '必須項目です';
    }

    if (control.errors?.['min']) {
      return field === 'baseDays' ? '1以上の数値を入力してください' : '0以上の数値を入力してください';
    }

    return '入力内容を確認してください';
  }

  errorMessage(field: EmployeeRegistrationField): string {
    const control = this.form.controls[field];

    if (control.errors?.['required']) {
      return '必須項目です';
    }

    if (control.errors?.[EMPLOYEE_NUMBER_DUPLICATE_ERROR]) {
      return '※この社員番号はすでに登録されています。';
    }

    if (control.errors?.['pattern']) {
      if (field === 'employeeNumber') {
        return '半角数字で1〜20桁以内で入力してください';
      }
      if (field === 'myNumber') {
        return '12桁の数字で入力してください';
      }
      if (field === 'lastNameKana' || field === 'firstNameKana') {
        return 'カタカナで入力してください';
      }
    }

    if (control.errors?.['min']) {
      return field === 'baseSalary' ? '0以上の数値を入力してください' : '等級を選択してください';
    }

    if (control.errors?.['isoDate']) {
      return 'YYYY-MM-DD 形式の有効な日付を入力してください';
    }

    if (control.errors?.[BIRTH_AFTER_HIRE_ERROR]) {
      return '生年月日は入社年月日以前の日付を入力してください';
    }

    if (control.errors?.[UNDER_MINIMUM_HIRE_AGE_ERROR]) {
      return '入社時点で15歳未満の方は登録できません';
    }

    if (control.errors?.[LOCKED_MONTH_ERROR]) {
      return HIRE_DATE_LOCKED_MONTH_MESSAGE;
    }

    if (control.errors?.[REGISTRATION_TYPE_MISMATCH_EXISTING_ERROR]) {
      return '※システム利用開始日以降の入社です。登録種別を「新入社員」に変更してください。';
    }

    if (control.errors?.[REGISTRATION_TYPE_MISMATCH_NEW_ERROR]) {
      return '※システム利用開始日より前の入社です。登録種別を「既存社員」に変更してください。';
    }

    return '入力内容を確認してください';
  }

  private hasRegistrationTypeMismatchError(control: AbstractControl): boolean {
    return Boolean(
      control.errors?.[REGISTRATION_TYPE_MISMATCH_EXISTING_ERROR] ||
        control.errors?.[REGISTRATION_TYPE_MISMATCH_NEW_ERROR]
    );
  }

  private initializeFormForOpen(): void {
    this.isResettingForm = true;

    try {
      this.resetFormCore();
      this.populateAllowancesFromCompany();
      this.refreshNewEmployeeGrades();
    } finally {
      this.isResettingForm = false;
    }
  }

  private resetForm(): void {
    this.resetFormCore();
  }

  private resetFormCore(): void {
    this.submitted = false;
    this.employeeNumberCheckVersion += 1;
    this.isSyncingHistoryFixedWages = false;
    this.remunerationHint.set('');
    this.totalFixedWages.set(0);
    this.saving.set(false);
    this.checkingEmployeeNumber.set(false);
    this.submitError.set('');

    this.payrollHistoryRows.clear({ emitEvent: false });
    this.allowanceRows.clear({ emitEvent: false });

    this.form.reset(
      {
        employeeNumber: '',
        registrationType: 'new',
        socialInsuranceType: 'general',
        lastName: '',
        firstName: '',
        lastNameKana: '',
        firstNameKana: '',
        birthDate: '',
        gender: 'male',
        hireDate: '',
        myNumber: '',
        hasDependents: false,
        insuredPersonNumber: '',
        baseSalary: null,
        healthGrade: null,
        pensionGrade: null,
        healthStandardRemuneration: null,
        pensionStandardRemuneration: null,
        applicableStartMonth: '',
      },
      { emitEvent: false }
    );

    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.applyRegistrationTypeValidators('new');
  }

  private populateAllowancesFromCompany(): void {
    this.allowanceRows.clear();

    for (const row of this.companyAllowances()) {
      if (!row.name.trim()) {
        continue;
      }
      this.allowanceRows.push(this.createAllowanceGroup(row.name, row.amount));
    }

    if (this.isNewEmployee) {
      this.refreshNewEmployeeGrades();
    } else if (this.isExistingEmployee) {
      this.refreshCurrentTotalFixedWages();
    }
  }

  private onCurrentFixedWagesChanged(): void {
    if (this.isResettingForm) {
      return;
    }

    if (this.isNewEmployee) {
      this.refreshNewEmployeeGrades();
      return;
    }

    if (this.isExistingEmployee) {
      this.refreshCurrentTotalFixedWages();
    }
  }

  private calculateCurrentTotalFixedWages(): number {
    const raw = this.form.getRawValue();

    return calculateEmployeeFixedWages({
      baseSalary: raw.baseSalary ?? 0,
      allowances: raw.allowances.map((row) => ({
        name: row.name,
        amount: row.amount ?? null,
      })),
    });
  }

  private refreshCurrentTotalFixedWages(): void {
    if (!this.isExistingEmployee) {
      return;
    }

    const fixedTotal = this.calculateCurrentTotalFixedWages();
    this.totalFixedWages.set(fixedTotal);
    this.syncHistoryFixedWagesFromCurrentTotal(fixedTotal);
  }

  private syncHistoryFixedWagesFromCurrentTotal(total: number): void {
    if (this.payrollHistoryRows.length === 0) {
      return;
    }

    this.isSyncingHistoryFixedWages = true;

    try {
      for (const group of this.payrollHistoryRows.controls) {
        if (this.historyRowFixedWagesManualOverride.get(group)) {
          continue;
        }

        this.applyHistoryRowAutofillFromFixedWages(group, total > 0 ? total : null);
      }
    } finally {
      this.isSyncingHistoryFixedWages = false;
    }
  }

  /** 固定賃金から健保・厚年等級（-3ルール）を算出 */
  private resolveGradesFromFixedWages(
    fixedWages: number
  ): { healthGrade: number; pensionGrade: number } | null {
    const health = this.standardRemunerationService.resolveHealthGrade(fixedWages);
    if (!health) {
      return null;
    }

    return {
      healthGrade: health.grade,
      pensionGrade: derivePensionGradeFromHealthGrade(health.grade),
    };
  }

  /** オートフィル: 固定賃金と等級を同一トランザクションで反映 */
  private applyHistoryRowAutofillFromFixedWages(
    group: PayrollHistoryRowFormGroup,
    fixedWages: number | null
  ): void {
    if (group.controls.fixedWages.value !== fixedWages) {
      group.controls.fixedWages.setValue(fixedWages, { emitEvent: false });
    }

    if (fixedWages == null || fixedWages <= 0) {
      this.clearHistoryRowGrades(group);
      return;
    }

    this.patchHistoryRowGradesFromFixedWages(group, fixedWages, { force: true });
  }

  /** 固定賃金に基づき健保・厚年等級をフォームへ反映 */
  private patchHistoryRowGradesFromFixedWages(
    group: PayrollHistoryRowFormGroup,
    fixedWages: number,
    options: { force?: boolean } = {}
  ): void {
    if (options.force) {
      this.historyRowHealthGradeManualOverride.delete(group);
      group.controls.healthGrade.markAsPristine();
    } else if (this.historyRowHealthGradeManualOverride.get(group)) {
      this.syncPensionGradeFromHealthForHistoryRow(group);
      return;
    }

    const grades = this.resolveGradesFromFixedWages(fixedWages);
    if (!grades) {
      this.clearHistoryRowGrades(group);
      return;
    }

    group.controls.healthGrade.setValue(grades.healthGrade, { emitEvent: false });
    group.controls.healthGrade.markAsPristine();
    group.controls.pensionGrade.setValue(grades.pensionGrade, { emitEvent: false });
  }

  private markHistoryRowFixedWagesManualIfCustomized(
    group: PayrollHistoryRowFormGroup,
    snapshot: PayrollHistoryRowSnapshot | undefined,
    currentTotal: number
  ): void {
    if (snapshot?.fixedWages == null || currentTotal <= 0) {
      return;
    }

    if (snapshot.fixedWages !== currentTotal) {
      this.historyRowFixedWagesManualOverride.set(group, true);
    }
  }

  private resolveMasterAllowanceInitialAmount(amount: number | null | undefined): number {
    if (amount == null) {
      return 0;
    }

    const normalized = Number(amount);
    return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
  }

  private createAllowanceGroup(
    name: string,
    masterAmount: number | null | undefined = null
  ): AllowanceFormGroup {
    return this.fb.group({
      name: this.fb.control({ value: name, disabled: true }),
      amount: this.fb.control<number | null>(this.resolveMasterAllowanceInitialAmount(masterAmount), [
        Validators.min(0),
      ]),
    });
  }

  private createPayrollHistoryRowGroup(
    targetMonth: string,
    snapshot?: PayrollHistoryRowSnapshot
  ): PayrollHistoryRowFormGroup {
    const initialHealthGrade = snapshot?.healthGrade ?? null;
    const initialPensionGrade =
      initialHealthGrade != null
        ? derivePensionGradeFromHealthGrade(initialHealthGrade)
        : null;

    return this.fb.group({
      targetMonth: this.fb.control({ value: targetMonth, disabled: true }, Validators.required),
      fixedWages: this.fb.control<number | null>(snapshot?.fixedWages ?? null, [
        Validators.required,
        Validators.min(0),
      ]),
      nonFixedWages: this.fb.control<number | null>(snapshot?.nonFixedWages ?? 0, [
        Validators.required,
        Validators.min(0),
      ]),
      baseDays: this.fb.control<number | null>(snapshot?.baseDays ?? DEFAULT_PAYROLL_BASE_DAYS, [
        Validators.required,
        Validators.min(1),
      ]),
      healthGrade: this.fb.control<number | null>(initialHealthGrade, [
        Validators.required,
        Validators.min(1),
      ]),
      pensionGrade: this.fb.control(
        { value: initialPensionGrade, disabled: true },
        [Validators.required, Validators.min(1)]
      ),
    });
  }

  private attachHistoryRowReactiveHandlers(group: PayrollHistoryRowFormGroup): void {
    group.controls.healthGrade.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.historyRowHealthGradeManualOverride.set(group, true);
        this.syncPensionGradeFromHealthForHistoryRow(group);
      });

    group.controls.fixedWages.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isSyncingHistoryFixedWages) {
          return;
        }

        this.historyRowFixedWagesManualOverride.set(group, true);
        this.proposeGradesForHistoryRow(group, { force: true });
      });

    group.controls.nonFixedWages.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.proposeGradesForHistoryRow(group, { force: true });
      });

    this.proposeGradesForHistoryRow(group);
  }

  private syncPensionGradeFromHealthForHistoryRow(group: PayrollHistoryRowFormGroup): void {
    const healthGrade = group.controls.healthGrade.value;

    if (healthGrade == null || healthGrade < 1) {
      group.controls.pensionGrade.setValue(null, { emitEvent: false });
      return;
    }

    group.controls.pensionGrade.setValue(derivePensionGradeFromHealthGrade(healthGrade), {
      emitEvent: false,
    });
  }

  private tryRebuildExistingHistoryRows(): void {
    if (this.isResettingForm) {
      return;
    }

    if (!this.isExistingEmployee) {
      this.payrollHistoryRows.clear({ emitEvent: false });
      return;
    }

    const hireDate = this.form.controls.hireDate.value;
    if (!isResolvableHireDateForRegistration(hireDate)) {
      this.payrollHistoryRows.clear({ emitEvent: false });
      return;
    }

    if (resolveRegistrationTypeMismatchError(
      'existing',
      hireDate,
      this.systemStartDate()
    )) {
      this.payrollHistoryRows.clear({ emitEvent: false });
      return;
    }

    this.rebuildPayrollHistoryRows(hireDate);
  }

  private rebuildPayrollHistoryRows(hireDate: string): void {
    const months = buildExistingEmployeeHistoryMonths(hireDate, this.systemStartDate());
    const snapshot = new Map<string, PayrollHistoryRowSnapshot>();

    for (const row of this.payrollHistoryRows.getRawValue()) {
      snapshot.set(row.targetMonth, row);
    }

    this.payrollHistoryRows.clear({ emitEvent: false });

    const currentTotal = this.calculateCurrentTotalFixedWages();

    for (const month of months) {
      const rowSnapshot = snapshot.get(month);
      const group = this.createPayrollHistoryRowGroup(month, rowSnapshot);
      this.markHistoryRowFixedWagesManualIfCustomized(group, rowSnapshot, currentTotal);
      this.payrollHistoryRows.push(group);
      this.attachHistoryRowReactiveHandlers(group);
    }

    this.refreshCurrentTotalFixedWages();
  }

  private proposeGradesForHistoryRow(
    group: PayrollHistoryRowFormGroup,
    options: { force?: boolean } = {}
  ): void {
    const fixedWages = this.resolveHistoryRowProposalWages(group);

    if (fixedWages <= 0) {
      this.clearHistoryRowGrades(group);
      return;
    }

    this.patchHistoryRowGradesFromFixedWages(group, fixedWages, options);
  }

  private resolveHistoryRowProposalWages(group: PayrollHistoryRowFormGroup): number {
    const fixedWages = group.controls.fixedWages.value;
    if (fixedWages == null || !Number.isFinite(Number(fixedWages))) {
      return 0;
    }

    return Math.max(0, Number(fixedWages));
  }

  private clearHistoryRowGrades(group: PayrollHistoryRowFormGroup): void {
    this.historyRowHealthGradeManualOverride.delete(group);
    group.controls.healthGrade.setValue(null, { emitEvent: false });
    group.controls.healthGrade.markAsPristine();
    group.controls.pensionGrade.setValue(null, { emitEvent: false });
  }

  private syncRegistrationTypeCrossValidation(): void {
    const hireControl = this.form.controls.hireDate;
    const mismatch = resolveRegistrationTypeMismatchError(
      this.form.controls.registrationType.value,
      hireControl.value,
      this.systemStartDate()
    );

    const {
      [REGISTRATION_TYPE_MISMATCH_EXISTING_ERROR]: _existing,
      [REGISTRATION_TYPE_MISMATCH_NEW_ERROR]: _new,
      ...rest
    } = hireControl.errors ?? {};

    if (mismatch) {
      hireControl.setErrors({ ...rest, [mismatch]: true });
      return;
    }

    hireControl.setErrors(Object.keys(rest).length > 0 ? rest : null);
  }

  private refreshNewEmployeeGrades(): void {
    if (!this.isNewEmployee) {
      return;
    }

    const raw = this.form.getRawValue();
    const fixedTotal = calculateEmployeeFixedWages({
      baseSalary: raw.baseSalary ?? 0,
      allowances: raw.allowances.map((row) => ({
        name: row.name,
        amount: row.amount ?? null,
      })),
    });

    this.totalFixedWages.set(fixedTotal);

    const healthGrade = this.standardRemunerationService.resolveHealthGrade(fixedTotal);
    const pensionGrade = this.standardRemunerationService.resolvePensionGrade(fixedTotal);

    if (!healthGrade || !pensionGrade) {
      this.form.controls.healthGrade.setValue(null, { emitEvent: false });
      this.form.controls.pensionGrade.setValue(null, { emitEvent: false });
      this.form.controls.healthStandardRemuneration.setValue(null, { emitEvent: false });
      this.form.controls.pensionStandardRemuneration.setValue(null, { emitEvent: false });
      this.remunerationHint.set(
        fixedTotal > 0 ? '入力された総報酬月額に対応する等級が見つかりません' : ''
      );
      return;
    }

    this.form.controls.healthGrade.setValue(healthGrade.grade, { emitEvent: false });
    this.form.controls.pensionGrade.setValue(pensionGrade.grade, { emitEvent: false });
    this.form.controls.healthStandardRemuneration.setValue(healthGrade.monthlyAmount, {
      emitEvent: false,
    });
    this.form.controls.pensionStandardRemuneration.setValue(pensionGrade.monthlyAmount, {
      emitEvent: false,
    });
    this.remunerationHint.set('基本給＋手当の合計から適用等級を自動算出しました（変更可能）');
  }

  private updateConditionalValidators(type: EmployeeRegistrationType): void {
    this.applyRegistrationTypeValidators(type);

    if (type === 'existing') {
      if (this.allowanceRows.length === 0) {
        this.populateAllowancesFromCompany();
      }
      this.refreshCurrentTotalFixedWages();
      return;
    }

    this.payrollHistoryRows.clear({ emitEvent: false });
    if (this.allowanceRows.length === 0) {
      this.populateAllowancesFromCompany();
    }
    this.refreshNewEmployeeGrades();
  }

  private applyRegistrationTypeValidators(type: EmployeeRegistrationType): void {
    const baseSalary = this.form.controls.baseSalary;
    const healthGrade = this.form.controls.healthGrade;
    const pensionGrade = this.form.controls.pensionGrade;

    if (type === 'existing') {
      baseSalary.setValidators([Validators.required, Validators.min(0)]);
      healthGrade.clearValidators();
      pensionGrade.clearValidators();
      healthGrade.setValue(null, { emitEvent: false });
      pensionGrade.setValue(null, { emitEvent: false });
      this.form.controls.healthStandardRemuneration.setValue(null, { emitEvent: false });
      this.form.controls.pensionStandardRemuneration.setValue(null, { emitEvent: false });
      this.remunerationHint.set('');
    } else {
      baseSalary.setValidators([Validators.required, Validators.min(0)]);
      healthGrade.setValidators([Validators.required, Validators.min(1)]);
      pensionGrade.setValidators([Validators.required, Validators.min(1)]);
    }

    baseSalary.updateValueAndValidity({ emitEvent: false });
    healthGrade.updateValueAndValidity({ emitEvent: false });
    pensionGrade.updateValueAndValidity({ emitEvent: false });
    this.payrollHistoryRows.updateValueAndValidity({ emitEvent: false });
  }

  private async validateEmployeeNumberAvailability(value: string): Promise<void> {
    const control = this.form.controls.employeeNumber;
    const trimmed = value.trim();

    this.clearEmployeeNumberDuplicateError();

    if (!trimmed || !EMPLOYEE_NUMBER_PATTERN.test(trimmed)) {
      return;
    }

    const version = ++this.employeeNumberCheckVersion;
    this.checkingEmployeeNumber.set(true);

    try {
      const taken = await this.employeeService.isEmployeeNumberTaken(trimmed);
      if (version !== this.employeeNumberCheckVersion) {
        return;
      }

      if (taken) {
        this.setEmployeeNumberDuplicateError();
      }
    } catch {
      // ネットワークエラー等は送信時に再チェックする
    } finally {
      if (version === this.employeeNumberCheckVersion) {
        this.checkingEmployeeNumber.set(false);
      }
    }
  }

  private setEmployeeNumberDuplicateError(): void {
    const control = this.form.controls.employeeNumber;
    control.setErrors({
      ...(control.errors ?? {}),
      [EMPLOYEE_NUMBER_DUPLICATE_ERROR]: true,
    });
    control.markAsTouched();
  }

  private clearEmployeeNumberDuplicateError(): void {
    const control = this.form.controls.employeeNumber;
    if (!control.errors?.[EMPLOYEE_NUMBER_DUPLICATE_ERROR]) {
      return;
    }

    const { [EMPLOYEE_NUMBER_DUPLICATE_ERROR]: _duplicate, ...rest } = control.errors;
    control.setErrors(Object.keys(rest).length > 0 ? rest : null);
  }

  private isDuplicateEmployeeNumberMessage(message: string): boolean {
    return (
      message.includes('社員番号') &&
      (message.includes('既に') || message.includes('すでに'))
    );
  }
}
