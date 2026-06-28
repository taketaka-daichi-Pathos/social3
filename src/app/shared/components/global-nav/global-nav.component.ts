import { Component, DestroyRef, inject, input, OnInit, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AdminTodoService } from '@core/services/admin-todo.service';
import { EmployeeSessionService } from '@core/services/employee-session.service';
import { MainNavItem } from '../../models/nav.model';

@Component({
  selector: 'app-global-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './global-nav.component.html',
  styleUrl: './global-nav.component.scss',
})
export class GlobalNavComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly sessionService = inject(EmployeeSessionService);
  private readonly adminTodoService = inject(AdminTodoService);

  readonly items = input.required<MainNavItem[]>();
  readonly itemSelected = output<MainNavItem>();

  ngOnInit(): void {
    void this.startAdminTodoBadgeWatching();
  }

  showBadge(item: MainNavItem): boolean {
    return this.adminTodoService.hasBadgeForTab(item.adminTodoTargetTab);
  }

  private async startAdminTodoBadgeWatching(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || !(await this.sessionService.isCompanyAdmin(user.uid))) {
      return;
    }

    this.adminTodoService.ensureWatching(user.uid);
  }
}
