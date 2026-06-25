import { CompanySettings } from '@features/settings/models/company-settings.model';

/** Firestore `companies` コレクションのドキュメント */
export interface CompanyDocument extends CompanySettings {
  email: string;
  ownerUid: string;
  /** 旧フィールド（所在地一括）。読み込み時の互換用 */
  address?: string;
}
