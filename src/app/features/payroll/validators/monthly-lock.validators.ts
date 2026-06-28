import { AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { MonthlyLockService } from '@core/services/monthly-lock.service';
import { toYearMonthKey } from '@features/payroll/utils/compensation.utils';
import {
  LEAVE_PERIOD_HAS_LOCKED_MONTH_ERROR,
  LOCKED_MONTH_ERROR,
} from '@features/payroll/utils/monthly-lock.utils';
import { catchError, from, map, Observable, of } from 'rxjs';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 単一日付（入社日・退職日など）が確定済み月に該当するかを非同期検証する */
export function createLockedMonthAsyncValidator(
  monthlyLockService: MonthlyLockService
): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const date = String(control.value ?? '').trim();

    if (!ISO_DATE_PATTERN.test(date)) {
      return of(null);
    }

    const month = toYearMonthKey(date);
    if (!month) {
      return of(null);
    }

    return from(monthlyLockService.isMonthLocked(month)).pipe(
      map((locked) => (locked ? { [LOCKED_MONTH_ERROR]: true } : null)),
      catchError(() => of(null))
    );
  };
}

/** 休業期間フォームの開始日〜終了日に確定済み月が含まれるかを非同期検証する */
export function createLeavePeriodLockAsyncValidator(
  monthlyLockService: MonthlyLockService
): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const startDate = String(control.get('startDate')?.value ?? '').trim();
    const endDate = String(control.get('endDate')?.value ?? '').trim();

    if (!ISO_DATE_PATTERN.test(startDate) || !ISO_DATE_PATTERN.test(endDate) || startDate > endDate) {
      return of(null);
    }

    return from(monthlyLockService.hasLockedMonthInDateRange(startDate, endDate)).pipe(
      map((locked) => (locked ? { [LEAVE_PERIOD_HAS_LOCKED_MONTH_ERROR]: true } : null)),
      catchError(() => of(null))
    );
  };
}
