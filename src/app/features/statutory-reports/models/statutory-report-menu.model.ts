export interface StatutoryReportMenuItem {
  id: string;
  order: string;
  primaryTitle: string;
  /** 併記する副タイトル（空の場合は表示しない） */
  secondaryTitle?: string;
  actionLabel: string;
}

export const STATUTORY_REPORT_MENU_ITEMS: StatutoryReportMenuItem[] = [
  {
    id: 'shikaku-shutoku',
    order: '①',
    primaryTitle: '健康保険・厚生年金保険 被保険者資格取得届',
    secondaryTitle: '厚生年金保険70歳以上被用者該当届',
    actionLabel: '対象者選択',
  },
  {
    id: 'shikaku-soshitsu',
    order: '②',
    primaryTitle: '健康保険・厚生年金保険 被保険者資格喪失届',
    secondaryTitle: '厚生年金保険70歳以上被用者不該当届',
    actionLabel: '対象者選択',
  },
  {
    id: 'santei-kiso',
    order: '③',
    primaryTitle: '健康保険・厚生年金保険 被保険者標準報酬月額算定基礎届',
    secondaryTitle: '厚生年金保険70歳以上被用者算定基礎届',
    actionLabel: '出力する',
  },
  {
    id: 'getsugaku-henko',
    order: '④',
    primaryTitle: '健康保険・厚生年金保険 被保険者標準報酬月額変更届',
    secondaryTitle: '厚生年金保険70歳以上被用者月額変更届',
    actionLabel: '出力する',
  },
  {
    id: 'shoyo-shiharai',
    order: '⑤',
    primaryTitle: '健康保険・厚生年金保険 被保険者賞与支払届',
    secondaryTitle: '厚生年金保険70歳以上被用者賞与支払届',
    actionLabel: '出力する',
  },
  {
    id: 'fuyo-ido',
    order: '⑥',
    primaryTitle: '健康保険 被扶養者（異動）届／国民年金第３号被保険者関係届',
    actionLabel: '対象者選択',
  },
  {
    id: 'sankyu-shinsei',
    order: '⑦',
    primaryTitle: '健康保険・厚生年金保険 産前産後休業取得者申出書',
    secondaryTitle: '変更（終了）届',
    actionLabel: '対象者選択',
  },
  {
    id: 'ikuji-shinsei',
    order: '⑧',
    primaryTitle: '健康保険・厚生年金保険 育児休業等取得者申出書(新規・延長)',
    secondaryTitle: '終了届',
    actionLabel: '対象者選択',
  },
];
