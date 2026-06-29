export function displayRegistrationValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '未登録';
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
