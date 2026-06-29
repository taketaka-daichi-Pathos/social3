import { Employee } from '@features/employees/models/employee.model';
import { RevisionHistoryEntry } from '@features/revision/models/revision-history.model';
import {
  hasGetsugakuHenkoReportBadge,
  hasSanteiKisoReportBadge,
} from './statutory-report-revision-badge.utils';

function employeeWithRevisionHistory(
  revisionHistory: RevisionHistoryEntry[]
): Employee {
  return {
    id: 'emp-1',
    companyOwnerUid: 'company-1',
    authUid: null,
    loginEmail: null,
    email: null,
    resignationDate: null,
    status: 'active',
    employeeNumber: '001',
    lastName: '山田',
    firstName: '太郎',
    revisionHistory,
  } as Employee;
}

describe('statutory-report-revision-badge.utils', () => {
  it('shows santei badge only when annual revision is applied for target year', () => {
    const applied = employeeWithRevisionHistory([
      {
        id: '1',
        applicableMonth: '2026-09',
        type: '算定基礎',
        targetYear: 2026,
        beforeHealthGrade: 10,
        beforeHealthAmount: 100000,
        beforePensionGrade: 10,
        beforePensionAmount: 100000,
        afterHealthGrade: 12,
        afterHealthAmount: 120000,
        afterPensionGrade: 12,
        afterPensionAmount: 120000,
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);

    expect(hasSanteiKisoReportBadge([applied], 2026)).toBe(true);
    expect(hasSanteiKisoReportBadge([], 2026)).toBe(false);
    expect(hasSanteiKisoReportBadge([applied], 2025)).toBe(false);
  });

  it('shows geppen badge only when occasional revision is applied for revision month', () => {
    const applied = employeeWithRevisionHistory([
      {
        id: '2',
        applicableMonth: '2026-06',
        type: '随時改定',
        changeMonth: '2026-04',
        beforeHealthGrade: 10,
        beforeHealthAmount: 100000,
        beforePensionGrade: 10,
        beforePensionAmount: 100000,
        afterHealthGrade: 13,
        afterHealthAmount: 130000,
        afterPensionGrade: 13,
        afterPensionAmount: 130000,
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);

    expect(hasGetsugakuHenkoReportBadge([applied], '2026-06')).toBe(true);
    expect(hasGetsugakuHenkoReportBadge([applied], '2026-07')).toBe(false);
  });
});
