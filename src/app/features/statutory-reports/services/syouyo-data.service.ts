import { inject, Injectable } from '@angular/core';
import { CompensationService } from '@core/services/compensation.service';
import { Employee } from '@features/employees/models/employee.model';
import { findBonusEntryIndex } from '@features/payroll/utils/bonus-insurance.utils';
import {
  normalizeBonusPaymentDate,
  resolveTargetMonthFromPaymentDate,
} from '@features/payroll/utils/bonus-history.utils';
import { SyouyoData } from '@features/statutory-reports/models/egov-export.model';
import {
  buildSyouyoDataFromBonusEntry,
  buildSyouyoDataFromEmployeeBonusHistory,
} from '@features/statutory-reports/utils/syouyo-data.utils';

@Injectable({ providedIn: 'root' })
export class SyouyoDataService {
  private readonly compensationService = inject(CompensationService);

  async buildSyouyoDataForEmployees(
    employees: Employee[],
    paymentDate: string
  ): Promise<Map<string, SyouyoData>> {
    const normalizedPaymentDate = normalizeBonusPaymentDate(paymentDate);
    if (!normalizedPaymentDate) {
      throw new Error('賞与支払日を指定してください');
    }

    const bonusRecord = await this.loadBonusRecordForPaymentDate(normalizedPaymentDate);
    const result = new Map<string, SyouyoData>();

    for (const employee of employees) {
      const syouyoData = this.resolveSyouyoData(
        employee,
        normalizedPaymentDate,
        bonusRecord
      );

      if (!syouyoData) {
        throw new Error(
          `${employee.lastName}${employee.firstName} の ${normalizedPaymentDate} の賞与データがありません`
        );
      }

      result.set(employee.id, syouyoData);
    }

    return result;
  }

  private resolveSyouyoData(
    employee: Employee,
    paymentDate: string,
    bonusRecord: Awaited<ReturnType<CompensationService['getRecord']>>
  ): SyouyoData | null {
    const fromHistory = buildSyouyoDataFromEmployeeBonusHistory(employee, paymentDate);
    if (fromHistory) {
      return fromHistory;
    }

    if (!bonusRecord) {
      return null;
    }

    const index = findBonusEntryIndex(bonusRecord.entries, employee.id, paymentDate);
    const entry = index >= 0 ? bonusRecord.entries[index] : undefined;
    if (!entry) {
      return null;
    }

    const bonusAmount = Math.max(
      0,
      Math.round(Number(entry.bonusAmount ?? entry.nonFixedWages ?? 0))
    );

    return buildSyouyoDataFromBonusEntry({
      id: crypto.randomUUID(),
      paymentMonth: bonusRecord.targetMonth,
      paymentDate,
      fixedWagesAtPayment: Number(entry.fixedWagesAtPayment ?? entry.fixedWages ?? 0),
      bonusAmount,
      standardBonusAmount: bonusAmount,
      savedAt: entry.savedAt ?? new Date().toISOString(),
    });
  }

  private async loadBonusRecordForPaymentDate(paymentDate: string) {
    const targetMonth = resolveTargetMonthFromPaymentDate(paymentDate);
    if (!targetMonth) {
      return null;
    }

    return this.compensationService.getRecord('bonus', targetMonth);
  }
}
