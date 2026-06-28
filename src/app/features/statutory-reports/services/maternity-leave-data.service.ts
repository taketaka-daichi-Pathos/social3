import { Injectable } from '@angular/core';
import { Employee } from '@features/employees/models/employee.model';
import { MaternityLeaveData } from '@features/statutory-reports/models/egov-export.model';
import { buildMaternityLeaveDataForEmployees } from '@features/statutory-reports/utils/maternity-leave-data.utils';

@Injectable({ providedIn: 'root' })
export class MaternityLeaveDataService {
  buildMaternityLeaveDataForEmployees(employees: Employee[]): Map<string, MaternityLeaveData> {
    return buildMaternityLeaveDataForEmployees(employees);
  }
}
