import { Employee } from '@features/employees/models/employee.model';
import { Company, MaternityLeaveData } from '@features/statutory-reports/models/egov-export.model';
import { toJapaneseEraDateParts } from '@features/statutory-reports/utils/japanese-era.utils';

export const SANZEN_SANGO_FORM_CODE = '2227708';
export const SANZEN_SANGO_FIELD_COUNT = 33;

function padNumericCode(value: string, length: number): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return ''.padStart(length, '0');
  }

  return digits.padStart(length, '0').slice(-length);
}

function mapDateToEgovFields(date: Date | undefined): [string, string] {
  if (!date) {
    return ['', ''];
  }

  const parts = toJapaneseEraDateParts(date);
  return [parts.eraCode, parts.warekiYymmdd];
}

function setField(fields: string[], index: number, value: string): void {
  if (index >= 0 && index < fields.length) {
    fields[index] = value;
  }
}

function mapChangeAndEndBlock(fields: string[], maternityData: MaternityLeaveData): void {
  const [changedDeliveryEra, changedDeliveryYymmdd] = mapDateToEgovFields(
    maternityData.changedExpectedDeliveryDate
  );
  const [changedLeaveEndEra, changedLeaveEndYymmdd] = mapDateToEgovFields(
    maternityData.changedExpectedLeaveEndDate
  );
  const [leaveEndEra, leaveEndYymmdd] = mapDateToEgovFields(maternityData.leaveEndDate);

  setField(fields, 20, changedDeliveryEra);
  setField(fields, 21, changedDeliveryYymmdd);
  setField(fields, 22, changedLeaveEndEra);
  setField(fields, 23, changedLeaveEndYymmdd);
  setField(fields, 24, leaveEndEra);
  setField(fields, 25, leaveEndYymmdd);
}

/**
 * 産前産後休業取得者申出書／変更（終了）届（様式コード 2227708）のデータレコード 1 行を生成する。
 */
export function generateSanzenSangoData(
  employee: Employee,
  company: Company,
  maternityData: MaternityLeaveData
): string {
  const fields = new Array<string>(SANZEN_SANGO_FIELD_COUNT).fill('');
  const birthEra = employee.birthDate
    ? toJapaneseEraDateParts(employee.birthDate)
    : { eraCode: '', warekiYymmdd: '' };
  const [expectedDeliveryEra, expectedDeliveryYymmdd] = mapDateToEgovFields(
    maternityData.expectedDeliveryDate
  );
  const [leaveStartEra, leaveStartYymmdd] = mapDateToEgovFields(maternityData.leaveStartDate);
  const [expectedLeaveEndEra, expectedLeaveEndYymmdd] = mapDateToEgovFields(
    maternityData.expectedLeaveEndDate
  );
  const [actualDeliveryEra, actualDeliveryYymmdd] = mapDateToEgovFields(
    maternityData.actualDeliveryDate
  );

  setField(fields, 0, SANZEN_SANGO_FORM_CODE);
  setField(fields, 1, padNumericCode(company.prefectureCode, 2));
  setField(fields, 2, padNumericCode(company.districtCode, 2));
  setField(fields, 3, company.referenceMark.trim());
  setField(fields, 4, employee.insuredPersonNumber.trim());
  setField(
    fields,
    5,
    `${employee.lastNameKana.trim()} ${employee.firstNameKana.trim()}`.trim()
  );
  setField(
    fields,
    6,
    `${employee.lastName.trim()}\u3000${employee.firstName.trim()}`.trim()
  );
  setField(fields, 7, birthEra.eraCode);
  setField(fields, 8, birthEra.warekiYymmdd);
  setField(fields, 9, expectedDeliveryEra);
  setField(fields, 10, expectedDeliveryYymmdd);
  setField(fields, 11, maternityData.deliveryType === '2' ? '2' : '1');
  setField(fields, 12, leaveStartEra);
  setField(fields, 13, leaveStartYymmdd);
  setField(fields, 14, expectedLeaveEndEra);
  setField(fields, 15, expectedLeaveEndYymmdd);
  setField(fields, 16, actualDeliveryEra);
  setField(fields, 17, actualDeliveryYymmdd);
  setField(fields, 18, '');
  setField(fields, 19, '');

  if (maternityData.isChangeOrEnd) {
    mapChangeAndEndBlock(fields, maternityData);
  } else if (
    maternityData.changedExpectedDeliveryDate ||
    maternityData.changedExpectedLeaveEndDate ||
    maternityData.leaveEndDate
  ) {
    mapChangeAndEndBlock(fields, maternityData);
  }

  if (fields.length !== SANZEN_SANGO_FIELD_COUNT) {
    throw new Error(
      `産前産後休業届データレコードは${SANZEN_SANGO_FIELD_COUNT}項目必要です（現在: ${fields.length}）`
    );
  }

  return fields.join(',');
}
