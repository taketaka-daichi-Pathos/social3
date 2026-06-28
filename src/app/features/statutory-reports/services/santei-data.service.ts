import { inject, Injectable } from '@angular/core';
import { CompensationService } from '@core/services/compensation.service';
import { Employee } from '@features/employees/models/employee.model';
import { PayrollEntry } from '@features/payroll/models/compensation.model';
import { getAnnualDeterminationMonths } from '@features/payroll/utils/compensation.utils';
import { SanteiData } from '@features/statutory-reports/models/egov-export.model';
import {
  buildPayrollLookupByEmployeeId,
  buildSanteiDataFromPayroll,
} from '@features/statutory-reports/utils/santei-data.utils';

@Injectable({ providedIn: 'root' })
export class SanteiDataService {
  private readonly compensationService = inject(CompensationService);

  /**
   * 1名分の4〜6月給与実績を取得し SanteiData を組み立てる。
   */
  async buildSanteiDataForEmployee(employee: Employee, targetYear: number): Promise<SanteiData> {
    const map = await this.buildSanteiDataForEmployees([employee], targetYear);
    const santeiData = map.get(employee.id);
    if (!santeiData) {
      throw new Error('算定基礎データの組み立てに失敗しました');
    }

    return santeiData;
  }

  /**
   * 複数従業員分の SanteiData を一括取得する（給与レコードは月単位で1回だけ読み込む）。
   */
  async buildSanteiDataForEmployees(
    employees: Employee[],
    targetYear: number
  ): Promise<Map<string, SanteiData>> {
    const yearMonths = getAnnualDeterminationMonths(targetYear);
    const payrollRecords = await this.compensationService.getPayrollRecordsForMonths(yearMonths);
    const payrollLookup = buildPayrollLookupByEmployeeId(payrollRecords);

    const result = new Map<string, SanteiData>();

    for (const employee of employees) {
      const payrollByMonth = new Map<string, PayrollEntry | undefined>();
      for (const yearMonth of yearMonths) {
        payrollByMonth.set(yearMonth, payrollLookup.get(yearMonth)?.get(employee.id));
      }

      result.set(employee.id, buildSanteiDataFromPayroll(employee, targetYear, payrollByMonth));
    }

    return result;
  }
}
