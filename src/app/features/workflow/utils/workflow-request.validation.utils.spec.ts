import { Employee } from '@features/employees/models/employee.model';
import {
  validateWorkflowRequestCreate,
  WORKFLOW_MATERNITY_GENDER_MISMATCH_ERROR,
} from './workflow-request.validation.utils';

function createEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    gender: 'female',
    ...overrides,
  } as Employee;
}

describe('validateWorkflowRequestCreate', () => {
  it('rejects maternity leave requests from male employees', () => {
    const employees = [createEmployee({ id: 'emp-1', gender: 'male' })];

    expect(() =>
      validateWorkflowRequestCreate(employees, {
        type: 'maternity_leave',
        requesterId: 'emp-1',
        targetEmployeeId: 'emp-1',
        payload: { leaveKind: 'maternity' },
      })
    ).toThrow(WORKFLOW_MATERNITY_GENDER_MISMATCH_ERROR);
  });

  it('allows childcare leave requests from male employees', () => {
    const employees = [createEmployee({ id: 'emp-1', gender: 'male' })];

    expect(() =>
      validateWorkflowRequestCreate(employees, {
        type: 'childcare_leave',
        requesterId: 'emp-1',
        targetEmployeeId: 'emp-1',
        payload: { leaveKind: 'childcare' },
      })
    ).not.toThrow();
  });

  it('allows maternity leave requests from female employees', () => {
    const employees = [createEmployee({ id: 'emp-1', gender: 'female' })];

    expect(() =>
      validateWorkflowRequestCreate(employees, {
        type: 'maternity_leave',
        requesterId: 'emp-1',
        targetEmployeeId: 'emp-1',
        payload: { leaveKind: 'maternity' },
      })
    ).not.toThrow();
  });
});
