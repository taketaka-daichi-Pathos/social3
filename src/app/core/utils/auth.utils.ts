import { Auth, authState, User } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

/** Firebase Auth の初期化完了を待ち、ログイン済みユーザーを返す */
export async function requireAuthenticatedUser(auth: Auth): Promise<User> {
  const user = await firstValueFrom(authState(auth).pipe(take(1)));

  if (!user) {
    throw new Error('ログインしていません');
  }

  return user;
}

/** 認証状態が確定するまで待つ（ユーザーがいなくても resolve する） */
export function waitForAuthState(auth: Auth) {
  return firstValueFrom(authState(auth).pipe(take(1)));
}
