import { Employee } from '@features/employees/models/employee.model';
import { LeaveType } from '@features/employees/models/leave-record.model';
import {
  CreateWorkflowRequestInput,
  WorkflowRequestType,
} from '@features/workflow/models/workflow-request.model';

export const WORKFLOW_MATERNITY_GENDER_MISMATCH_ERROR =
  '男性従業員は産前産後休業（産休）を申請できません';

function resolveEmployee(
  employees: Employee[],
  employeeId: string
): Employee | undefined {
  return employees.find((employee) => employee.id === employeeId);
}

function parseLeaveKind(payload: Record<string, unknown> | undefined): LeaveType | null {
  const value = payload?.['leaveKind'];
  return value === 'maternity' || value === 'childcare' ? value : null;
}

/** 申請作成時のビジネスルール検証（性別×休業種別など） */
export function validateWorkflowRequestCreate(
  employees: Employee[],
  input: CreateWorkflowRequestInput
): void {
  const employee = resolveEmployee(employees, input.targetEmployeeId.trim());
  if (!employee) {
    return;
  }

  const leaveTypes: WorkflowRequestType[] = ['maternity_leave', 'childcare_leave'];
  if (!leaveTypes.includes(input.type)) {
    return;
  }

  const payloadLeaveKind = parseLeaveKind(input.payload);
  const isMaternityRequest =
    input.type === 'maternity_leave' || payloadLeaveKind === 'maternity';

  if (isMaternityRequest && employee.gender === 'male') {
    throw new Error(WORKFLOW_MATERNITY_GENDER_MISMATCH_ERROR);
  }
}
