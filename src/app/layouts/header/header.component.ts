import { Component, output } from '@angular/core';

@Component({
  selector: 'app-header',
  standalone: true,
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly logout = output<void>();

  onLogout(): void {
    this.logout.emit();
  }
}
