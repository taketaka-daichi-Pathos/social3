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
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StandardRemunerationService } from '@core/services/standard-remuneration.service';
import { HalfWidthDigitsOnlyDirective } from '@shared/directives/half-width-digits-only.directive';
import { IsoDateInputComponent } from '@shared/components/iso-date-input/iso-date-input.component';
import { isoDateValidator } from '@shared/validators/iso-date.validators';
import { MyNumberInputComponent } from '@shared/components/my-number-input/my-number-input.component';
import {
  EmployeeGender,
  EmployeeRegistrationField,
  EmployeeRegistrationFormData,
  EmployeeRegistrationType,
} from '../../models/employee-registration.model';
import {
  BIRTH_AFTER_HIRE_ERROR,
  EMPLOYEE_NUMBER_PATTERN,
  employeeDateRulesValidator,
  KANA_PATTERN,
  MY_NUMBER_PATTERN,
  UNDER_MINIMUM_HIRE_AGE_ERROR,
} from '../../validators/employee-registration.validators';

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

  private static readonly INITIAL_FORM_VALUE = {
    employeeNumber: '',
    registrationType: 'new' as EmployeeRegistrationType,
    lastName: '',
    firstName: '',
    lastNameKana: '',
    firstNameKana: '',
    birthDate: '',
    gender: 'male' as EmployeeGender,
    hireDate: '',
    myNumber: '',
    hasDependents: false,
    insuredPersonNumber: '',
    baseSalary: null as number | null,
    healthStandardRemuneration: null as number | null,
    pensionStandardRemuneration: null as number | null,
    applicableStartMonth: '',
  };

  readonly open = input(false);
  readonly closed = output<void>();
  readonly registered = output<EmployeeRegistrationFormData>();

  readonly healthGrades = this.standardRemunerationService.healthGrades;
  readonly pensionGrades = this.standardRemunerationService.pensionGrades;
  readonly remunerationHint = signal('');

  readonly form = this.fb.group(
    {
      employeeNumber: this.fb.control('', [
        Validators.required,
        Validators.pattern(EMPLOYEE_NUMBER_PATTERN),
      ]),
      registrationType: this.fb.control<EmployeeRegistrationType>('new', Validators.required),
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
      healthStandardRemuneration: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.min(1),
      ]),
      pensionStandardRemuneration: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.min(1),
      ]),
      applicableStartMonth: this.fb.control(''),
    },
    { validators: employeeDateRulesValidator() }
  );

  submitted = false;

  private readonly resetOnOpen = effect(() => {
    if (this.open()) {
      this.resetForm();
    }
  });

  ngOnInit(): void {
    this.updateConditionalValidators(this.form.controls.registrationType.value);

    this.form.controls.registrationType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => this.updateConditionalValidators(type));

    this.form.controls.baseSalary.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((baseSalary) => {
        if (this.form.controls.registrationType.value === 'new') {
          this.applyStandardRemuneration(baseSalary);
        }
      });

    this.form.controls.birthDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.form.updateValueAndValidity({ emitEvent: false }));

    this.form.controls.hireDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.form.updateValueAndValidity({ emitEvent: false }));
  }

  get isExistingEmployee(): boolean {
    return this.form.controls.registrationType.value === 'existing';
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('employee-modal')) {
      this.close();
    }
  }

  close(): void {
    this.resetForm();
    this.closed.emit();
  }

  onSubmit(): void {
    this.submitted = true;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const data: EmployeeRegistrationFormData = {
      ...raw,
      baseSalary: raw.baseSalary ?? 0,
      healthStandardRemuneration: raw.healthStandardRemuneration ?? 0,
      pensionStandardRemuneration: raw.pensionStandardRemuneration ?? 0,
      applicableStartMonth:
        raw.registrationType === 'existing' ? raw.applicableStartMonth : '',
    };

    this.registered.emit(data);
  }

  showError(field: EmployeeRegistrationField): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  errorMessage(field: EmployeeRegistrationField): string {
    const control = this.form.controls[field];

    if (control.errors?.['required']) {
      return '必須項目です';
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

    return '入力内容を確認してください';
  }

  private resetForm(): void {
    this.submitted = false;
    this.remunerationHint.set('');
    this.form.reset(EmployeeRegistrationModalComponent.INITIAL_FORM_VALUE);
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.updateConditionalValidators('new');
  }

  private applyStandardRemuneration(baseSalary: number | null): void {
    const healthControl = this.form.controls.healthStandardRemuneration;
    const pensionControl = this.form.controls.pensionStandardRemuneration;
    const healthGrade = this.standardRemunerationService.resolveHealthGrade(baseSalary);
    const pensionGrade = this.standardRemunerationService.resolvePensionGrade(baseSalary);

    if (!healthGrade || !pensionGrade) {
      healthControl.setValue(null, { emitEvent: false });
      pensionControl.setValue(null, { emitEvent: false });
      this.remunerationHint.set(
        baseSalary != null && baseSalary > 0
          ? '入力された基本給に対応する等級が見つかりません'
          : ''
      );
      healthControl.updateValueAndValidity({ emitEvent: false });
      pensionControl.updateValueAndValidity({ emitEvent: false });
      return;
    }

    healthControl.setValue(healthGrade.monthlyAmount, { emitEvent: false });
    pensionControl.setValue(pensionGrade.monthlyAmount, { emitEvent: false });
    this.remunerationHint.set('基本給から健康保険・厚生年金の標準報酬月額を自動選択しました');
    healthControl.updateValueAndValidity({ emitEvent: false });
    pensionControl.updateValueAndValidity({ emitEvent: false });
  }

  private updateConditionalValidators(type: EmployeeRegistrationType): void {
    const applicableStart = this.form.controls.applicableStartMonth;

    if (type === 'existing') {
      applicableStart.setValidators([Validators.required]);
      this.remunerationHint.set('');
    } else {
      applicableStart.clearValidators();
      applicableStart.setValue('');
      this.applyStandardRemuneration(this.form.controls.baseSalary.value);
    }

    applicableStart.updateValueAndValidity();
  }
}
