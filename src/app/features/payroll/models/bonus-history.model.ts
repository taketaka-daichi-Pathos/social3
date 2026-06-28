export interface BonusHistoryEntry {
  id: string;
  paymentMonth: string;
  paymentDate: string;
  fixedWagesAtPayment: number;
  bonusAmount: number;
  standardBonusAmount: number;
  savedAt: string;
}

export interface BonusHistoryDisplayRow extends BonusHistoryEntry {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
}
