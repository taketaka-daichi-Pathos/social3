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
import {
  DEPENDENT_OCCUPATION_OPTIONS,
  DEPENDENT_RELATIONSHIP_OPTIONS,
  DEPENDENT_SITUATION_OPTIONS,
  Dependent,
  DependentFormField,
} from '@features/dependents/models/dependent.model';
import { resolveRequiredDependentDocuments } from '@features/dependents/utils/dependent-required-documents.utils';
import { KANA_PATTERN } from '@features/onboarding/validators/employee-registration.validators';
import { IsoDateInputComponent } from '@shared/components/iso-date-input/iso-date-input.component';
import { isoDateValidator } from '@shared/validators/iso-date.validators';
import { merge } from 'rxjs';

@Component({
  selector: 'app-add-dependent-modal',
  standalone: true,
  imports: [ReactiveFormsModule, IsoDateInputComponent],
  templateUrl: './add-dependent-modal.component.html',
  styleUrl: './add-dependent-modal.component.scss',
})
export class AddDependentModalComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  private static readonly INITIAL_VALUE = {
    lastName: '',
    firstName: '',
    lastNameKana: '',
    firstNameKana: '',
    romanName: '',
    birthDate: '',
    relationship: '' as Dependent['relationship'] | '',
    livingArrangement: '' as Dependent['livingArrangement'] | '',
    dependencyStartDate: '',
    hasDisability: false,
    occupation: '' as Dependent['occupation'] | '',
    currentSituation: '' as Dependent['currentSituation'] | '',
    documentsVerified: false,
  };

  readonly open = input(false);
  readonly saving = input(false);
  readonly draftDependent = input<Dependent | null>(null);
  readonly showSubmissionRequest = input(false);
  readonly submissionRequestPending = input(false);
  readonly submissionRequestSending = input(false);
  readonly submissionRequestDisabled = input(false);
  readonly closed = output<void>();
  readonly saved = output<Dependent>();
  readonly submissionRequested = output<void>();

  readonly occupationOptions = DEPENDENT_OCCUPATION_OPTIONS;
  readonly situationOptions = DEPENDENT_SITUATION_OPTIONS;
  readonly relationshipOptions = DEPENDENT_RELATIONSHIP_OPTIONS;

  readonly requiredDocuments = signal<string[]>([]);
  readonly selectedFiles = signal<File[]>([]);

  submitted = false;

  readonly form = this.fb.group({
    lastName: this.fb.control('', Validators.required),
    firstName: this.fb.control('', Validators.required),
    lastNameKana: this.fb.control('', [Validators.required, Validators.pattern(KANA_PATTERN)]),
    firstNameKana: this.fb.control('', [Validators.required, Validators.pattern(KANA_PATTERN)]),
    romanName: this.fb.control(''),
    birthDate: this.fb.control('', [Validators.required, isoDateValidator()]),
    relationship: this.fb.control<Dependent['relationship'] | ''>('', Validators.required),
    livingArrangement: this.fb.control<Dependent['livingArrangement'] | ''>('', Validators.required),
    dependencyStartDate: this.fb.control('', [Validators.required, isoDateValidator()]),
    hasDisability: this.fb.control(false, Validators.required),
    occupation: this.fb.control<Dependent['occupation'] | ''>('', Validators.required),
    currentSituation: this.fb.control<Dependent['currentSituation'] | ''>('', Validators.required),
    documentsVerified: this.fb.control(false, Validators.requiredTrue),
  });

  private readonly resetOnOpen = effect(() => {
    if (this.open()) {
      this.resetForm(this.draftDependent());
    }
  });

  ngOnInit(): void {
    merge(this.form.valueChanges, this.form.statusChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateRequiredDocuments());

    this.updateRequiredDocuments();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dependent-modal')) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  isSubmitDisabled(): boolean {
    return this.saving() || this.form.invalid;
  }

  showDocumentsVerifiedError(): boolean {
    const control = this.form.controls.documentsVerified;
    return control.invalid && (control.touched || this.submitted);
  }

  onSubmit(): void {
    this.submitted = true;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    this.saved.emit({
      lastName: raw.lastName.trim(),
      firstName: raw.firstName.trim(),
      lastNameKana: raw.lastNameKana.trim(),
      firstNameKana: raw.firstNameKana.trim(),
      romanName: raw.romanName.trim(),
      birthDate: raw.birthDate,
      relationship: raw.relationship as Dependent['relationship'],
      livingArrangement: raw.livingArrangement as Dependent['livingArrangement'],
      dependencyStartDate: raw.dependencyStartDate,
      hasDisability: raw.hasDisability,
      occupation: raw.occupation as Dependent['occupation'],
      currentSituation: raw.currentSituation as Dependent['currentSituation'],
    });
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

  showError(field: DependentFormField): boolean {
    const control = this.form.get(field);
    return Boolean(control && control.invalid && (control.touched || this.submitted));
  }

  errorMessage(field: DependentFormField): string {
    const control = this.form.get(field);
    if (!control?.errors) {
      return '入力内容を確認してください';
    }

    if (control.errors['required']) {
      return '必須項目です';
    }

    if (control.errors['pattern']) {
      return 'カタカナで入力してください';
    }

    if (control.errors['isoDate']) {
      return 'YYYY-MM-DD 形式で入力してください';
    }

    return '入力内容を確認してください';
  }

  private updateRequiredDocuments(): void {
    const raw = this.form.getRawValue();
    this.requiredDocuments.set(
      resolveRequiredDependentDocuments({
        birthDate: raw.birthDate,
        occupation: raw.occupation,
        currentSituation: raw.currentSituation,
        livingArrangement: raw.livingArrangement,
      })
    );
  }

  private resetForm(draft: Dependent | null = null): void {
    this.submitted = false;
    this.selectedFiles.set([]);
    this.form.reset(AddDependentModalComponent.INITIAL_VALUE);

    if (draft) {
      this.form.patchValue({
        lastName: draft.lastName,
        firstName: draft.firstName,
        lastNameKana: draft.lastNameKana,
        firstNameKana: draft.firstNameKana,
        romanName: draft.romanName ?? '',
        birthDate: draft.birthDate,
        relationship: draft.relationship,
        livingArrangement: draft.livingArrangement,
        dependencyStartDate: draft.dependencyStartDate,
        hasDisability: draft.hasDisability,
        occupation: draft.occupation,
        currentSituation: draft.currentSituation,
      });
    }

    this.updateRequiredDocuments();
  }
}
