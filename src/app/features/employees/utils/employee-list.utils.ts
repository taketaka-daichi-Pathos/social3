import { Employee } from '../models/employee.model';

export interface EmployeeListGroups {
  preEmployment: Employee[];
  active: Employee[];
  retired: Employee[];
}

/** YYYY-MM-DD または Date から YYYY-MM キーを生成する */
export function toYearMonthKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getCurrentYearMonthKey(referenceDate = new Date()): string {
  return toYearMonthKey(referenceDate);
}

/** 入社年月が現在年月より未来か（年月単位で比較） */
export function isPreEmployment(employee: Employee, referenceDate = new Date()): boolean {
  const hireMonth = toYearMonthKey(employee.hireDate);
  const currentMonth = getCurrentYearMonthKey(referenceDate);
  return hireMonth > currentMonth;
}

export function groupEmployees(employees: Employee[], referenceDate = new Date()): EmployeeListGroups {
  const preEmployment: Employee[] = [];
  const active: Employee[] = [];

  for (const employee of employees) {
    if (isPreEmployment(employee, referenceDate)) {
      preEmployment.push(employee);
    } else {
      active.push(employee);
    }
  }

  const sortByNumber = (a: Employee, b: Employee) =>
    a.employeeNumber.localeCompare(b.employeeNumber);

  return {
    preEmployment: preEmployment.sort(sortByNumber),
    active: active.sort(sortByNumber),
    /** 退職月の判定は後日実装。現時点では常に空 */
    retired: [],
  };
}
