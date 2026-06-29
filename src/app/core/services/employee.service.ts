import { inject, Injectable } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import {
  arrayUnion,
  collection,
  collectionData,
  doc,
  docData,
  Firestore,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { FirestoreCollections } from '@core/models/firestore-collections';
import { CompanyService } from '@core/services/company.service';
import { CompensationService } from '@core/services/compensation.service';
import { EmployeeAuthService } from '@core/services/employee-auth.service';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { StandardRemunerationService } from '@core/services/standard-remuneration.service';
import { requireAuthenticatedUser } from '@core/utils/auth.utils';
import { toFirestoreErrorMessage } from '@core/utils/firestore-error.utils';
import { Employee, EmployeeAllowance } from '@features/employees/models/employee.model';
import {
  EmployeeGradeHistoryEntry,
  EmployeeSalaryHistoryEntry,
} from '@features/employees/models/employee-salary-history.model';
import { EmployeeRegistrationFormData, PayrollHistoryRow } from '@features/onboarding/models/employee-registration.model';
import {
  findHealthGradeByNumber,
  findPensionGradeByNumber,
  resolveNewestPayrollHistoryRow,
  sortPayrollHistoryRows,
} from '@features/onboarding/utils/payroll-history-registration.utils';
import {
  isExistingEmployeeHistoryComplete,
  resolveExistingEmployeeHistoryEndMonth,
} from '@features/onboarding/utils/employee-registration-flow.utils';
import { isSocialInsuranceType } from '@features/onboarding/models/employee-registration.model';
import { PayrollEntry } from '@features/payroll/models/compensation.model';
import {
  calculatePayrollEntryTotalPayment,
  DEFAULT_PAYROLL_BASE_DAYS,
  employeeFullName,
  getCurrentYearMonthKey,
  normalizeEmployeeBaseSalary,
  toYearMonthKey,
} from '@features/payroll/utils/compensation.utils';
import { RevisionHistoryEntry } from '@features/revision/models/revision-history.model';
import {
  hasScheduledAnnualDetermination,
  isAnnualDeterminationApplicationMonth,
  parseRevisionHistory,
} from '@features/revision/utils/revision-history.utils';
import { BonusHistoryEntry } from '@features/payroll/models/bonus-history.model';
import { parseBonusHistory } from '@features/payroll/utils/bonus-history.utils';
import { parseLeaveRecords } from '@features/employees/utils/leave-record.utils';
import { sortEmployeesByNumber } from '@features/employees/utils/employee-list.utils';
import { Dependent } from '@features/dependents/models/dependent.model';
import { LeaveRecord } from '@features/employees/models/leave-record.model';
import { EmployeeTaskFieldValues, EmployeeTaskRequestedField } from '@features/employee-portal/models/employee-task.model';
import { updatePrimaryMaternityLeaveRecord } from '@features/statutory-reports/utils/maternity-leave-data.utils';
import { mergePrimaryChildcareChild1 } from '@features/statutory-reports/utils/childcare-leave-data.utils';
import { CompanyAllowance } from '@features/settings/models/company-settings.model';
import { syncEmployeeAllowancesFromCompany } from '@features/settings/utils/allowance-sync.utils';
import { catchError, map, Observable, switchMap, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly companyService = inject(CompanyService);
  private readonly employeeAuthService = inject(EmployeeAuthService);
  private readonly compensationService = inject(CompensationService);
  private readonly monthlyLockService = inject(MonthlyLockService);
  private readonly standardRemunerationService = inject(StandardRemunerationService);

  watchEmployees(): Observable<Employee[]> {
    return authState(this.auth).pipe(
      switchMap((user) => {
        if (!user) {
          return throwError(() => new Error('ログインしていません'));
        }

        const employeesRef = collection(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees
        );

        return collectionData(employeesRef, {
          idField: 'id',
        }).pipe(
          map((rows) => sortEmployeesByNumber(rows.map((row) => this.toEmployee(row)))),
          catchError((error) => {
            console.error('[EmployeeService] 従業員一覧の取得に失敗しました', error);
            return throwError(
              () =>
                new Error(
                  toFirestoreErrorMessage(error, '従業員一覧の取得に失敗しました')
                )
            );
          })
        );
      })
    );
  }

  async createEmployee(data: EmployeeRegistrationFormData): Promise<Employee> {
    const user = await requireAuthenticatedUser(this.auth);
    const companyUid = user.uid;
    const companyId = await this.companyService.getCompanyIdForCurrentUser();
    const company = await this.companyService.getCompanyForCurrentUser();
    const systemStartDate = company?.systemStartDate?.trim() ?? '';
    const employeeNumber = data.employeeNumber.trim();
    const isExistingEmployee = data.registrationType === 'existing';
    const historyRows = isExistingEmployee ? sortPayrollHistoryRows(data.payrollHistoryRows ?? []) : [];

    if (
      isExistingEmployee &&
      !isExistingEmployeeHistoryComplete(data.hireDate, systemStartDate, historyRows)
    ) {
      throw new Error('入社月に応じた給与実績をすべて入力してください');
    }

    let employeeData = { ...data, employeeNumber };

    if (isExistingEmployee) {
      employeeData = this.applyExistingEmployeeHistoryToMaster(employeeData, systemStartDate);
    }

    await this.assertEmployeeRegistrationMonthsEditable(data.hireDate);

    try {
      await this.ensureEmployeeNumberAvailable(companyUid, employeeNumber);
    } catch (error) {
      throw new Error(
        toFirestoreErrorMessage(error, '社員番号の確認に失敗しました')
      );
    }

    let authUid: string;
    let loginEmail: string;

    try {
      const account = await this.employeeAuthService.createEmployeeAccount(
        employeeNumber,
        companyId,
        data.birthDate
      );
      authUid = account.uid;
      loginEmail = account.email;
    } catch (error) {
      throw new Error(this.toAuthErrorMessage(error));
    }

    const employeesRef = collection(
      this.firestore,
      FirestoreCollections.companies,
      companyUid,
      FirestoreCollections.employees
    );
    const employeeRef = doc(employeesRef);

    const allowances = syncEmployeeAllowancesFromCompany(
      data.allowances ?? [],
      company?.allowances ?? []
    );

    const healthGradeInfo = isExistingEmployee
      ? findHealthGradeByNumber(
          resolveNewestPayrollHistoryRow(historyRows)?.healthGrade ?? employeeData.healthGrade
        )
      : findHealthGradeByNumber(employeeData.healthGrade);
    const pensionGradeInfo = isExistingEmployee
      ? findPensionGradeByNumber(
          resolveNewestPayrollHistoryRow(historyRows)?.pensionGrade ?? employeeData.pensionGrade
        )
      : findPensionGradeByNumber(employeeData.pensionGrade);

    if (!healthGradeInfo || !pensionGradeInfo) {
      throw new Error('健康保険・厚生年金の適用等級を選択してください');
    }

    const salaryHistory: EmployeeSalaryHistoryEntry[] = isExistingEmployee
      ? historyRows.map((row) => ({
          targetMonth: row.targetMonth,
          fixedWages: row.fixedWages,
          nonFixedWages: row.nonFixedWages,
          baseDays: row.baseDays,
          locked: true as const,
        }))
      : [];

    const gradeEffectiveMonth =
      isExistingEmployee && systemStartDate
        ? systemStartDate
        : toYearMonthKey(data.hireDate) ?? '';

    const gradeHistory: EmployeeGradeHistoryEntry[] = isExistingEmployee
      ? historyRows.map((row) => {
          const health = findHealthGradeByNumber(row.healthGrade);
          const pension = findPensionGradeByNumber(row.pensionGrade);
          if (!health || !pension) {
            throw new Error(`${row.targetMonth} の等級が正しく選択されていません`);
          }
          return {
            effectiveMonth: row.targetMonth,
            healthGrade: row.healthGrade,
            pensionGrade: row.pensionGrade,
            healthStandardRemuneration: health.monthlyAmount,
            pensionStandardRemuneration: pension.monthlyAmount,
            source: 'registration' as const,
          };
        })
      : gradeEffectiveMonth
        ? [
            {
              effectiveMonth: gradeEffectiveMonth,
              healthGrade: employeeData.healthGrade,
              pensionGrade: employeeData.pensionGrade,
              healthStandardRemuneration: healthGradeInfo.monthlyAmount,
              pensionStandardRemuneration: pensionGradeInfo.monthlyAmount,
              source: 'registration',
            },
          ]
        : [];

    const registrationPayrollLockedThrough = isExistingEmployee
      ? (resolveNewestPayrollHistoryRow(historyRows)?.targetMonth ??
        resolveExistingEmployeeHistoryEndMonth(systemStartDate) ??
        '')
      : '';

    const { payrollHistoryRows: _rows, ...employeeFields } = employeeData;

    const payload = {
      ...employeeFields,
      allowances,
      healthStandardRemuneration: healthGradeInfo.monthlyAmount,
      pensionStandardRemuneration: pensionGradeInfo.monthlyAmount,
      healthGrade: employeeData.healthGrade,
      pensionGrade: employeeData.pensionGrade,
      applicableStartMonth: isExistingEmployee ? systemStartDate : '',
      salaryHistory,
      gradeHistory,
      registrationPayrollLockedThrough,
      companyOwnerUid: companyUid,
      authUid,
      loginEmail,
      email: null,
      resignationDate: null,
      status: 'active' as const,
      retirementReason: null,
      postRetirementAddress: null,
      postRetirementEmail: null,
      insuranceCardReturnCommitment: null,
      createdAt: serverTimestamp(),
      revisionHistory: [],
      bonusHistory: [],
      leaveRecords: [],
      dependents: [],
      insuranceCardReturned: null,
      scheduledHealthGrade: null,
      scheduledPensionGrade: null,
      scheduledHealthStandardRemuneration: null,
      scheduledPensionStandardRemuneration: null,
      scheduledAnnualDeterminationMonth: null,
    };

    try {
      await setDoc(employeeRef, payload);
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '従業員の保存に失敗しました'));
    }

    const employee: Employee = {
      id: employeeRef.id,
      companyOwnerUid: companyUid,
      authUid,
      loginEmail,
      email: null,
      resignationDate: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      revisionHistory: [],
      bonusHistory: [],
      leaveRecords: [],
      dependents: [],
      ...employeeData,
      allowances,
      healthGrade: employeeData.healthGrade,
      pensionGrade: employeeData.pensionGrade,
      healthStandardRemuneration: healthGradeInfo.monthlyAmount,
      pensionStandardRemuneration: pensionGradeInfo.monthlyAmount,
      salaryHistory,
      gradeHistory,
      registrationPayrollLockedThrough,
      scheduledHealthGrade: null,
      scheduledPensionGrade: null,
      scheduledHealthStandardRemuneration: null,
      scheduledPensionStandardRemuneration: null,
      scheduledAnnualDeterminationMonth: null,
      payrollHistoryRows: historyRows,
      insuranceCardReturned: null,
      retirementReason: null,
      postRetirementAddress: null,
      postRetirementEmail: null,
      insuranceCardReturnCommitment: null,
    };

    if (isExistingEmployee) {
      try {
        await this.importLockedPayrollHistory(employee, historyRows);
      } catch (error) {
        throw new Error(
          toFirestoreErrorMessage(error, '過去給与履歴の保存に失敗しました')
        );
      }
    }

    return employee;
  }

  private applyExistingEmployeeHistoryToMaster(
    data: EmployeeRegistrationFormData & { employeeNumber: string },
    systemStartDate: string
  ): EmployeeRegistrationFormData & { employeeNumber: string } {
    const rows = sortPayrollHistoryRows(data.payrollHistoryRows ?? []);
    const newest = resolveNewestPayrollHistoryRow(rows);

    if (!newest) {
      throw new Error('過去の給与履歴を1件以上入力してください');
    }

    const healthGrade = findHealthGradeByNumber(newest.healthGrade);
    const pensionGrade = findPensionGradeByNumber(newest.pensionGrade);

    if (!healthGrade || !pensionGrade) {
      throw new Error('最新月の等級が正しく選択されていません');
    }

    if (!/^\d{4}-\d{2}$/.test(systemStartDate)) {
      throw new Error('会社のシステム利用開始年月が設定されていません');
    }

    return {
      ...data,
      healthGrade: newest.healthGrade,
      pensionGrade: newest.pensionGrade,
      healthStandardRemuneration: healthGrade.monthlyAmount,
      pensionStandardRemuneration: pensionGrade.monthlyAmount,
      applicableStartMonth: systemStartDate,
    };
  }

  private async importLockedPayrollHistory(
    employee: Employee,
    rows: PayrollHistoryRow[]
  ): Promise<void> {
    const sortedRows = sortPayrollHistoryRows(rows);
    const employeeName = employeeFullName(employee);
    const entriesByMonth = new Map<string, PayrollEntry>();

    for (const row of sortedRows) {
      entriesByMonth.set(row.targetMonth, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        employeeName,
        baseSalary: row.fixedWages,
        allowances: [],
        nonFixedWages: row.nonFixedWages,
        baseDays: row.baseDays,
        adjustmentAmount: 0,
        adjustmentType: null,
        adjustmentTargetMonth: '',
        totalPayment: calculatePayrollEntryTotalPayment(row.fixedWages, [], row.nonFixedWages),
        locked: true,
        registrationLocked: true,
      });
    }

    await this.compensationService.importLockedPayrollEntries(entriesByMonth);
  }

  async appendBonusHistory(employeeId: string, historyEntry: BonusHistoryEntry): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        {
          bonusHistory: arrayUnion(historyEntry),
        }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '賞与履歴の保存に失敗しました'));
    }
  }

  async updateEmployeePayrollData(
    employeeId: string,
    data: { baseSalary: number; allowances: EmployeeAllowance[] }
  ): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);
    await this.monthlyLockService.assertMonthEditable(getCurrentYearMonthKey());

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        {
          baseSalary: data.baseSalary,
          allowances: data.allowances,
        }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '従業員マスタの更新に失敗しました'));
    }
  }

  async updateEmployeeEmail(employeeId: string, email: string | null): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);
    const normalizedEmail = email?.trim() || null;

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        {
          email: normalizedEmail,
        }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '従業員メールアドレスの更新に失敗しました'));
    }
  }

  /** 会社手当マスターの金額を全従業員ドキュメントへ一括反映（確定済み給与データは更新しない） */
  async syncAllowancesFromCompany(companyAllowances: CompanyAllowance[]): Promise<number> {
    const user = await requireAuthenticatedUser(this.auth);
    const employeesRef = collection(
      this.firestore,
      FirestoreCollections.companies,
      user.uid,
      FirestoreCollections.employees
    );
    const snapshot = await getDocs(employeesRef);

    if (snapshot.empty) {
      return 0;
    }

    const batches: ReturnType<typeof writeBatch>[] = [];
    let batch = writeBatch(this.firestore);
    let operationCount = 0;

    for (const employeeDoc of snapshot.docs) {
      const employee = this.toEmployee({ id: employeeDoc.id, ...employeeDoc.data() });
      const allowances = syncEmployeeAllowancesFromCompany(employee.allowances, companyAllowances);

      batch.update(employeeDoc.ref, { allowances });
      operationCount += 1;

      if (operationCount >= 500) {
        batches.push(batch);
        batch = writeBatch(this.firestore);
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      batches.push(batch);
    }

    try {
      await Promise.all(batches.map((currentBatch) => currentBatch.commit()));
    } catch (error) {
      throw new Error(
        toFirestoreErrorMessage(error, '従業員への手当一括反映に失敗しました')
      );
    }

    return snapshot.size;
  }

  /**
   * 入社月の初回給与保存時のみ、固定賃金からマスター等級を同期する。
   * 対象月が入社月と一致しない場合は何もしない（等級は変更しない）。
   */
  async syncMasterStandardRemunerationIfHireMonthPayroll(
    employeeId: string,
    targetMonth: string,
    hireDate: string,
    fixedWages: number
  ): Promise<void> {
    if (toYearMonthKey(hireDate) !== targetMonth) {
      return;
    }

    await this.syncMasterStandardRemunerationFromFixedWages(employeeId, fixedWages);
  }

  private async syncMasterStandardRemunerationFromFixedWages(
    employeeId: string,
    fixedWages: number
  ): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);
    const healthGrade = this.standardRemunerationService.resolveHealthGrade(fixedWages);
    const pensionGrade = this.standardRemunerationService.resolvePensionGrade(fixedWages);

    if (!healthGrade || !pensionGrade) {
      throw new Error('固定賃金に対応する等級が見つかりません');
    }

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        {
          healthStandardRemuneration: healthGrade.monthlyAmount,
          pensionStandardRemuneration: pensionGrade.monthlyAmount,
          healthGrade: healthGrade.grade,
          pensionGrade: pensionGrade.grade,
        }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '標準報酬月額の同期に失敗しました'));
    }
  }

  async applyStandardRemunerationRevision(
    employeeId: string,
    data: {
      healthStandardRemuneration: number;
      pensionStandardRemuneration: number;
      historyEntry: RevisionHistoryEntry;
    }
  ): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);
    await this.assertRevisionHistoryEditable(data.historyEntry);

    const healthGrade = this.standardRemunerationService.findHealthGradeByAmount(
      data.healthStandardRemuneration
    );
    const pensionGrade = this.standardRemunerationService.findPensionGradeByAmount(
      data.pensionStandardRemuneration
    );

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        {
          healthStandardRemuneration: data.healthStandardRemuneration,
          pensionStandardRemuneration: data.pensionStandardRemuneration,
          healthGrade: healthGrade?.grade ?? data.historyEntry.afterHealthGrade,
          pensionGrade: pensionGrade?.grade ?? data.historyEntry.afterPensionGrade,
          revisionHistory: arrayUnion(data.historyEntry),
        }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '標準報酬月額の適用に失敗しました'));
    }
  }

  /**
   * 算定基礎の適用。マスター等級は即時更新せず、9月度給与保存時に反映する予約枠へ保存する。
   */
  async applyAnnualDeterminationRevision(
    employeeId: string,
    data: {
      healthStandardRemuneration: number;
      pensionStandardRemuneration: number;
      historyEntry: RevisionHistoryEntry;
    }
  ): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);
    await this.assertRevisionHistoryEditable(data.historyEntry);

    const healthGrade = this.standardRemunerationService.findHealthGradeByAmount(
      data.healthStandardRemuneration
    );
    const pensionGrade = this.standardRemunerationService.findPensionGradeByAmount(
      data.pensionStandardRemuneration
    );

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        {
          scheduledHealthGrade: healthGrade?.grade ?? data.historyEntry.afterHealthGrade,
          scheduledPensionGrade: pensionGrade?.grade ?? data.historyEntry.afterPensionGrade,
          scheduledHealthStandardRemuneration: data.healthStandardRemuneration,
          scheduledPensionStandardRemuneration: data.pensionStandardRemuneration,
          scheduledAnnualDeterminationMonth: data.historyEntry.applicableMonth,
          revisionHistory: arrayUnion(data.historyEntry),
        }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '算定基礎の適用予約に失敗しました'));
    }
  }

  /**
   * 9月度給与保存時、算定基礎の適用予定データをマスター等級へ反映する。
   */
  async applyScheduledAnnualDeterminationOnPayrollSave(
    employeeId: string,
    targetMonth: string,
    employee: Employee
  ): Promise<void> {
    if (!isAnnualDeterminationApplicationMonth(targetMonth)) {
      return;
    }

    if (!hasScheduledAnnualDetermination(employee)) {
      return;
    }

    if (
      employee.scheduledAnnualDeterminationMonth &&
      employee.scheduledAnnualDeterminationMonth !== targetMonth
    ) {
      return;
    }

    const user = await requireAuthenticatedUser(this.auth);

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        {
          healthGrade: employee.scheduledHealthGrade,
          pensionGrade: employee.scheduledPensionGrade,
          healthStandardRemuneration: employee.scheduledHealthStandardRemuneration,
          pensionStandardRemuneration: employee.scheduledPensionStandardRemuneration,
          scheduledHealthGrade: null,
          scheduledPensionGrade: null,
          scheduledHealthStandardRemuneration: null,
          scheduledPensionStandardRemuneration: null,
          scheduledAnnualDeterminationMonth: null,
        }
      );
    } catch (error) {
      throw new Error(
        toFirestoreErrorMessage(error, '算定基礎の予定等級をマスターへ反映できませんでした')
      );
    }
  }

  async updateEmployeeLeaveRecords(
    employeeId: string,
    leaveRecords: LeaveRecord[]
  ): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        { leaveRecords }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '休業履歴の保存に失敗しました'));
    }
  }

  async updateEmployeeDependents(employeeId: string, dependents: Dependent[]): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        { dependents, hasDependents: dependents.length > 0, pendingDependentSubmission: null }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '扶養家族の保存に失敗しました'));
    }
  }

  async updateEmployeeApplicationFields(
    employeeId: string,
    updates: {
      postalCode?: string;
      address?: string;
      bankName?: string;
      bankBranchName?: string;
      bankAccountType?: string;
      bankAccountNumber?: string;
      commuteRoute?: string;
      commutePassAmount?: number | null;
    }
  ): Promise<void> {
    const user = await requireAuthenticatedUser(this.auth);
    const payload: {
      postalCode?: string;
      address?: string;
      bankName?: string;
      bankBranchName?: string;
      bankAccountType?: string;
      bankAccountNumber?: string;
      commuteRoute?: string;
      commutePassAmount?: number | null;
    } = {};

    if (updates.postalCode != null) {
      payload.postalCode = updates.postalCode;
    }
    if (updates.address != null) {
      payload.address = updates.address;
    }
    if (updates.bankName != null) {
      payload.bankName = updates.bankName;
    }
    if (updates.bankBranchName != null) {
      payload.bankBranchName = updates.bankBranchName;
    }
    if (updates.bankAccountType != null) {
      payload.bankAccountType = updates.bankAccountType;
    }
    if (updates.bankAccountNumber != null) {
      payload.bankAccountNumber = updates.bankAccountNumber;
    }
    if (updates.commuteRoute != null) {
      payload.commuteRoute = updates.commuteRoute;
    }
    if (updates.commutePassAmount !== undefined) {
      payload.commutePassAmount = updates.commutePassAmount;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          user.uid,
          FirestoreCollections.employees,
          employeeId
        ),
        payload
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '従業員マスターの更新に失敗しました'));
    }
  }

  async findEmployeeByNumber(
    companyOwnerUid: string,
    employeeNumber: string
  ): Promise<Employee | null> {
    const employeesRef = collection(
      this.firestore,
      FirestoreCollections.companies,
      companyOwnerUid,
      FirestoreCollections.employees
    );
    const snapshot = await getDocs(
      query(employeesRef, where('employeeNumber', '==', employeeNumber.trim()), limit(1))
    );

    const employeeDoc = snapshot.docs[0];
    if (!employeeDoc) {
      return null;
    }

    return this.toEmployee({ id: employeeDoc.id, ...employeeDoc.data() });
  }

  watchEmployee(companyOwnerUid: string, employeeId: string): Observable<Employee | null> {
    const employeeRef = doc(
      this.firestore,
      FirestoreCollections.companies,
      companyOwnerUid,
      FirestoreCollections.employees,
      employeeId
    );

    return docData(employeeRef).pipe(
      map((row) => (row ? this.toEmployee({ id: employeeId, ...row }) : null)),
      catchError((error) => {
        console.error('[EmployeeService] 従業員マスタの取得に失敗しました', error);
        return throwError(
          () => new Error(toFirestoreErrorMessage(error, '従業員マスタの取得に失敗しました'))
        );
      })
    );
  }

  async processRetirement(
    companyOwnerUid: string,
    employeeId: string,
    input: { retirementDate: string; retirementReason: string }
  ): Promise<void> {
    await requireAuthenticatedUser(this.auth);

    const retirementDate = input.retirementDate.trim();
    const retirementReason = input.retirementReason.trim();
    if (!retirementDate) {
      throw new Error('退職日を入力してください');
    }
    if (!retirementReason) {
      throw new Error('退職理由を入力してください');
    }

    const retirementMonth = toYearMonthKey(retirementDate);
    if (retirementMonth) {
      await this.monthlyLockService.assertMonthEditable(retirementMonth);
    }
    await this.monthlyLockService.assertMonthEditable(getCurrentYearMonthKey());

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          companyOwnerUid,
          FirestoreCollections.employees,
          employeeId
        ),
        {
          resignationDate: retirementDate,
          status: 'retired',
          retirementReason,
        }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '退職手続きの保存に失敗しました'));
    }
  }

  async updateInsuranceCardReturned(
    companyOwnerUid: string,
    employeeId: string,
    isReturned: boolean
  ): Promise<void> {
    await requireAuthenticatedUser(this.auth);

    try {
      await updateDoc(
        doc(
          this.firestore,
          FirestoreCollections.companies,
          companyOwnerUid,
          FirestoreCollections.employees,
          employeeId
        ),
        { insuranceCardReturned: isReturned }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '保険証回収状態の保存に失敗しました'));
    }
  }

  async applyEmployeeTaskFieldValues(
    companyOwnerUid: string,
    employeeId: string,
    requestedFields: EmployeeTaskRequestedField[],
    values: EmployeeTaskFieldValues
  ): Promise<void> {
    await requireAuthenticatedUser(this.auth);

    const updates: Record<string, unknown> = {};

    if (requestedFields.includes('retirementDate') && values.retirementDate) {
      updates['resignationDate'] = values.retirementDate;
      updates['status'] = 'retired';
    }

    if (requestedFields.includes('myNumber') && values.myNumber) {
      updates['myNumber'] = values.myNumber.replace(/\D/g, '');
    }

    if (requestedFields.includes('hireDate') && values.hireDate) {
      updates['hireDate'] = values.hireDate;
    }

    if (requestedFields.includes('birthDate') && values.birthDate) {
      updates['birthDate'] = values.birthDate;
    }

    if (
      requestedFields.includes('insuranceCardReturned') &&
      values.insuranceCardReturned != null
    ) {
      updates['insuranceCardReturned'] = values.insuranceCardReturned;
    }

    if (requestedFields.includes('postRetirementAddress') && values.postRetirementAddress) {
      updates['postRetirementAddress'] = values.postRetirementAddress.trim();
    }

    if (requestedFields.includes('postRetirementEmail') && values.postRetirementEmail) {
      updates['postRetirementEmail'] = values.postRetirementEmail.trim();
    }

    if (
      requestedFields.includes('insuranceCardReturnCommitment') &&
      values.insuranceCardReturnCommitment != null
    ) {
      updates['insuranceCardReturnCommitment'] = values.insuranceCardReturnCommitment;
    }

    if (requestedFields.includes('postalCode') && values.postalCode) {
      updates['postalCode'] = values.postalCode.replace(/\D/g, '').slice(0, 7);
    }

    if (requestedFields.includes('address') && values.address) {
      updates['address'] = values.address.trim();
    }

    const maternityLeaveUpdates: Partial<
      Pick<LeaveRecord, 'expectedDeliveryDate' | 'deliveryType' | 'actualDeliveryDate'>
    > = {};

    if (requestedFields.includes('expectedDeliveryDate') && values.expectedDeliveryDate) {
      maternityLeaveUpdates.expectedDeliveryDate = values.expectedDeliveryDate.trim();
    }

    if (requestedFields.includes('deliveryType') && values.deliveryType) {
      maternityLeaveUpdates.deliveryType = values.deliveryType;
    }

    const hasMaternityLeaveUpdates = Object.keys(maternityLeaveUpdates).length > 0;

    const hasChildcareChildUpdates =
      requestedFields.includes('childcareChild1NameKana') ||
      requestedFields.includes('childcareChild1NameKanji') ||
      requestedFields.includes('childcareChild1BirthDate');

    const hasDependentSubmissionUpdates =
      requestedFields.includes('dependentLastName') ||
      requestedFields.includes('dependentFirstName') ||
      requestedFields.includes('dependentLastNameKana') ||
      requestedFields.includes('dependentFirstNameKana') ||
      requestedFields.includes('dependentBirthDate') ||
      requestedFields.includes('dependentRelationship') ||
      requestedFields.includes('dependentLivingArrangement') ||
      requestedFields.includes('dependentDependencyStartDate') ||
      requestedFields.includes('dependentHasDisability') ||
      requestedFields.includes('dependentOccupation') ||
      requestedFields.includes('dependentCurrentSituation') ||
      requestedFields.includes('dependentDocumentUpload');

    if (
      Object.keys(updates).length === 0 &&
      !hasMaternityLeaveUpdates &&
      !hasChildcareChildUpdates &&
      !hasDependentSubmissionUpdates
    ) {
      throw new Error('更新する項目がありません');
    }

    try {
      const employeeRef = doc(
        this.firestore,
        FirestoreCollections.companies,
        companyOwnerUid,
        FirestoreCollections.employees,
        employeeId
      );

      if (hasMaternityLeaveUpdates) {
        const snapshot = await getDoc(employeeRef);
        if (!snapshot.exists()) {
          throw new Error('従業員が見つかりません');
        }

        const employee = this.toEmployee({ id: snapshot.id, ...snapshot.data() });
        const leaveRecords = updatePrimaryMaternityLeaveRecord(
          employee.leaveRecords ?? [],
          maternityLeaveUpdates
        );

        await updateDoc(employeeRef, {
          leaveRecords,
          ...(updates['resignationDate']
            ? {
                resignationDate: updates['resignationDate'] as string,
                status: updates['status'] as Employee['status'],
              }
            : {}),
          ...(updates['myNumber'] ? { myNumber: updates['myNumber'] as string } : {}),
          ...(updates['hireDate'] ? { hireDate: updates['hireDate'] as string } : {}),
          ...(updates['birthDate'] ? { birthDate: updates['birthDate'] as string } : {}),
          ...(updates['insuranceCardReturned'] != null
            ? { insuranceCardReturned: updates['insuranceCardReturned'] as boolean }
            : {}),
          ...(updates['postalCode'] ? { postalCode: updates['postalCode'] as string } : {}),
          ...(updates['address'] ? { address: updates['address'] as string } : {}),
        });
        return;
      }

      if (hasChildcareChildUpdates) {
        const snapshot = await getDoc(employeeRef);
        if (!snapshot.exists()) {
          throw new Error('従業員が見つかりません');
        }

        const employee = this.toEmployee({ id: snapshot.id, ...snapshot.data() });
        const child = {
          nameKana: values.childcareChild1NameKana?.trim() ?? '',
          nameKanji: values.childcareChild1NameKanji?.trim() ?? '',
          birthDate: values.childcareChild1BirthDate?.trim() ?? '',
        };

        if (!child.nameKana || !child.nameKanji || !child.birthDate) {
          throw new Error('養育する子の情報が不足しています');
        }

        const leaveRecords = mergePrimaryChildcareChild1(employee.leaveRecords ?? [], child);

        await updateDoc(employeeRef, {
          leaveRecords,
          ...(updates['resignationDate']
            ? {
                resignationDate: updates['resignationDate'] as string,
                status: updates['status'] as Employee['status'],
              }
            : {}),
          ...(updates['myNumber'] ? { myNumber: updates['myNumber'] as string } : {}),
          ...(updates['hireDate'] ? { hireDate: updates['hireDate'] as string } : {}),
          ...(updates['birthDate'] ? { birthDate: updates['birthDate'] as string } : {}),
          ...(updates['insuranceCardReturned'] != null
            ? { insuranceCardReturned: updates['insuranceCardReturned'] as boolean }
            : {}),
          ...(updates['postalCode'] ? { postalCode: updates['postalCode'] as string } : {}),
          ...(updates['address'] ? { address: updates['address'] as string } : {}),
        });
        return;
      }

      if (hasDependentSubmissionUpdates) {
        const pendingDependentSubmission = this.buildPendingDependentSubmission(values);
        if (!pendingDependentSubmission) {
          throw new Error('扶養家族情報が不足しています');
        }

        await updateDoc(employeeRef, {
          pendingDependentSubmission,
          ...(updates['postalCode'] ? { postalCode: updates['postalCode'] as string } : {}),
          ...(updates['address'] ? { address: updates['address'] as string } : {}),
        });
        return;
      }

      await updateDoc(
        employeeRef,
        {
          ...(updates['resignationDate']
            ? {
                resignationDate: updates['resignationDate'] as string,
                status: updates['status'] as Employee['status'],
              }
            : {}),
          ...(updates['myNumber']
            ? { myNumber: updates['myNumber'] as string }
            : {}),
          ...(updates['hireDate'] ? { hireDate: updates['hireDate'] as string } : {}),
          ...(updates['birthDate'] ? { birthDate: updates['birthDate'] as string } : {}),
          ...(updates['insuranceCardReturned'] != null
            ? { insuranceCardReturned: updates['insuranceCardReturned'] as boolean }
            : {}),
          ...(updates['postRetirementAddress']
            ? { postRetirementAddress: updates['postRetirementAddress'] as string }
            : {}),
          ...(updates['postRetirementEmail']
            ? { postRetirementEmail: updates['postRetirementEmail'] as string }
            : {}),
          ...(updates['insuranceCardReturnCommitment'] != null
            ? {
                insuranceCardReturnCommitment: updates['insuranceCardReturnCommitment'] as boolean,
              }
            : {}),
          ...(updates['postalCode']
            ? { postalCode: updates['postalCode'] as string }
            : {}),
          ...(updates['address'] ? { address: updates['address'] as string } : {}),
        }
      );
    } catch (error) {
      throw new Error(toFirestoreErrorMessage(error, '従業員マスタの更新に失敗しました'));
    }
  }

  private async ensureEmployeeNumberAvailable(
    companyUid: string,
    employeeNumber: string
  ): Promise<void> {
    const taken = await this.isEmployeeNumberTakenForCompany(companyUid, employeeNumber);
    if (taken) {
      throw new Error('この社員番号は既に登録されています');
    }
  }

  /** 社員番号が既に使用されているか（現在ログイン中の会社内） */
  async isEmployeeNumberTaken(employeeNumber: string): Promise<boolean> {
    const user = await requireAuthenticatedUser(this.auth);
    return this.isEmployeeNumberTakenForCompany(user.uid, employeeNumber.trim());
  }

  private async isEmployeeNumberTakenForCompany(
    companyUid: string,
    employeeNumber: string
  ): Promise<boolean> {
    if (!employeeNumber) {
      return false;
    }

    const employeesRef = collection(
      this.firestore,
      FirestoreCollections.companies,
      companyUid,
      FirestoreCollections.employees
    );
    const snapshot = await getDocs(
      query(employeesRef, where('employeeNumber', '==', employeeNumber))
    );

    return !snapshot.empty;
  }

  private toEmployee(row: Record<string, unknown>): Employee {
    const allowances = this.toEmployeeAllowances(row['allowances']);
    const salaryHistory = this.parseSalaryHistory(row['salaryHistory']);
    const baseSalary = normalizeEmployeeBaseSalary(
      Number(row['baseSalary'] ?? 0),
      allowances,
      salaryHistory
    );

    return {
      id: String(row['id'] ?? ''),
      employeeNumber: String(row['employeeNumber'] ?? ''),
      companyOwnerUid: String(row['companyOwnerUid'] ?? ''),
      authUid: row['authUid'] ? String(row['authUid']) : null,
      loginEmail: row['loginEmail'] ? String(row['loginEmail']) : null,
      email: row['email'] ? String(row['email']).trim() : null,
      registrationType: row['registrationType'] as Employee['registrationType'],
      socialInsuranceType: isSocialInsuranceType(row['socialInsuranceType'])
        ? row['socialInsuranceType']
        : 'general',
      lastName: String(row['lastName'] ?? ''),
      firstName: String(row['firstName'] ?? ''),
      lastNameKana: String(row['lastNameKana'] ?? ''),
      firstNameKana: String(row['firstNameKana'] ?? ''),
      birthDate: this.normalizeDateField(row['birthDate']),
      gender: row['gender'] === 'female' ? 'female' : 'male',
      hireDate: this.normalizeDateField(row['hireDate']),
      myNumber: String(row['myNumber'] ?? ''),
      hasDependents: Boolean(row['hasDependents']),
      insuredPersonNumber: String(row['insuredPersonNumber'] ?? ''),
      baseSalary,
      healthStandardRemuneration: Number(
        row['healthStandardRemuneration'] ?? row['standardRemuneration'] ?? 0
      ),
      pensionStandardRemuneration: Number(
        row['pensionStandardRemuneration'] ?? row['standardRemuneration'] ?? 0
      ),
      healthGrade: row['healthGrade'] != null ? Number(row['healthGrade']) : null,
      pensionGrade: row['pensionGrade'] != null ? Number(row['pensionGrade']) : null,
      scheduledHealthGrade:
        row['scheduledHealthGrade'] != null ? Number(row['scheduledHealthGrade']) : null,
      scheduledPensionGrade:
        row['scheduledPensionGrade'] != null ? Number(row['scheduledPensionGrade']) : null,
      scheduledHealthStandardRemuneration:
        row['scheduledHealthStandardRemuneration'] != null
          ? Number(row['scheduledHealthStandardRemuneration'])
          : null,
      scheduledPensionStandardRemuneration:
        row['scheduledPensionStandardRemuneration'] != null
          ? Number(row['scheduledPensionStandardRemuneration'])
          : null,
      scheduledAnnualDeterminationMonth:
        typeof row['scheduledAnnualDeterminationMonth'] === 'string' &&
        /^\d{4}-\d{2}$/.test(row['scheduledAnnualDeterminationMonth'])
          ? row['scheduledAnnualDeterminationMonth']
          : null,
      applicableStartMonth: this.resolveApplicableStartMonth(row),
      resignationDate: row['resignationDate'] ? String(row['resignationDate']) : null,
      status: row['status'] === 'retired' ? 'retired' : 'active',
      allowances,
      revisionHistory: parseRevisionHistory(row['revisionHistory']),
      bonusHistory: parseBonusHistory(row['bonusHistory']),
      leaveRecords: parseLeaveRecords(row['leaveRecords']),
      dependents: this.parseDependents(row['dependents']),
      pendingDependentSubmission: this.coerceDependent(row['pendingDependentSubmission']),
      insuranceCardReturned:
        row['insuranceCardReturned'] == null ? null : Boolean(row['insuranceCardReturned']),
      retirementReason: row['retirementReason'] ? String(row['retirementReason']) : null,
      postRetirementAddress: row['postRetirementAddress']
        ? String(row['postRetirementAddress'])
        : null,
      postRetirementEmail: row['postRetirementEmail'] ? String(row['postRetirementEmail']) : null,
      insuranceCardReturnCommitment:
        row['insuranceCardReturnCommitment'] == null
          ? null
          : Boolean(row['insuranceCardReturnCommitment']),
      postalCode: String(row['postalCode'] ?? '').trim(),
      address: String(row['address'] ?? '').trim(),
      bankName: String(row['bankName'] ?? '').trim(),
      bankBranchName: String(row['bankBranchName'] ?? '').trim(),
      bankAccountType: String(row['bankAccountType'] ?? '').trim(),
      bankAccountNumber: String(row['bankAccountNumber'] ?? '').trim(),
      commuteRoute: String(row['commuteRoute'] ?? '').trim(),
      commutePassAmount:
        row['commutePassAmount'] == null || row['commutePassAmount'] === ''
          ? null
          : Number(row['commutePassAmount']),
      salaryHistory,
      gradeHistory: this.parseGradeHistory(row['gradeHistory']),
      registrationPayrollLockedThrough:
        typeof row['registrationPayrollLockedThrough'] === 'string' &&
        /^\d{4}-\d{2}$/.test(row['registrationPayrollLockedThrough'])
          ? row['registrationPayrollLockedThrough']
          : undefined,
      createdAt: this.toIsoString(row['createdAt']),
    };
  }

  private parseSalaryHistory(value: unknown): EmployeeSalaryHistoryEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        const targetMonth = String(row['targetMonth'] ?? '').trim();
        if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
          return null;
        }

        return {
          targetMonth,
          fixedWages: Number(row['fixedWages'] ?? 0),
          nonFixedWages: Number(row['nonFixedWages'] ?? 0),
          baseDays: Number(row['baseDays'] ?? DEFAULT_PAYROLL_BASE_DAYS),
          locked: true as const,
        };
      })
      .filter((entry): entry is EmployeeSalaryHistoryEntry => entry != null);
  }

  private parseGradeHistory(value: unknown): EmployeeGradeHistoryEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        const effectiveMonth = String(row['effectiveMonth'] ?? '').trim();
        if (!/^\d{4}-\d{2}$/.test(effectiveMonth)) {
          return null;
        }

        return {
          effectiveMonth,
          healthGrade: Number(row['healthGrade'] ?? 0),
          pensionGrade: Number(row['pensionGrade'] ?? 0),
          healthStandardRemuneration: Number(row['healthStandardRemuneration'] ?? 0),
          pensionStandardRemuneration: Number(row['pensionStandardRemuneration'] ?? 0),
          source: 'registration' as const,
        };
      })
      .filter((entry): entry is EmployeeGradeHistoryEntry => entry != null);
  }

  private resolveApplicableStartMonth(row: Record<string, unknown>): string {
    const direct = String(row['applicableStartMonth'] ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(direct)) {
      return direct;
    }

    const legacyBase = String(row['baseSalaryStartMonth'] ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(legacyBase)) {
      return legacyBase;
    }

    const legacyStandard = String(row['standardRemunerationStartMonth'] ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(legacyStandard)) {
      return legacyStandard;
    }

    return '';
  }

  private parseDependents(value: unknown): Dependent[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((row) => this.coerceDependent(row))
      .filter((dependent): dependent is Dependent => dependent != null);
  }

  private buildPendingDependentSubmission(
    values: EmployeeTaskFieldValues
  ): Dependent | null {
    const lastName = values.dependentLastName?.trim() ?? '';
    const firstName = values.dependentFirstName?.trim() ?? '';
    const birthDate = values.dependentBirthDate?.trim() ?? '';
    const dependencyStartDate = values.dependentDependencyStartDate?.trim() ?? '';
    const documentUrls = values.dependentDocumentUrls ?? [];

    if (!lastName || !firstName || !birthDate || !dependencyStartDate) {
      return null;
    }

    if (documentUrls.length === 0) {
      return null;
    }

    const relationship = values.dependentRelationship?.trim() ?? '';
    const validRelationships: Dependent['relationship'][] = [
      'spouse',
      'child',
      'parent',
      'grandparent',
      'sibling',
      'other',
    ];

    const livingArrangement = values.dependentLivingArrangement?.trim() ?? '';
    const validLivingArrangements: Dependent['livingArrangement'][] = ['cohabiting', 'separate'];

    const occupation = values.dependentOccupation?.trim() ?? '';
    const validOccupations: Dependent['occupation'][] = [
      'unemployed',
      'part_time',
      'student',
      'employee',
      'self_employed',
      'other',
    ];

    const currentSituation = values.dependentCurrentSituation?.trim() ?? '';
    const validSituations: Dependent['currentSituation'][] = [
      'student_over_16',
      'recently_unemployed',
      'ongoing_unemployed_or_part_time',
      'pension_recipient',
      'other',
    ];

    return {
      lastName,
      firstName,
      lastNameKana: values.dependentLastNameKana?.trim() ?? '',
      firstNameKana: values.dependentFirstNameKana?.trim() ?? '',
      romanName: '',
      birthDate,
      relationship: validRelationships.includes(relationship as Dependent['relationship'])
        ? (relationship as Dependent['relationship'])
        : 'other',
      livingArrangement: validLivingArrangements.includes(
        livingArrangement as Dependent['livingArrangement']
      )
        ? (livingArrangement as Dependent['livingArrangement'])
        : 'cohabiting',
      dependencyStartDate,
      hasDisability: values.dependentHasDisability === true,
      occupation: validOccupations.includes(occupation as Dependent['occupation'])
        ? (occupation as Dependent['occupation'])
        : 'other',
      currentSituation: validSituations.includes(currentSituation as Dependent['currentSituation'])
        ? (currentSituation as Dependent['currentSituation'])
        : 'other',
      documentUrls,
    };
  }

  private coerceDependent(value: unknown): Dependent | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const item = value as Record<string, unknown>;
    const lastName = String(item['lastName'] ?? '').trim();
    const firstName = String(item['firstName'] ?? '').trim();

    if (!lastName || !firstName) {
      return null;
    }

    return {
      lastName,
      firstName,
      lastNameKana: String(item['lastNameKana'] ?? '').trim(),
      firstNameKana: String(item['firstNameKana'] ?? '').trim(),
      romanName: String(item['romanName'] ?? '').trim(),
      birthDate: this.normalizeDateField(item['birthDate']),
      relationship: (item['relationship'] as Dependent['relationship']) ?? 'other',
      livingArrangement:
        item['livingArrangement'] === 'separate' ? 'separate' : 'cohabiting',
      dependencyStartDate: this.normalizeDateField(item['dependencyStartDate']),
      hasDisability: Boolean(item['hasDisability']),
      occupation: (item['occupation'] as Dependent['occupation']) ?? 'other',
      currentSituation:
        (item['currentSituation'] as Dependent['currentSituation']) ?? 'other',
      gender:
        item['gender'] === 'male' || item['gender'] === 'female'
          ? item['gender']
          : '',
      myNumber: String(item['myNumber'] ?? '').trim(),
      basicPensionNumber: String(item['basicPensionNumber'] ?? '').trim(),
      changeDate: this.normalizeDateField(item['changeDate']),
      changeReason: String(item['changeReason'] ?? '').trim(),
      annualIncome:
        item['annualIncome'] == null || item['annualIncome'] === ''
          ? null
          : Number(item['annualIncome']),
      postalCode: String(item['postalCode'] ?? '').trim(),
      address: String(item['address'] ?? '').trim(),
      documentUrls: Array.isArray(item['documentUrls'])
        ? item['documentUrls'].map((url) => String(url ?? '').trim()).filter(Boolean)
        : [],
    };
  }

  private toEmployeeAllowances(value: unknown): EmployeeAllowance[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        name: String(item['name'] ?? ''),
        amount: item['amount'] == null ? null : Number(item['amount']),
      };
    });
  }

  private normalizeDateField(value: unknown): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      const isoPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
      if (isoPrefix) {
        return isoPrefix[1];
      }

      return trimmed;
    }

    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      const date = (value as { toDate: () => Date }).toDate();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return String(value);
  }

  private toIsoString(value: unknown): string {
    if (value && typeof value === 'object' && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    return typeof value === 'string' ? value : new Date().toISOString();
  }

  private toAuthErrorMessage(error: unknown): string {
    const code = (error as { code?: string })?.code;

    switch (code) {
      case 'auth/email-already-in-use':
        return 'この社員番号は既にログインアカウントとして登録されています';
      case 'auth/weak-password':
        return '生年月日から生成したパスワードが弱すぎます';
      case 'auth/invalid-email':
        return '社員番号の形式が正しくありません';
      default:
        return 'ログインアカウントの作成に失敗しました';
    }
  }

  private async assertEmployeeRegistrationMonthsEditable(hireDate: string): Promise<void> {
    const months = new Set<string>([getCurrentYearMonthKey()]);
    const hireMonth = toYearMonthKey(hireDate);
    if (hireMonth) {
      months.add(hireMonth);
    }

    for (const month of months) {
      await this.monthlyLockService.assertMonthEditable(month);
    }
  }

  private async assertRevisionHistoryEditable(entry: RevisionHistoryEntry): Promise<void> {
    if (!entry.applicableMonth) {
      return;
    }

    await this.monthlyLockService.assertMonthEditable(entry.applicableMonth);
  }
}
