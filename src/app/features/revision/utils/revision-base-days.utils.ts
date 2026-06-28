import { SocialInsuranceType } from '@features/onboarding/models/employee-registration.model';

/** 一般の被保険者（17日基準） */
export const REGULAR_MIN_PAYMENT_BASE_DAYS = 17;

/** 短時間就労者：通常基準（17日以上） */
export const SHORT_TIME_WORKER_STANDARD_MIN_PAYMENT_BASE_DAYS = 17;

/** 短時間就労者：15・16日特例の下限（15日以上17日未満） */
export const SHORT_TIME_WORKER_SPECIAL_MIN_PAYMENT_BASE_DAYS = 15;

/** 短時間労働者（特定適用拡大・11日基準） */
export const PART_TIME_SPECIAL_MIN_PAYMENT_BASE_DAYS = 11;

export function isPartTimeSpecialInsuranceType(
  socialInsuranceType: SocialInsuranceType | null | undefined
): boolean {
  return socialInsuranceType === 'part_time_special';
}

export function getMinPaymentBaseDays(
  socialInsuranceType: SocialInsuranceType | null | undefined
): number {
  if (isPartTimeSpecialInsuranceType(socialInsuranceType)) {
    return PART_TIME_SPECIAL_MIN_PAYMENT_BASE_DAYS;
  }

  return REGULAR_MIN_PAYMENT_BASE_DAYS;
}

export function meetsMinPaymentBaseDays(
  baseDays: number,
  socialInsuranceType: SocialInsuranceType | null | undefined
): boolean {
  return baseDays >= getMinPaymentBaseDays(socialInsuranceType);
}
