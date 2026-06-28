import { Employee } from '@features/employees/models/employee.model';
import { sortEmployeesByNumber } from '@features/employees/utils/employee-list.utils';

function createEmployee(employeeNumber: string, id: string): Employee {
  return {
    id,
    employeeNumber,
  } as Employee;
}

describe('employee-list.utils', () => {
  it('sortEmployeesByNumber は社員番号順に並べ替える', () => {
    const sorted = sortEmployeesByNumber([
      createEmployee('010', 'b'),
      createEmployee('002', 'a'),
      createEmployee('100', 'c'),
    ]);

    expect(sorted.map((employee) => employee.employeeNumber)).toEqual(['002', '010', '100']);
  });
});
