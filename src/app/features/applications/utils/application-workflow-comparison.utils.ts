import { Employee } from '@features/employees/models/employee.model';
import {
  displayBankAccountType,
  displayCommutePassAmount,
  displayMaskedAccountNumber,
  displayRegistrationPostalCode,
  displayRegistrationValue,
} from '@features/employee-portal/utils/employee-registration-display.utils';
import { WorkflowRequest } from '@features/workflow/models/workflow-request.model';
import {
  parseAddressChangeWorkflowPayload,
  parseBankAccountWorkflowPayload,
  parseBasicInfoWorkflowPayload,
  parseCommuteChangeWorkflowPayload,
} from '@features/workflow/utils/workflow-payload.utils';

export interface ApplicationComparisonRow {
  label: string;
  beforeValue: string;
  afterValue: string;
  changed: boolean;
}

export interface EmployeeApplicationFieldUpdates {
  postalCode?: string;
  address?: string;
  bankName?: string;
  bankBranchName?: string;
  bankAccountType?: string;
  bankAccountNumber?: string;
  commuteRoute?: string;
  commutePassAmount?: number | null;
}

function normalizeCompareValue(value: string): string {
  return value.trim();
}

function comparisonRow(label: string, before: string, after: string): ApplicationComparisonRow {
  const beforeValue = displayRegistrationValue(before);
  const afterValue = displayRegistrationValue(after);
  const changed =
    normalizeCompareValue(before) !== normalizeCompareValue(after) &&
    normalizeCompareValue(after) !== '';

  return { label, beforeValue, afterValue, changed };
}

function accountTypeRow(before: string | undefined, after: string): ApplicationComparisonRow {
  const beforeValue = displayBankAccountType(before);
  const afterValue = displayBankAccountType(after);
  const changed =
    normalizeCompareValue(before ?? '') !== normalizeCompareValue(after) &&
    normalizeCompareValue(after) !== '';

  return { label: '口座種別', beforeValue, afterValue, changed };
}

function accountNumberRow(before: string | undefined, after: string): ApplicationComparisonRow {
  const beforeValue = displayMaskedAccountNumber(before);
  const afterValue = displayMaskedAccountNumber(after);
  const changed =
    normalizeCompareValue(before ?? '').replace(/\D/g, '') !==
      normalizeCompareValue(after).replace(/\D/g, '') && normalizeCompareValue(after) !== '';

  return { label: '口座番号', beforeValue, afterValue, changed };
}

function commuteAmountRow(
  before: number | null | undefined,
  after: number | null
): ApplicationComparisonRow {
  const beforeValue = displayCommutePassAmount(before);
  const afterValue = displayCommutePassAmount(after);
  const changed = (before ?? null) !== after && after != null && !Number.isNaN(after);

  return { label: '定期代', beforeValue, afterValue, changed };
}

function postalCodeRow(before: string | undefined, after: string): ApplicationComparisonRow {
  const beforeValue = displayRegistrationPostalCode(before);
  const afterValue = displayRegistrationPostalCode(after);
  const changed =
    normalizeCompareValue(before ?? '').replace(/\D/g, '') !==
      normalizeCompareValue(after).replace(/\D/g, '') && normalizeCompareValue(after) !== '';

  return { label: '郵便番号', beforeValue, afterValue, changed };
}

export function buildApplicationComparisonRows(
  employee: Employee,
  request: WorkflowRequest
): ApplicationComparisonRow[] {
  switch (request.type) {
    case 'address_change': {
      const parsed = parseAddressChangeWorkflowPayload(request.payload);
      return [
        postalCodeRow(employee.postalCode, parsed.postalCode),
        comparisonRow('住所', employee.address ?? '', parsed.address),
      ];
    }
    case 'commute_change': {
      const parsed = parseCommuteChangeWorkflowPayload(request.payload);
      return [
        comparisonRow('通勤経路', employee.commuteRoute ?? '', parsed.commuteRoute),
        commuteAmountRow(employee.commutePassAmount, parsed.commutePassAmount),
      ];
    }
    case 'bank_account': {
      const parsed = parseBankAccountWorkflowPayload(request.payload);
      return [
        comparisonRow('金融機関名', employee.bankName ?? '', parsed.bankName),
        comparisonRow('支店名', employee.bankBranchName ?? '', parsed.bankBranchName),
        accountTypeRow(employee.bankAccountType, parsed.bankAccountType),
        accountNumberRow(employee.bankAccountNumber, parsed.bankAccountNumber),
      ];
    }
    case 'basic_info': {
      const parsed = parseBasicInfoWorkflowPayload(request.payload);
      return [
        comparisonRow('住所', employee.address ?? '', parsed.currentAddress),
        comparisonRow('金融機関名', employee.bankName ?? '', parsed.bankName),
        accountNumberRow(employee.bankAccountNumber, parsed.accountNumber),
      ];
    }
    default:
      return [];
  }
}

export function buildEmployeeMasterUpdatesFromApplication(
  request: WorkflowRequest
): EmployeeApplicationFieldUpdates {
  switch (request.type) {
    case 'address_change': {
      const parsed = parseAddressChangeWorkflowPayload(request.payload);
      return {
        postalCode: parsed.postalCode.replace(/\D/g, '').slice(0, 7),
        address: parsed.address,
      };
    }
    case 'commute_change': {
      const parsed = parseCommuteChangeWorkflowPayload(request.payload);
      return {
        commuteRoute: parsed.commuteRoute,
        commutePassAmount: parsed.commutePassAmount,
      };
    }
    case 'bank_account': {
      const parsed = parseBankAccountWorkflowPayload(request.payload);
      return {
        bankName: parsed.bankName,
        bankBranchName: parsed.bankBranchName,
        bankAccountType: parsed.bankAccountType,
        bankAccountNumber: parsed.bankAccountNumber.replace(/\D/g, ''),
      };
    }
    case 'basic_info': {
      const parsed = parseBasicInfoWorkflowPayload(request.payload);
      return {
        address: parsed.currentAddress,
        bankName: parsed.bankName,
        bankAccountNumber: parsed.accountNumber.replace(/\D/g, ''),
      };
    }
    default:
      return {};
  }
}
