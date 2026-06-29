import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
} from '@angular/forms';
import { DependentDocumentUploadService } from '@core/services/dependent-document-upload.service';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import {
  EmployeeTask,
  EmployeeTaskFieldValues,
} from '@features/employee-portal/models/employee-task.model';
import {
  DEPENDENT_OCCUPATION_OPTIONS,
  DEPENDENT_RELATIONSHIP_OPTIONS,
  DEPENDENT_SITUATION_OPTIONS,
  DependentCurrentSituation,
  DependentLivingArrangement,
  DependentOccupation,
} from '@features/dependents/models/dependent.model';
import { resolveRequiredDependentDocuments } from '@features/dependents/utils/dependent-required-documents.utils';
import {
  EMPLOYEE_TASK_FIELD_LABELS,
  getEmployeeTaskDescription,
  getEmployeeTaskTitle,
} from '@features/employee-portal/utils/employee-task.utils';
import { merge } from 'rxjs';

@Component({
  selector: 'app-employee-task-response-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './employee-task-response-modal.component.html',
  styleUrl: './employee-task-response-modal.component.scss',
})
export class EmployeeTaskResponseModalComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uploadService = inject(DependentDocumentUploadService);

  readonly open = input(false);
  readonly task = input<EmployeeTask | null>(null);
  readonly companyOwnerUid = input('');
  readonly employeeId = input('');
  readonly submitting = input(false);
  readonly errorMessage = input<string | null>(null);

  readonly submitted = output<EmployeeTaskFieldValues>();
  readonly closed = output<void>();

  readonly validationError = signal('');
  readonly uploading = signal(false);
  readonly requiredDocuments = signal<string[]>([]);
  readonly selectedFiles = signal<File[]>([]);

  readonly relationshipOptions = DEPENDENT_RELATIONSHIP_OPTIONS;
  readonly occupationOptions = DEPENDENT_OCCUPATION_OPTIONS;
  readonly situationOptions = DEPENDENT_SITUATION_OPTIONS;

  readonly form = this.fb.group({
    myNumber: this.fb.control(''),
    hireDate: this.fb.control(''),
    birthDate: this.fb.control(''),
    retirementDate: this.fb.control(''),
    insuranceCardReturned: this.fb.control<'yes' | 'no' | ''>(''),
    postRetirementAddress: this.fb.control(''),
    postRetirementEmail: this.fb.control(''),
    insuranceCardReturnCommitment: this.fb.control(false),
    expectedDeliveryDate: this.fb.control(''),
    deliveryType: this.fb.control<'1' | '2' | ''>(''),
    childcareChild1NameKana: this.fb.control(''),
    childcareChild1NameKanji: this.fb.control(''),
    childcareChild1BirthDate: this.fb.control(''),
    dependentLastName: this.fb.control(''),
    dependentFirstName: this.fb.control(''),
    dependentLastNameKana: this.fb.control(''),
    dependentFirstNameKana: this.fb.control(''),
    dependentBirthDate: this.fb.control(''),
    dependentRelationship: this.fb.control(''),
    dependentLivingArrangement: this.fb.control(''),
    dependentDependencyStartDate: this.fb.control(''),
    dependentHasDisability: this.fb.control(false),
    dependentOccupation: this.fb.control(''),
    dependentCurrentSituation: this.fb.control(''),
  });

  constructor() {
    merge(this.form.valueChanges, this.form.statusChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isDependentInfoTask()) {
          this.updateRequiredDocuments();
        }
      });

    effect(() => {
      if (!this.open()) {
        this.form.reset({
          myNumber: '',
          hireDate: '',
          birthDate: '',
          retirementDate: '',
          insuranceCardReturned: '',
          postRetirementAddress: '',
          postRetirementEmail: '',
          insuranceCardReturnCommitment: false,
          expectedDeliveryDate: '',
          deliveryType: '',
          childcareChild1NameKana: '',
          childcareChild1NameKanji: '',
          childcareChild1BirthDate: '',
          dependentLastName: '',
          dependentFirstName: '',
          dependentLastNameKana: '',
          dependentFirstNameKana: '',
          dependentBirthDate: '',
          dependentRelationship: '',
          dependentLivingArrangement: '',
          dependentDependencyStartDate: '',
          dependentHasDisability: false,
          dependentOccupation: '',
          dependentCurrentSituation: '',
        });
        this.validationError.set('');
        this.selectedFiles.set([]);
        this.requiredDocuments.set([]);
      }
    });
  }

  taskTitle(task: EmployeeTask): string {
    return getEmployeeTaskTitle(task.taskType);
  }

  taskDescription(task: EmployeeTask): string {
    return getEmployeeTaskDescription(task.taskType);
  }

  fieldLabel(field: EmployeeTask['requestedFields'][number]): string {
    return EMPLOYEE_TASK_FIELD_LABELS[field];
  }

  includesField(field: EmployeeTask['requestedFields'][number]): boolean {
    return this.task()?.requestedFields.includes(field) ?? false;
  }

  isMaternityLeaveInfoTask(): boolean {
    return this.task()?.taskType === 'MATERNITY_LEAVE_INFO_REQUEST';
  }

  isChildcareLeaveInfoTask(): boolean {
    return this.task()?.taskType === 'CHILDCARE_LEAVE_INFO_REQUEST';
  }

  isDependentInfoTask(): boolean {
    return this.task()?.taskType === 'DEPENDENT_INFO_REQUEST';
  }

  isRetirementProcedureTask(): boolean {
    const task = this.task();
    if (!task || task.taskType !== 'RETIREMENT_INFO') {
      return false;
    }

    return (
      task.requestedFields.includes('postRetirementAddress') ||
      task.requestedFields.includes('postRetirementEmail') ||
      task.requestedFields.includes('insuranceCardReturnCommitment')
    );
  }

  submitButtonLabel(): string {
    return this.isMaternityLeaveInfoTask() ||
      this.isChildcareLeaveInfoTask() ||
      this.isDependentInfoTask() ||
      this.isRetirementProcedureTask()
      ? '保存'
      : '回答を送信';
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

  isBusy(): boolean {
    return this.submitting() || this.uploading();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  async onSubmit(): Promise<void> {
    const task = this.task();
    if (!task) {
      return;
    }

    const values: EmployeeTaskFieldValues = {};
    const errors: string[] = [];

    if (this.includesField('myNumber')) {
      const myNumber = this.form.controls.myNumber.value.replace(/\D/g, '');
      if (myNumber.length !== 12) {
        errors.push('マイナンバーは12桁で入力してください');
      } else {
        values.myNumber = myNumber;
      }
    }

    if (this.includesField('hireDate')) {
      const hireDate = this.form.controls.hireDate.value.trim();
      if (!hireDate) {
        errors.push('入社日を入力してください');
      } else {
        values.hireDate = hireDate;
      }
    }

    if (this.includesField('birthDate')) {
      const birthDate = this.form.controls.birthDate.value.trim();
      if (!birthDate) {
        errors.push('生年月日を入力してください');
      } else {
        values.birthDate = birthDate;
      }
    }

    if (this.includesField('retirementDate')) {
      const retirementDate = this.form.controls.retirementDate.value.trim();
      if (!retirementDate) {
        errors.push('退職日を入力してください');
      } else {
        values.retirementDate = retirementDate;
      }
    }

    if (this.includesField('insuranceCardReturned')) {
      const answer = this.form.controls.insuranceCardReturned.value;
      if (!answer) {
        errors.push('健康保険被保険者証の返却状況を選択してください');
      } else {
        values.insuranceCardReturned = answer === 'yes';
      }
    }

    if (this.includesField('postRetirementAddress')) {
      const postRetirementAddress = this.form.controls.postRetirementAddress.value.trim();
      if (!postRetirementAddress) {
        errors.push('退職後の住所を入力してください');
      } else {
        values.postRetirementAddress = postRetirementAddress;
      }
    }

    if (this.includesField('postRetirementEmail')) {
      const postRetirementEmail = this.form.controls.postRetirementEmail.value.trim();
      if (!postRetirementEmail) {
        errors.push('退職後のメールアドレスを入力してください');
      } else {
        values.postRetirementEmail = postRetirementEmail;
      }
    }

    if (this.includesField('insuranceCardReturnCommitment')) {
      if (!this.form.controls.insuranceCardReturnCommitment.value) {
        errors.push('健康保険被保険者証の返却確認にチェックを入れてください');
      } else {
        values.insuranceCardReturnCommitment = true;
      }
    }

    if (this.includesField('expectedDeliveryDate')) {
      const expectedDeliveryDate = this.form.controls.expectedDeliveryDate.value.trim();
      if (!expectedDeliveryDate) {
        errors.push('出産予定日を入力してください');
      } else {
        values.expectedDeliveryDate = expectedDeliveryDate;
      }
    }

    if (this.includesField('deliveryType')) {
      const deliveryType = this.form.controls.deliveryType.value;
      if (deliveryType !== '1' && deliveryType !== '2') {
        errors.push('出産種別を選択してください');
      } else {
        values.deliveryType = deliveryType;
      }
    }

    if (this.includesField('childcareChild1NameKana')) {
      const nameKana = this.form.controls.childcareChild1NameKana.value.trim();
      if (!nameKana) {
        errors.push('養育する子（1人目）の氏名カナを入力してください');
      } else {
        values.childcareChild1NameKana = nameKana;
      }
    }

    if (this.includesField('childcareChild1NameKanji')) {
      const nameKanji = this.form.controls.childcareChild1NameKanji.value.trim();
      if (!nameKanji) {
        errors.push('養育する子（1人目）の氏名漢字を入力してください');
      } else {
        values.childcareChild1NameKanji = nameKanji;
      }
    }

    if (this.includesField('childcareChild1BirthDate')) {
      const birthDate = this.form.controls.childcareChild1BirthDate.value.trim();
      if (!birthDate) {
        errors.push('養育する子（1人目）の生年月日を入力してください');
      } else {
        values.childcareChild1BirthDate = birthDate;
      }
    }

    if (this.includesField('dependentLastName')) {
      const lastName = this.form.controls.dependentLastName.value.trim();
      if (!lastName) {
        errors.push('扶養家族の姓を入力してください');
      } else {
        values.dependentLastName = lastName;
      }
    }

    if (this.includesField('dependentFirstName')) {
      const firstName = this.form.controls.dependentFirstName.value.trim();
      if (!firstName) {
        errors.push('扶養家族の名を入力してください');
      } else {
        values.dependentFirstName = firstName;
      }
    }

    if (this.includesField('dependentLastNameKana')) {
      const lastNameKana = this.form.controls.dependentLastNameKana.value.trim();
      if (!lastNameKana) {
        errors.push('扶養家族の姓（カナ）を入力してください');
      } else {
        values.dependentLastNameKana = lastNameKana;
      }
    }

    if (this.includesField('dependentFirstNameKana')) {
      const firstNameKana = this.form.controls.dependentFirstNameKana.value.trim();
      if (!firstNameKana) {
        errors.push('扶養家族の名（カナ）を入力してください');
      } else {
        values.dependentFirstNameKana = firstNameKana;
      }
    }

    if (this.includesField('dependentBirthDate')) {
      const birthDate = this.form.controls.dependentBirthDate.value.trim();
      if (!birthDate) {
        errors.push('扶養家族の生年月日を入力してください');
      } else {
        values.dependentBirthDate = birthDate;
      }
    }

    if (this.includesField('dependentRelationship')) {
      const relationship = this.form.controls.dependentRelationship.value.trim();
      if (!relationship) {
        errors.push('続柄を選択してください');
      } else {
        values.dependentRelationship = relationship;
      }
    }

    if (this.includesField('dependentLivingArrangement')) {
      const livingArrangement = this.form.controls.dependentLivingArrangement.value.trim();
      if (!livingArrangement) {
        errors.push('同居・別居を選択してください');
      } else {
        values.dependentLivingArrangement = livingArrangement;
      }
    }

    if (this.includesField('dependentDependencyStartDate')) {
      const dependencyStartDate = this.form.controls.dependentDependencyStartDate.value.trim();
      if (!dependencyStartDate) {
        errors.push('扶養開始日を入力してください');
      } else {
        values.dependentDependencyStartDate = dependencyStartDate;
      }
    }

    if (this.includesField('dependentHasDisability')) {
      values.dependentHasDisability = this.form.controls.dependentHasDisability.value;
    }

    if (this.includesField('dependentOccupation')) {
      const occupation = this.form.controls.dependentOccupation.value.trim();
      if (!occupation) {
        errors.push('職業を選択してください');
      } else {
        values.dependentOccupation = occupation;
      }
    }

    if (this.includesField('dependentCurrentSituation')) {
      const currentSituation = this.form.controls.dependentCurrentSituation.value.trim();
      if (!currentSituation) {
        errors.push('現在の状況を選択してください');
      } else {
        values.dependentCurrentSituation = currentSituation;
      }
    }

    if (this.includesField('dependentDocumentUpload')) {
      if (this.selectedFiles().length === 0) {
        errors.push('証明書類の画像を1件以上アップロードしてください');
      }
    }

    if (errors.length > 0) {
      this.validationError.set(errors.join(' '));
      return;
    }

    if (this.includesField('dependentDocumentUpload')) {
      const companyOwnerUid = this.companyOwnerUid();
      const employeeId = this.employeeId();
      if (!companyOwnerUid || !employeeId) {
        this.validationError.set('アップロードに必要な情報が不足しています');
        return;
      }

      this.uploading.set(true);
      try {
        values.dependentDocumentUrls = await this.uploadService.uploadDependentDocuments(
          companyOwnerUid,
          employeeId,
          this.selectedFiles()
        );
      } catch (error) {
        this.validationError.set(
          toFirestoreErrorMessage(error, '証明書類のアップロードに失敗しました')
        );
        return;
      } finally {
        this.uploading.set(false);
      }
    }

    this.validationError.set('');
    this.submitted.emit(values);
  }

  private updateRequiredDocuments(): void {
    this.requiredDocuments.set(
      resolveRequiredDependentDocuments({
        birthDate: this.form.controls.dependentBirthDate.value,
        occupation: this.form.controls.dependentOccupation.value as DependentOccupation | '',
        currentSituation: this.form.controls.dependentCurrentSituation.value as
          | DependentCurrentSituation
          | '',
        livingArrangement: this.form.controls.dependentLivingArrangement.value as
          | DependentLivingArrangement
          | '',
      })
    );
  }
}
