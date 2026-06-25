import { Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MainNavItem } from '../../models/nav.model';

@Component({
  selector: 'app-global-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './global-nav.component.html',
  styleUrl: './global-nav.component.scss',
})
export class GlobalNavComponent {
  readonly items = input.required<MainNavItem[]>();
  readonly itemSelected = output<MainNavItem>();
}
