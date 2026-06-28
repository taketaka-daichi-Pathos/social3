import { inject, Injectable } from '@angular/core';
import { CompensationService } from '@core/services/compensation.service';
import { Employee } from '@features/employees/models/employee.model';
import { PayrollEntry } from '@features/payroll/models/compensation.model';
import { GeppenData } from '@features/statutory-reports/models/egov-export.model';
import {
  buildGeppenDataFromPayroll,
  buildPayrollLookupByEmployeeId,
  resolveGeppenPayrollYearMonths,
} from '@features/statutory-reports/utils/geppen-data.utils';

@Injectable({ providedIn: 'root' })
export class GeppenDataService {
  private readonly compensationService = inject(CompensationService);

  async buildGeppenDataForEmployee(
    employee: Employee,
    revisionYearMonth: string
  ): Promise<GeppenData> {
    const map = await this.buildGeppenDataForEmployees([employee], revisionYearMonth);
    const geppenData = map.get(employee.id);
    if (!geppenData) {
      throw new Error('月額変更届データの組み立てに失敗しました');
    }

    return geppenData;
  }

  async buildGeppenDataForEmployees(
    employees: Employee[],
    revisionYearMonth: string
  ): Promise<Map<string, GeppenData>> {
    const payrollYearMonths = resolveGeppenPayrollYearMonths(revisionYearMonth);
    const changeYearMonth = payrollYearMonths[0];
    const monthsToLoad = [...new Set([...payrollYearMonths, changeYearMonth])];
    const payrollRecords = await this.compensationService.getPayrollRecordsForMonths(monthsToLoad);
    const payrollLookup = buildPayrollLookupByEmployeeId(payrollRecords);

    const result = new Map<string, GeppenData>();

    for (const employee of employees) {
      const payrollByMonth = new Map<string, PayrollEntry | undefined>();
      for (const yearMonth of monthsToLoad) {
        payrollByMonth.set(yearMonth, payrollLookup.get(yearMonth)?.get(employee.id));
      }

      result.set(
        employee.id,
        buildGeppenDataFromPayroll(employee, revisionYearMonth, payrollByMonth)
      );
    }

    return result;
  }
}
