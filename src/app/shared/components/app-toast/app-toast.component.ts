import { Component, inject } from '@angular/core';
import { ToastService } from '@shared/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  templateUrl: './app-toast.component.html',
  styleUrl: './app-toast.component.scss',
})
export class AppToastComponent {
  readonly toast = inject(ToastService);
}
