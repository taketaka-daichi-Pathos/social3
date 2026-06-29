export function displayRegistrationValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '未登録';
}

export function displayRegistrationPostalCode(value: string | null | undefined): string {
  const digits = value?.replace(/\D/g, '') ?? '';
  if (!digits) {
    return '未登録';
  }

  if (digits.length === 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return digits;
}

export function displayRegistrationDate(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '未登録';
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[1]}/${isoMatch[2]}/${isoMatch[3]}`;
  }

  return trimmed;
}

export function displayMaskedAccountNumber(value: string | null | undefined): string {
  const digits = value?.replace(/\D/g, '') ?? '';
  if (!digits) {
    return '未登録';
  }

  if (digits.length <= 4) {
    return `****${digits}`;
  }

  return `****${digits.slice(-4)}`;
}

export function displayBankAccountType(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '未登録';
  }

  switch (trimmed) {
    case 'ordinary':
      return '普通';
    case 'checking':
      return '当座';
    case 'savings':
      return '貯蓄';
    default:
      return trimmed;
  }
}

export function displayCommutePassAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '未登録';
  }

  return `${value.toLocaleString('ja-JP')}円`;
}
