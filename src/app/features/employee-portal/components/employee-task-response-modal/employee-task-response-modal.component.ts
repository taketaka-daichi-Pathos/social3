import { Component, effect, inject, input, output, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
} from '@angular/forms';
import {
  EmployeeTask,
  EmployeeTaskFieldValues,
} from '@features/employee-portal/models/employee-task.model';
import { DEPENDENT_RELATIONSHIP_OPTIONS } from '@features/dependents/models/dependent.model';
import {
  EMPLOYEE_TASK_FIELD_LABELS,
  getEmployeeTaskDescription,
  getEmployeeTaskTitle,
} from '@features/employee-portal/utils/employee-task.utils';

@Component({
  selector: 'app-employee-task-response-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './employee-task-response-modal.component.html',
  styleUrl: './employee-task-response-modal.component.scss',
})
export class EmployeeTaskResponseModalComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = input(false);
  readonly task = input<EmployeeTask | null>(null);
  readonly submitting = input(false);
  readonly errorMessage = input<string | null>(null);

  readonly submitted = output<EmployeeTaskFieldValues>();
  readonly closed = output<void>();

  readonly validationError = signal('');

  readonly relationshipOptions = DEPENDENT_RELATIONSHIP_OPTIONS;

  readonly form = this.fb.group({
    myNumber: this.fb.control(''),
    hireDate: this.fb.control(''),
    birthDate: this.fb.control(''),
    retirementDate: this.fb.control(''),
    insuranceCardReturned: this.fb.control<'yes' | 'no' | ''>(''),
    postRetirementAddress: this.fb.control(''),
    postRetirementEmail: this.fb.control(''),
    insuranceCardReturnCommitment: this.fb.control(false),
    postalCode: this.fb.control(''),
    address: this.fb.control(''),
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
    dependentDependencyStartDate: this.fb.control(''),
    dependentDocumentSubmission: this.fb.control(false),
  });

  constructor() {
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
          postalCode: '',
          address: '',
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
          dependentDependencyStartDate: '',
          dependentDocumentSubmission: false,
        });
        this.validationError.set('');
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

  isBasicInfoTask(): boolean {
    return this.task()?.taskType === 'BASIC_INFO_REQUEST';
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
    return this.isBasicInfoTask() ||
      this.isMaternityLeaveInfoTask() ||
      this.isChildcareLeaveInfoTask() ||
      this.isDependentInfoTask() ||
      this.isRetirementProcedureTask()
      ? '保存'
      : '回答を送信';
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  onSubmit(): void {
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

    if (this.includesField('postalCode')) {
      const postalCode = this.form.controls.postalCode.value.replace(/\D/g, '');
      if (postalCode.length !== 7) {
        errors.push('郵便番号は7桁で入力してください');
      } else {
        values.postalCode = postalCode;
      }
    }

    if (this.includesField('address')) {
      const address = this.form.controls.address.value.trim();
      if (!address) {
        errors.push('住所を入力してください');
      } else {
        values.address = address;
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

    if (this.includesField('dependentDependencyStartDate')) {
      const dependencyStartDate = this.form.controls.dependentDependencyStartDate.value.trim();
      if (!dependencyStartDate) {
        errors.push('扶養開始日を入力してください');
      } else {
        values.dependentDependencyStartDate = dependencyStartDate;
      }
    }

    if (this.includesField('dependentDocumentSubmission')) {
      if (!this.form.controls.dependentDocumentSubmission.value) {
        errors.push('証明書類の提出確認にチェックを入れてください');
      } else {
        values.dependentDocumentSubmission = true;
      }
    }

    if (errors.length > 0) {
      this.validationError.set(errors.join(' '));
      return;
    }

    this.validationError.set('');
    this.submitted.emit(values);
  }
}
