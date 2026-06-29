import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DependentDocumentUploadService } from '@core/services/dependent-document-upload.service';
import { EmployeeSession } from '@core/services/employee-session.service';
import { WorkflowRequestService } from '@core/services/workflow-request.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { EmployeeApplicationDialogShellComponent } from '@features/employee-portal/components/employee-application-dialog-shell/employee-application-dialog-shell.component';
import {
  DEPENDENT_OCCUPATION_OPTIONS,
  DEPENDENT_RELATIONSHIP_OPTIONS,
  DEPENDENT_SITUATION_OPTIONS,
  Dependent,
} from '@features/dependents/models/dependent.model';
import { resolveRequiredDependentDocuments } from '@features/dependents/utils/dependent-required-documents.utils';
import {
  applyDependentDateConflictErrors,
  DEPENDENT_DATE_CONFLICT_MESSAGE,
} from '@features/dependents/validators/dependent-date.validators';
import { KANA_PATTERN } from '@features/onboarding/validators/employee-registration.validators';
import { ToastService } from '@shared/services/toast.service';
import { merge } from 'rxjs';

type DependentFormGroup = FormGroup<{
  lastName: FormControl<string>;
  firstName: FormControl<string>;
  lastNameKana: FormControl<string>;
  firstNameKana: FormControl<string>;
  birthDate: FormControl<string>;
  relationship: FormControl<Dependent['relationship'] | ''>;
  livingArrangement: FormControl<Dependent['livingArrangement'] | ''>;
  dependencyStartDate: FormControl<string>;
  hasDisability: FormControl<boolean>;
  occupation: FormControl<Dependent['occupation'] | ''>;
  currentSituation: FormControl<Dependent['currentSituation'] | ''>;
}>;

type DependentFormField = keyof DependentFormGroup['controls'];

@Component({
  selector: 'app-dependent-application-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, EmployeeApplicationDialogShellComponent],
  templateUrl: './dependent-application-dialog.component.html',
  styleUrl: './dependent-application-dialog.component.scss',
})
export class DependentApplicationDialogComponent {
  readonly open = input(false);
  readonly session = input.required<EmployeeSession>();

  readonly closed = output<void>();
  readonly submitted = output<void>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly requestService = inject(WorkflowRequestService);
  private readonly uploadService = inject(DependentDocumentUploadService);
  private readonly toast = inject(ToastService);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly requiredDocuments = signal<string[]>([]);
  readonly selectedFiles = signal<File[]>([]);

  readonly relationshipOptions = DEPENDENT_RELATIONSHIP_OPTIONS;
  readonly occupationOptions = DEPENDENT_OCCUPATION_OPTIONS;
  readonly situationOptions = DEPENDENT_SITUATION_OPTIONS;

  formSubmitAttempted = false;

  readonly dependentForm: DependentFormGroup = this.fb.group({
    lastName: this.fb.control('', Validators.required),
    firstName: this.fb.control('', Validators.required),
    lastNameKana: this.fb.control('', [Validators.required, Validators.pattern(KANA_PATTERN)]),
    firstNameKana: this.fb.control('', [Validators.required, Validators.pattern(KANA_PATTERN)]),
    birthDate: this.fb.control('', Validators.required),
    relationship: this.fb.control<Dependent['relationship'] | ''>('', Validators.required),
    livingArrangement: this.fb.control<Dependent['livingArrangement'] | ''>('', Validators.required),
    dependencyStartDate: this.fb.control('', Validators.required),
    hasDisability: this.fb.control(false, Validators.required),
    occupation: this.fb.control<Dependent['occupation'] | ''>('', Validators.required),
    currentSituation: this.fb.control<Dependent['currentSituation'] | ''>('', Validators.required),
  });

  constructor() {
    merge(this.dependentForm.valueChanges, this.dependentForm.statusChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncDateConflictErrors();
        this.updateRequiredDocuments();
      });

    effect(() => {
      if (!this.open()) {
        this.resetForm();
      } else {
        this.formError.set(null);
      }
    });

    this.syncDateConflictErrors();
    this.updateRequiredDocuments();
  }

  birthDateMax(): string {
    return this.dependentForm.controls.dependencyStartDate.value.trim();
  }

  dependencyStartDateMin(): string {
    return this.dependentForm.controls.birthDate.value.trim();
  }

  showError(field: DependentFormField): boolean {
    const control = this.dependentForm.controls[field];
    return Boolean(control.invalid && (control.touched || this.formSubmitAttempted));
  }

  errorMessage(field: DependentFormField): string {
    const control = this.dependentForm.controls[field];
    const errors = control.errors;

    if (!errors) {
      return '入力内容を確認してください';
    }

    if (errors['required']) {
      return '必須項目です';
    }

    if (errors['pattern']) {
      return 'カタカナで入力してください';
    }

    if (errors['dateConflict']) {
      return DEPENDENT_DATE_CONFLICT_MESSAGE;
    }

    return '入力内容を確認してください';
  }

  close(): void {
    this.closed.emit();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    this.selectedFiles.set(files);
  }

  selectedFileNames(): string {
    const files = this.selectedFiles();
    if (files.length === 0) {
      return '';
    }

    return files.map((file) => file.name).join('、');
  }

  async submit(): Promise<void> {
    this.formSubmitAttempted = true;
    this.dependentForm.markAllAsTouched();
    this.syncDateConflictErrors();

    if (this.dependentForm.invalid) {
      this.logFormValidationErrors();
      return;
    }

    if (this.selectedFiles().length === 0) {
      this.formError.set('証明書類の画像を1件以上アップロードしてください');
      return;
    }

    const currentSession = this.session();
    const raw = this.dependentForm.getRawValue();

    this.submitting.set(true);
    this.formError.set(null);

    try {
      const documentUrls = await this.uploadService.uploadDependentDocuments(
        currentSession.companyOwnerUid,
        currentSession.employee.id,
        this.selectedFiles()
      );

      await this.requestService.createRequest(currentSession.companyOwnerUid, {
        type: 'add_dependent',
        requesterId: currentSession.employee.id,
        targetEmployeeId: currentSession.employee.id,
        status: 'pending',
        payload: {
          lastName: raw.lastName.trim(),
          firstName: raw.firstName.trim(),
          lastNameKana: raw.lastNameKana.trim(),
          firstNameKana: raw.firstNameKana.trim(),
          birthDate: raw.birthDate,
          relationship: raw.relationship,
          livingArrangement: raw.livingArrangement,
          dependencyStartDate: raw.dependencyStartDate,
          hasDisability: raw.hasDisability,
          occupation: raw.occupation,
          currentSituation: raw.currentSituation,
          documentUrls,
        },
      });

      this.resetForm();
      this.toast.show('申請を送信しました。労務担当者の確認をお待ちください。');
      this.submitted.emit();
      this.closed.emit();
    } catch (error) {
      this.formError.set(toFirestoreErrorMessage(error, '申請の送信に失敗しました'));
    } finally {
      this.submitting.set(false);
    }
  }

  private resetForm(): void {
    this.formSubmitAttempted = false;
    this.dependentForm.reset({
      lastName: '',
      firstName: '',
      lastNameKana: '',
      firstNameKana: '',
      birthDate: '',
      relationship: '',
      livingArrangement: '',
      dependencyStartDate: '',
      hasDisability: false,
      occupation: '',
      currentSituation: '',
    });
    this.selectedFiles.set([]);
    this.formError.set(null);
    this.syncDateConflictErrors();
    this.updateRequiredDocuments();
  }

  private syncDateConflictErrors(): void {
    applyDependentDateConflictErrors(
      this.dependentForm.controls.birthDate,
      this.dependentForm.controls.dependencyStartDate
    );
  }

  private updateRequiredDocuments(): void {
    const raw = this.dependentForm.getRawValue();
    this.requiredDocuments.set(
      resolveRequiredDependentDocuments({
        birthDate: raw.birthDate,
        occupation: raw.occupation,
        currentSituation: raw.currentSituation,
        livingArrangement: raw.livingArrangement,
      })
    );
  }

  private logFormValidationErrors(): void {
    Object.keys(this.dependentForm.controls).forEach((key) => {
      const controlErrors = this.dependentForm.get(key)?.errors;
      if (controlErrors != null) {
        console.error('Form Error in [' + key + ']:', controlErrors);
      }
    });
  }
}
