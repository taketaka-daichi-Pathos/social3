import { Component, computed, input } from '@angular/core';
import { SocialInsuranceType } from '@features/onboarding/models/employee-registration.model';

type BadgeVariant = 'general' | 'short_time_worker' | 'part_time_special';

@Component({
  selector: 'app-social-insurance-type-badge',
  standalone: true,
  templateUrl: './social-insurance-type-badge.component.html',
  styleUrl: './social-insurance-type-badge.component.scss',
})
export class SocialInsuranceTypeBadgeComponent {
  readonly socialInsuranceType = input<SocialInsuranceType | null | undefined>('general');

  readonly badgeVariant = computed<BadgeVariant>(() => {
    const type = this.socialInsuranceType() ?? 'general';
    if (type === 'short_time_worker') {
      return 'short_time_worker';
    }
    if (type === 'part_time_special') {
      return 'part_time_special';
    }
    return 'general';
  });

  readonly label = computed(() => {
    switch (this.badgeVariant()) {
      case 'short_time_worker':
        return '短時間就労者';
      case 'part_time_special':
        return '短時間労働者';
      default:
        return '一般';
    }
  });
}
