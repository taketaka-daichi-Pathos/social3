import { Component, input, output } from '@angular/core';

export interface SubNavItem {
  label: string;
  id: string;
  /** 未処理の要対応者がいる場合に赤丸バッジを表示 */
  showBadge?: boolean;
  /** バッジ表示時のホバーツールチップ（title属性） */
  badgeTooltip?: string;
}

@Component({
  selector: 'app-sub-nav',
  standalone: true,
  templateUrl: './sub-nav.component.html',
  styleUrl: './sub-nav.component.scss',
})
export class SubNavComponent {
  readonly items = input.required<SubNavItem[]>();
  readonly activeId = input.required<string>();
  readonly itemSelected = output<SubNavItem>();

  onSelect(item: SubNavItem): void {
    this.itemSelected.emit(item);
  }
}
