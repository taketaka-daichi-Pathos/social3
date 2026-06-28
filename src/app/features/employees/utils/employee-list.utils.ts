import { Employee } from '../models/employee.model';
import { isAfterRetirementMonth, isRetiredEmployee } from './retirement.utils';

export interface EmployeeListGroups {
  preEmployment: Employee[];
  active: Employee[];
  retired: Employee[];
}

/** 社員番号順に並べ替えた従業員一覧（UI プルダウン等で共通利用） */
export function sortEmployeesByNumber(employees: Employee[]): Employee[] {
  return [...employees].sort((left, right) =>
    left.employeeNumber.localeCompare(right.employeeNumber, 'ja')
  );
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

/** 現在月基準で「退職済み」タブに表示する従業員か（退職月を過ぎた場合のみ） */
export function isEmployeeRetiredTab(employee: Employee, referenceDate = new Date()): boolean {
  if (isPreEmployment(employee, referenceDate)) {
    return false;
  }

  if (!isRetiredEmployee(employee)) {
    return false;
  }

  return isAfterRetirementMonth(employee, getCurrentYearMonthKey(referenceDate));
}

export function groupEmployees(employees: Employee[], referenceDate = new Date()): EmployeeListGroups {
  const preEmployment: Employee[] = [];
  const active: Employee[] = [];
  const retired: Employee[] = [];

  for (const employee of employees) {
    if (isPreEmployment(employee, referenceDate)) {
      preEmployment.push(employee);
    } else if (isEmployeeRetiredTab(employee, referenceDate)) {
      retired.push(employee);
    } else {
      active.push(employee);
    }
  }

  const sortByNumber = (a: Employee, b: Employee) =>
    a.employeeNumber.localeCompare(b.employeeNumber);

  return {
    preEmployment: preEmployment.sort(sortByNumber),
    active: active.sort(sortByNumber),
    retired: retired.sort(sortByNumber),
  };
}
