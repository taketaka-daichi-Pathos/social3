import { Dependent, DependentOccupation, DependentRelationship } from '@features/dependents/models/dependent.model';
import { Employee } from '@features/employees/models/employee.model';
import { Company } from '@features/statutory-reports/models/egov-export.model';
import { splitDependentsForFuyouIdou } from '@features/statutory-reports/utils/fuyou-idou-data.utils';
import { toJapaneseEraDateParts } from '@features/statutory-reports/utils/japanese-era.utils';

export const FUYOU_IDOU_FORM_CODE = '2222701';
export const FUYOU_IDOU_FIELD_COUNT = 139;

/** 被扶養者（異動）届 CSV フィールドのブロック開始位置 */
export const FUYOU_IDOU_BLOCK_OFFSET = {
  FORM: 0,
  PREFECTURE: 1,
  DISTRICT: 2,
  OFFICE_REFERENCE: 3,
  INSURED_PERSON_NUMBER: 4,
  EMPLOYEE_NAME_KANA: 8,
  EMPLOYEE_NAME_KANJI: 9,
  EMPLOYEE_BIRTH_ERA: 10,
  EMPLOYEE_BIRTH_YYMMDD: 11,
  EMPLOYEE_GENDER: 12,
  EMPLOYEE_MYNUMBER: 13,
  EMPLOYEE_PENSION_SYMBOL: 14,
  EMPLOYEE_PENSION_NUMBER: 15,
  EMPLOYEE_INCOME: 16,
  EMPLOYEE_POSTAL: 17,
  EMPLOYEE_ADDRESS: 18,
  SPOUSE_START: 20,
  SPOUSE_SIZE: 37,
  OTHER1_START: 57,
  OTHER2_START: 84,
  OTHER3_START: 111,
  OTHER_SIZE: 27,
  TRAILER: 138,
} as const;

/** 配偶者（第3号）ブロック内の相対オフセット */
const SPOUSE_FIELD = {
  NAME_KANA: 0,
  NAME_KANJI: 1,
  BIRTH_ERA: 2,
  BIRTH_YYMMDD: 3,
  GENDER: 4,
  MYNUMBER: 5,
  PENSION_SYMBOL: 6,
  PENSION_NUMBER: 7,
  LIVING: 8,
  CHANGE_ERA: 9,
  CHANGE_YYMMDD: 10,
  CHANGE_REASON: 11,
  DISABILITY: 12,
  OCCUPATION: 13,
} as const;

/** その他被扶養者ブロック内の相対オフセット */
const OTHER_DEPENDENT_FIELD = {
  NAME_KANA: 0,
  NAME_KANJI: 1,
  BIRTH_ERA: 2,
  BIRTH_YYMMDD: 3,
  GENDER: 4,
  RELATIONSHIP: 5,
  MYNUMBER: 6,
  LIVING: 7,
  CHANGE_ERA: 8,
  CHANGE_YYMMDD: 9,
  CHANGE_REASON: 10,
  DISABILITY: 11,
  OCCUPATION: 12,
} as const;

function padNumericCode(value: string, length: number): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return ''.padStart(length, '0');
  }

  return digits.padStart(length, '0').slice(-length);
}

function stripPostalCodeHyphen(postalCode: string | undefined): string {
  return (postalCode ?? '').replace(/\D/g, '').slice(0, 7);
}

function normalizeMyNumber(value: string | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function splitBasicPensionNumber(value: string | undefined): { symbol: string; number: string } {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return {
      symbol: digits.slice(0, 4),
      number: digits.slice(4, 10),
    };
  }

  return { symbol: '', number: '' };
}

function mapPersonMyNumberFields(myNumber: string | undefined, basicPensionNumber: string | undefined): {
  myNumber: string;
  pensionSymbol: string;
  pensionNumber: string;
} {
  const normalizedMyNumber = normalizeMyNumber(myNumber);
  const hasMyNumber = normalizedMyNumber.length === 12;
  const basicPension = hasMyNumber
    ? { symbol: '', number: '' }
    : splitBasicPensionNumber(basicPensionNumber);

  return {
    myNumber: hasMyNumber ? normalizedMyNumber : '',
    pensionSymbol: hasMyNumber ? '' : basicPension.symbol,
    pensionNumber: hasMyNumber ? '' : basicPension.number,
  };
}

function mapEmployeeGenderCode(gender: Employee['gender']): string {
  if (gender === 'male') {
    return '1';
  }

  if (gender === 'female') {
    return '2';
  }

  return '';
}

function mapDependentGenderCode(gender: Dependent['gender'] | undefined): string {
  if (gender === 'male') {
    return '1';
  }

  if (gender === 'female') {
    return '2';
  }

  return '';
}

function mapLivingArrangementCode(livingArrangement: Dependent['livingArrangement']): string {
  return livingArrangement === 'separate' ? '2' : '1';
}

function mapRelationshipCode(relationship: DependentRelationship): string {
  switch (relationship) {
    case 'spouse':
      return '1';
    case 'child':
      return '2';
    case 'parent':
      return '3';
    case 'grandparent':
      return '4';
    case 'sibling':
      return '5';
    default:
      return '9';
  }
}

function mapOccupationCode(occupation: DependentOccupation): string {
  switch (occupation) {
    case 'student':
      return '1';
    case 'part_time':
      return '2';
    case 'employee':
      return '3';
    case 'self_employed':
      return '4';
    case 'unemployed':
      return '5';
    default:
      return '9';
  }
}

function resolveChangeDate(dependent: Dependent): string {
  return dependent.changeDate?.trim() || dependent.dependencyStartDate?.trim() || '';
}

function dependentNameKana(dependent: Dependent): string {
  return `${dependent.lastNameKana.trim()} ${dependent.firstNameKana.trim()}`.trim();
}

function dependentNameKanji(dependent: Dependent): string {
  return `${dependent.lastName.trim()}\u3000${dependent.firstName.trim()}`.trim();
}

function setField(fields: string[], index: number, value: string): void {
  if (index < 0 || index >= fields.length) {
    return;
  }

  fields[index] = value;
}

function mapSpouseBlock(fields: string[], blockStart: number, dependent: Dependent): void {
  const birthEra = dependent.birthDate
    ? toJapaneseEraDateParts(dependent.birthDate)
    : { eraCode: '', warekiYymmdd: '' };
  const changeDate = resolveChangeDate(dependent);
  const changeEra = changeDate
    ? toJapaneseEraDateParts(changeDate)
    : { eraCode: '', warekiYymmdd: '' };
  const myNumberFields = mapPersonMyNumberFields(dependent.myNumber, dependent.basicPensionNumber);

  setField(fields, blockStart + SPOUSE_FIELD.NAME_KANA, dependentNameKana(dependent));
  setField(fields, blockStart + SPOUSE_FIELD.NAME_KANJI, dependentNameKanji(dependent));
  setField(fields, blockStart + SPOUSE_FIELD.BIRTH_ERA, birthEra.eraCode);
  setField(fields, blockStart + SPOUSE_FIELD.BIRTH_YYMMDD, birthEra.warekiYymmdd);
  setField(fields, blockStart + SPOUSE_FIELD.GENDER, mapDependentGenderCode(dependent.gender));
  setField(fields, blockStart + SPOUSE_FIELD.MYNUMBER, myNumberFields.myNumber);
  setField(fields, blockStart + SPOUSE_FIELD.PENSION_SYMBOL, myNumberFields.pensionSymbol);
  setField(fields, blockStart + SPOUSE_FIELD.PENSION_NUMBER, myNumberFields.pensionNumber);
  setField(fields, blockStart + SPOUSE_FIELD.LIVING, mapLivingArrangementCode(dependent.livingArrangement));
  setField(fields, blockStart + SPOUSE_FIELD.CHANGE_ERA, changeEra.eraCode);
  setField(fields, blockStart + SPOUSE_FIELD.CHANGE_YYMMDD, changeEra.warekiYymmdd);
  setField(fields, blockStart + SPOUSE_FIELD.CHANGE_REASON, dependent.changeReason?.trim() ?? '1');
  setField(fields, blockStart + SPOUSE_FIELD.DISABILITY, dependent.hasDisability ? '1' : '0');
  setField(fields, blockStart + SPOUSE_FIELD.OCCUPATION, mapOccupationCode(dependent.occupation));
}

function mapOtherDependentBlock(fields: string[], blockStart: number, dependent: Dependent): void {
  const birthEra = dependent.birthDate
    ? toJapaneseEraDateParts(dependent.birthDate)
    : { eraCode: '', warekiYymmdd: '' };
  const changeDate = resolveChangeDate(dependent);
  const changeEra = changeDate
    ? toJapaneseEraDateParts(changeDate)
    : { eraCode: '', warekiYymmdd: '' };
  const myNumberFields = mapPersonMyNumberFields(dependent.myNumber, dependent.basicPensionNumber);

  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.NAME_KANA, dependentNameKana(dependent));
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.NAME_KANJI, dependentNameKanji(dependent));
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.BIRTH_ERA, birthEra.eraCode);
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.BIRTH_YYMMDD, birthEra.warekiYymmdd);
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.GENDER, mapDependentGenderCode(dependent.gender));
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.RELATIONSHIP, mapRelationshipCode(dependent.relationship));
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.MYNUMBER, myNumberFields.myNumber);
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.LIVING, mapLivingArrangementCode(dependent.livingArrangement));
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.CHANGE_ERA, changeEra.eraCode);
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.CHANGE_YYMMDD, changeEra.warekiYymmdd);
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.CHANGE_REASON, dependent.changeReason?.trim() ?? '1');
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.DISABILITY, dependent.hasDisability ? '1' : '0');
  setField(fields, blockStart + OTHER_DEPENDENT_FIELD.OCCUPATION, mapOccupationCode(dependent.occupation));
}

function mapEmployeeBlock(fields: string[], employee: Employee, company: Company): void {
  const birthEra = employee.birthDate
    ? toJapaneseEraDateParts(employee.birthDate)
    : { eraCode: '', warekiYymmdd: '' };
  const myNumberFields = mapPersonMyNumberFields(employee.myNumber, '');

  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.FORM, FUYOU_IDOU_FORM_CODE);
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.PREFECTURE, padNumericCode(company.prefectureCode, 2));
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.DISTRICT, padNumericCode(company.districtCode, 2));
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.OFFICE_REFERENCE, company.referenceMark.trim());
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.INSURED_PERSON_NUMBER, employee.insuredPersonNumber.trim());
  setField(
    fields,
    FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_NAME_KANA,
    `${employee.lastNameKana.trim()} ${employee.firstNameKana.trim()}`.trim()
  );
  setField(
    fields,
    FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_NAME_KANJI,
    `${employee.lastName.trim()}\u3000${employee.firstName.trim()}`.trim()
  );
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_BIRTH_ERA, birthEra.eraCode);
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_BIRTH_YYMMDD, birthEra.warekiYymmdd);
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_GENDER, mapEmployeeGenderCode(employee.gender));
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_MYNUMBER, myNumberFields.myNumber);
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_PENSION_SYMBOL, myNumberFields.pensionSymbol);
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_PENSION_NUMBER, myNumberFields.pensionNumber);
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_POSTAL, '');
  setField(fields, FUYOU_IDOU_BLOCK_OFFSET.EMPLOYEE_ADDRESS, '');
}

/**
 * 被扶養者（異動）届（様式コード 2222701）のデータレコード 1 行を生成する。
 */
export function generateFuyouIdouData(
  employee: Employee,
  company: Company,
  dependents: Dependent[]
): string {
  const fields = new Array<string>(FUYOU_IDOU_FIELD_COUNT).fill('');
  const { spouse, others } = splitDependentsForFuyouIdou(dependents);

  mapEmployeeBlock(fields, employee, company);

  if (spouse) {
    mapSpouseBlock(fields, FUYOU_IDOU_BLOCK_OFFSET.SPOUSE_START, spouse);
  }

  const otherStarts = [
    FUYOU_IDOU_BLOCK_OFFSET.OTHER1_START,
    FUYOU_IDOU_BLOCK_OFFSET.OTHER2_START,
    FUYOU_IDOU_BLOCK_OFFSET.OTHER3_START,
  ];

  others.forEach((dependent, index) => {
    mapOtherDependentBlock(fields, otherStarts[index], dependent);
  });

  if (fields.length !== FUYOU_IDOU_FIELD_COUNT) {
    throw new Error(
      `被扶養者異動届データレコードは${FUYOU_IDOU_FIELD_COUNT}項目必要です（現在: ${fields.length}）`
    );
  }

  return fields.join(',');
}
