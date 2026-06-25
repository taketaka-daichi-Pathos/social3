/** Firebase / Firestore のエラーをユーザー向けメッセージに変換する */
export function toFirestoreErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (
    code === 'permission-denied' ||
    message.includes('Missing or insufficient permissions') ||
    message.includes('PERMISSION_DENIED')
  ) {
    return 'データベースのアクセス権限がありません。Firebaseのセキュリティルールを確認してください。';
  }

  if (code === 'unauthenticated') {
    return 'ログインが必要です。再度ログインしてください。';
  }

  if (message) {
    return message;
  }

  return fallback;
}
