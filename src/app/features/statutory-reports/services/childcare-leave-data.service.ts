import { Injectable } from '@angular/core';
import { Employee } from '@features/employees/models/employee.model';
import { ChildcareLeaveData } from '@features/statutory-reports/models/egov-export.model';
import { buildChildcareLeaveDataForEmployees } from '@features/statutory-reports/utils/childcare-leave-data.utils';

@Injectable({ providedIn: 'root' })
export class ChildcareLeaveDataService {
  buildChildcareLeaveDataForEmployees(employees: Employee[]): Map<string, ChildcareLeaveData> {
    return buildChildcareLeaveDataForEmployees(employees);
  }
}
