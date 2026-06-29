import { inject, Injectable } from '@angular/core';
import { Auth, signOut } from '@angular/fire/auth';
import { AppStateResetService } from '@core/services/app-state-reset.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly appStateReset = inject(AppStateResetService);

  /** ログアウト: ストレージ消去 → サービス状態リセット → サインアウト → フルリロード */
  async logout(): Promise<void> {
    this.appStateReset.clearBrowserStorage();
    this.appStateReset.resetAllServiceState();

    try {
      await signOut(this.auth);
    } catch (error) {
      console.error('[AuthService] signOut failed', error);
    }

    window.location.href = '/login';
  }

  /** 新規会社登録画面向け: 前セッションの状態が残っていれば初期化する */
  ensureCleanStateForRegistration(): void {
    if (this.auth.currentUser != null || this.appStateReset.hasResidualApplicationState()) {
      this.appStateReset.clearBrowserStorage();
      this.appStateReset.resetAllServiceState();
    }
  }
}
