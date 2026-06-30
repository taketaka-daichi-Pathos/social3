import {
  isManualInsuranceRateApplicableMonthAllowed,
  isPostStatutoryConfiguredRatePeriod,
  isSystemSeedInsuranceRateApplicableMonth,
  isWithinStatutoryMasterManualEntryForbiddenPeriod,
  resolveInitialInsuranceRateApplicableMonth,
  STATUTORY_MASTER_MANUAL_ENTRY_FORBIDDEN_FROM,
  STATUTORY_MASTER_MANUAL_ENTRY_FORBIDDEN_TO,
} from './statutory-insurance-rate-period.utils';

describe('statutory-insurance-rate-period.utils', () => {
  it('defines forbidden period as 2022-04 through 2027-03', () => {
    expect(STATUTORY_MASTER_MANUAL_ENTRY_FORBIDDEN_FROM).toBe('2022-04');
    expect(STATUTORY_MASTER_MANUAL_ENTRY_FORBIDDEN_TO).toBe('2027-03');
  });

  it('treats months before 2022-04 as allowed for manual entry', () => {
    expect(isWithinStatutoryMasterManualEntryForbiddenPeriod('2022-03')).toBe(false);
    expect(isManualInsuranceRateApplicableMonthAllowed('2022-03')).toBe(true);
  });

  it('treats months within statutory master retention as forbidden', () => {
    expect(isWithinStatutoryMasterManualEntryForbiddenPeriod('2022-04')).toBe(true);
    expect(isWithinStatutoryMasterManualEntryForbiddenPeriod('2026-04')).toBe(true);
    expect(isWithinStatutoryMasterManualEntryForbiddenPeriod('2027-03')).toBe(true);
  });

  it('treats months from 2027-04 onward as allowed for manual entry', () => {
    expect(isWithinStatutoryMasterManualEntryForbiddenPeriod('2027-04')).toBe(false);
    expect(isManualInsuranceRateApplicableMonthAllowed('2027-04')).toBe(true);
  });

  it('treats months from 2027-04 onward as post-statutory configured rate period', () => {
    expect(isPostStatutoryConfiguredRatePeriod('2027-03')).toBe(false);
    expect(isPostStatutoryConfiguredRatePeriod('2027-04')).toBe(true);
    expect(isPostStatutoryConfiguredRatePeriod('2028-01')).toBe(true);
  });

  it('normalizes systemStartDate to YYYY-MM for initial history', () => {
    expect(resolveInitialInsuranceRateApplicableMonth('2026/04', '2026-06')).toBe('2026-04');
    expect(resolveInitialInsuranceRateApplicableMonth('2026-04-01', '2026-06')).toBe('2026-04');
  });

  it('detects system seed month from systemStartDate', () => {
    expect(isSystemSeedInsuranceRateApplicableMonth('2026-04', '2026/04')).toBe(true);
    expect(isSystemSeedInsuranceRateApplicableMonth('2026-05', '2026-04')).toBe(false);
  });
});
