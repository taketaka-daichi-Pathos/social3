/** e-Gov 和暦元号コード（1:明治, 3:大正, 5:昭和, 7:平成, 9:令和） */
export type JapaneseEraCode = '1' | '3' | '5' | '7' | '9';

export interface JapaneseEraDateParts {
  eraCode: JapaneseEraCode;
  /** 和暦 YYMMDD（6桁） */
  warekiYymmdd: string;
}

export interface JapaneseEraYearMonthParts {
  eraCode: JapaneseEraCode;
  /** 和暦年（2桁） */
  warekiYear: string;
  /** 月（2桁） */
  month: string;
}

const ERA_DEFINITIONS: ReadonlyArray<{
  code: JapaneseEraCode;
  start: Date;
}> = [
  { code: '9', start: new Date(2019, 4, 1) }, // 令和元年 2019-05-01
  { code: '7', start: new Date(1989, 0, 8) }, // 平成元年 1989-01-08
  { code: '5', start: new Date(1926, 11, 25) }, // 昭和元年 1926-12-25
  { code: '3', start: new Date(1912, 6, 30) }, // 大正元年 1912-07-30
  { code: '1', start: new Date(1868, 0, 25) }, // 明治元年 1868-01-25
];

function parseDateInput(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`日付を解析できません: ${value}`);
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function resolveEra(date: Date): { code: JapaneseEraCode; eraYear: number } {
  for (const era of ERA_DEFINITIONS) {
    if (date >= era.start) {
      const eraYear = date.getFullYear() - era.start.getFullYear() + 1;
      return { code: era.code, eraYear };
    }
  }

  throw new Error('対応する元号がありません');
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 西暦日付を e-Gov 仕様の元号コードと和暦年月日（YYMMDD）に変換する。
 */
export function toJapaneseEraDateParts(value: string | Date): JapaneseEraDateParts {
  const date = parseDateInput(value);
  const { code, eraYear } = resolveEra(date);

  return {
    eraCode: code,
    warekiYymmdd: `${pad2(eraYear)}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`,
  };
}

/**
 * 西暦年月（YYYY-MM または YYYY-MM-DD）を e-Gov 仕様の元号・和暦年・月に変換する。
 */
export function toJapaneseEraYearMonthParts(value: string | Date): JapaneseEraYearMonthParts {
  const date = parseDateInput(value);
  const { code, eraYear } = resolveEra(date);

  return {
    eraCode: code,
    warekiYear: pad2(eraYear),
    month: pad2(date.getMonth() + 1),
  };
}
