import { inject } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { CanActivateFn, Router } from '@angular/router';
import { EmployeeSessionService } from '@core/services/employee-session.service';
import { map, switchMap, take } from 'rxjs';
import { from, of } from 'rxjs';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  const sessionService = inject(EmployeeSessionService);

  return authState(auth).pipe(
    take(1),
    switchMap((user) => {
      if (!user) {
        return of(router.createUrlTree(['/login']));
      }

      return from(sessionService.isCompanyAdmin(user.uid)).pipe(
        map((isAdmin) => (isAdmin ? true : router.createUrlTree(['/employee/dashboard'])))
      );
    })
  );
};

/** 従業員ログイン・管理者ログインのいずれでもアクセス可能 */
export const employeeGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  return authState(auth).pipe(
    take(1),
    map((user) => (user ? true : router.createUrlTree(['/login'])))
  );
};
