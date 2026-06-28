import { Employee } from '@features/employees/models/employee.model';
import { ChildcareLeaveData, Company } from '@features/statutory-reports/models/egov-export.model';
import { toJapaneseEraDateParts } from '@features/statutory-reports/utils/japanese-era.utils';

export const IKUJI_KYUGYO_FORM_CODE = '2227709';
export const IKUJI_KYUGYO_FIELD_COUNT = 56;

function padNumericCode(value: string, length: number): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return ''.padStart(length, '0');
  }

  return digits.padStart(length, '0').slice(-length);
}

function normalizeMyNumber(value: string): string {
  return value.replace(/\D/g, '');
}

function splitBasicPensionNumber(value: string): { symbol: string; number: string } {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10) {
    return {
      symbol: digits.slice(0, 4),
      number: digits.slice(4, 10),
    };
  }

  return { symbol: '', number: '' };
}

function mapEmployeeMyNumberFields(employee: Employee): {
  myNumber: string;
  pensionSymbol: string;
  pensionNumber: string;
} {
  const myNumber = normalizeMyNumber(employee.myNumber);
  const hasMyNumber = myNumber.length === 12;
  const basicPension = hasMyNumber
    ? { symbol: '', number: '' }
    : splitBasicPensionNumber(employee.insuredPersonNumber);

  return {
    myNumber: hasMyNumber ? myNumber : '',
    pensionSymbol: hasMyNumber ? '' : basicPension.symbol,
    pensionNumber: hasMyNumber ? '' : basicPension.number,
  };
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

function mapChildBlock(
  fields: string[],
  blockStart: number,
  child: ChildcareLeaveData['children'][number] | undefined
): void {
  if (!child) {
    return;
  }

  const [birthEra, birthYymmdd] = mapDateToEgovFields(child.birthDate);
  setField(fields, blockStart, birthEra);
  setField(fields, blockStart + 1, birthYymmdd);
  setField(fields, blockStart + 2, child.nameKana.trim());
  setField(fields, blockStart + 3, child.nameKanji.trim());
}

function mapExtensionAndTerminationBlock(fields: string[], childcareData: ChildcareLeaveData): void {
  if (childcareData.isExtension) {
    setField(fields, 22, '1');
  }

  if (childcareData.isTermination) {
    setField(fields, 25, '1');
    const [actualEndEra, actualEndYymmdd] = mapDateToEgovFields(childcareData.actualEndDate);
    setField(fields, 23, actualEndEra);
    setField(fields, 24, actualEndYymmdd);
  }
}

/**
 * 育児休業等取得者申出書（新規・延長）／終了届（様式コード 2227709）のデータレコード 1 行を生成する。
 */
export function generateIkujiKyugyoData(
  employee: Employee,
  company: Company,
  childcareData: ChildcareLeaveData
): string {
  const fields = new Array<string>(IKUJI_KYUGYO_FIELD_COUNT).fill('');
  const myNumberFields = mapEmployeeMyNumberFields(employee);
  const [leaveStartEra, leaveStartYymmdd] = mapDateToEgovFields(childcareData.leaveStartDate);
  const [expectedEndEra, expectedEndYymmdd] = mapDateToEgovFields(
    childcareData.expectedLeaveEndDate
  );

  setField(fields, 0, IKUJI_KYUGYO_FORM_CODE);
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
  setField(fields, 7, myNumberFields.myNumber);
  setField(fields, 8, myNumberFields.pensionSymbol);
  setField(fields, 9, myNumberFields.pensionNumber);

  mapChildBlock(fields, 10, childcareData.children[0]);
  mapChildBlock(fields, 14, childcareData.children[1]);

  setField(fields, 18, leaveStartEra);
  setField(fields, 19, leaveStartYymmdd);
  setField(fields, 20, expectedEndEra);
  setField(fields, 21, expectedEndYymmdd);

  mapExtensionAndTerminationBlock(fields, childcareData);

  if (fields.length !== IKUJI_KYUGYO_FIELD_COUNT) {
    throw new Error(
      `育児休業届データレコードは${IKUJI_KYUGYO_FIELD_COUNT}項目必要です（現在: ${fields.length}）`
    );
  }

  return fields.join(',');
}
