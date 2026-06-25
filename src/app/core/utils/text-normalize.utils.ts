/** 全角数字を半角にし、数字以外を除去する */
export function toHalfWidthDigits(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, '');
}

/** 数字列を YYYY-MM-DD 形式の入力文字列に整形する（最大8桁） */
export function formatIsoDateInput(value: string): string {
  const digits = toHalfWidthDigits(value).slice(0, 8);

  if (digits.length <= 4) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** YYYY-MM-DD 形式かつ実在する日付かを判定する */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}
