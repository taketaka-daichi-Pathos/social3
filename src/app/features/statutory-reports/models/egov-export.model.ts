import { CompanySettings } from '@features/settings/models/company-settings.model';

/** e-Gov CSV 出力で参照する会社マスタ（CompanySettings のエイリアス） */
export type Company = CompanySettings;

export interface EgovShikakuShutokuExportOptions {
  /** 作成年月日（YYYYMMDD）。未指定時は当日 */
  creationDate?: string;
  /** 媒体連番（3桁）。未指定時は '001' */
  mediaSeq?: string;
  /** ダウンロードファイル名。未指定時は SHFD0006.csv */
  filename?: string;
}

/** 資格取得届・資格喪失届など e-Gov CSV 出力の共通オプション */
export type EgovCsvExportOptions = EgovShikakuShutokuExportOptions;

/** 算定基礎届の1か月分給与実績 */
export interface SanteiMonthRecord {
  /** 給与支給月（例: '04', '05', '06'） */
  paymentMonth: string;
  /** 給与計算の基礎日数 */
  baseDays: number;
  /** 通貨によるものの額 */
  currencyAmount: number;
  /** 現物によるものの額 */
  kindAmount: number;
}

/** 算定基礎届（2222700）出力用の4〜6月給与実績 */
export interface SanteiData {
  /** 算定基礎の対象年（4〜6月が属する暦年） */
  targetYear: number;
  /** 4月・5月・6月の給与実績（この順序固定） */
  months: [SanteiMonthRecord, SanteiMonthRecord, SanteiMonthRecord];
  /** 適用年月（YYYY-MM）。未指定時は targetYear 年 9 月 */
  applicationMonth?: string;
  /** 従前の標準報酬月額（健保）。未指定時は employee.healthStandardRemuneration */
  previousHealthStandardRemuneration?: number;
  /** 従前の標準報酬月額（厚年）。未指定時は employee.pensionStandardRemuneration */
  previousPensionStandardRemuneration?: number;
  /** 従前の改定月（YYYY-MM）。未指定時は employee.applicableStartMonth */
  previousRevisionMonth?: string | null;
  /** 修正平均額（該当時のみ） */
  correctedAverageAmount?: number | null;
  /** 昇(降)給月（MM） */
  salaryChangeMonth?: string | null;
  /** 昇(降)給区分 */
  salaryChangeCategory?: string | null;
  /** 遡及支払月（MM） */
  retroactivePaymentMonth?: string | null;
  /** 遡及支払額 */
  retroactivePaymentAmount?: number | null;
}

/** 月額変更届（2221703）の1か月分給与実績 */
export interface GeppenMonthRecord {
  /** 給与支給月（例: '06', '07', '08'） */
  paymentMonth: string;
  /** 給与計算の基礎日数 */
  baseDays: number;
  /** 通貨によるものの額 */
  currencyAmount: number;
  /** 現物によるものの額 */
  kindAmount: number;
}

/** 月額変更届（2221703）出力用データ */
export interface GeppenData {
  /** 改定年月（適用開始月） */
  revisionDate: Date;
  /** 改定年月の前三ヶ月・前二ヶ月・前一ヶ月の給与実績（この順序固定） */
  months: [GeppenMonthRecord, GeppenMonthRecord, GeppenMonthRecord];
  /** 従前の標準報酬月額（健保）。未指定時は employee.healthStandardRemuneration */
  previousHealthStandardRemuneration?: number;
  /** 従前の標準報酬月額（厚年）。未指定時は employee.pensionStandardRemuneration */
  previousPensionStandardRemuneration?: number;
  /** 従前の改定月（YYYY-MM） */
  previousRevisionMonth?: string | null;
  /** 修正平均額（該当時のみ） */
  correctedAverageAmount?: number | null;
  /** 昇(降)給月（MM） */
  salaryChangeMonth?: string | null;
  /** 昇(降)給区分 */
  salaryChangeCategory?: string | null;
  /** 遡及支払月（MM） */
  retroactivePaymentMonth?: string | null;
  /** 遡及支払額 */
  retroactivePaymentAmount?: number | null;
  /** 70歳以上被用者届のみ提出フラグ */
  over70EmployeeOnlyFlag?: string | null;
}

/** 賞与支払届（2227700）出力用データ */
export interface SyouyoData {
  /** 賞与支払年月日 */
  paymentDate: Date;
  /** 通貨によるものの額 */
  currencyAmount: number;
  /** 現物によるものの額 */
  kindAmount: number;
  /** 合計額 */
  totalAmount: number;
  /** 70歳以上被用者届のみ提出フラグ */
  over70EmployeeOnlyFlag?: string | null;
}

/** 産前産後休業取得者申出書／変更（終了）届（2227708）出力用データ */
export interface MaternityLeaveData {
  /** 出産予定年月日 */
  expectedDeliveryDate: Date;
  /** 出産種別（'1': 単胎, '2': 多胎） */
  deliveryType: string;
  /** 産前産後休業開始年月日 */
  leaveStartDate: Date;
  /** 産前産後休業終了予定年月日 */
  expectedLeaveEndDate: Date;
  /** 実際の出産年月日（変更届等） */
  actualDeliveryDate?: Date;
  /** 変更・終了届かどうか */
  isChangeOrEnd?: boolean;
  /** 変更後出産予定年月日 */
  changedExpectedDeliveryDate?: Date;
  /** 変更後休業終了予定年月日 */
  changedExpectedLeaveEndDate?: Date;
  /** 休業終了年月日（終了届） */
  leaveEndDate?: Date;
}

/** 育児休業等取得者申出書用：養育する子 */
export interface ChildcareLeaveChild {
  nameKana: string;
  nameKanji: string;
  birthDate: Date;
}

/** 育児休業等取得者申出書／終了届（2227709）出力用データ */
export interface ChildcareLeaveData {
  leaveStartDate: Date;
  expectedLeaveEndDate: Date;
  children: ChildcareLeaveChild[];
  isExtension?: boolean;
  isTermination?: boolean;
  actualEndDate?: Date;
}
