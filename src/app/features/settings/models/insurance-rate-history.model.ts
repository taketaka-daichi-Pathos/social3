/** 会社独自の社会保険料率変更履歴（適用開始月単位） */
export interface InsuranceRateHistoryEntry {
  id: string;
  applicableMonth: string;
  healthInsuranceRate: number;
  careInsuranceRate: number;
  updatedAt: Date | null;
}

export interface InsuranceRateHistoryInput {
  applicableMonth: string;
  healthInsuranceRate: number;
  careInsuranceRate: number;
}
