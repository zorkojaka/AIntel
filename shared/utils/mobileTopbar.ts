export type MobileTopbarAction = {
  id: string;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'badge';
  disabled?: boolean;
  ariaLabel?: string;
};

export type MobileTopbarLeadingAction = {
  kind?: 'menu' | 'back';
  onClick?: () => void;
  ariaLabel?: string;
};

export type MobileTopbarConfig = {
  title?: string | null;
  leadingAction?: MobileTopbarLeadingAction;
  actions?: MobileTopbarAction[];
};

export const MOBILE_TOPBAR_SET_EVENT = 'aintel:mobile-topbar:set';
export const MOBILE_TOPBAR_CLEAR_EVENT = 'aintel:mobile-topbar:clear';

export function setMobileTopbar(config: MobileTopbarConfig) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MobileTopbarConfig>(MOBILE_TOPBAR_SET_EVENT, {
      detail: config,
    }),
  );
}

export function clearMobileTopbar() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(MOBILE_TOPBAR_CLEAR_EVENT));
}
