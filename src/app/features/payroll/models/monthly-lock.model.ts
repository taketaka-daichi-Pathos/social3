export interface MonthlyLock {
  targetMonth: string;
  isLocked: boolean;
  lockedAt: string | null;
  lockedBy: string;
}

export interface MonthlyLockDocument {
  targetMonth: string;
  isLocked: boolean;
  lockedAt?: unknown;
  lockedBy?: string;
}
