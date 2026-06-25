export interface MainNavItem {
  label: string;
  route: string;
}

export interface ActionButtonConfig {
  label: string;
  icon: string;
  variant: 'outline' | 'success' | 'danger' | 'primary-dark';
}

export interface PayrollSubNavItem {
  label: string;
  id: 'monthly' | 'bonus';
}
