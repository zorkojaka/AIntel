import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FolderKanban, LayoutGrid, List, Menu, Settings, User, Users, Wallet } from 'lucide-react';
import {
  MOBILE_TOPBAR_CLEAR_EVENT,
  MOBILE_TOPBAR_SET_EVENT,
  type MobileTopbarAction,
  type MobileTopbarConfig,
} from '@aintel/shared/utils/mobileTopbar';
import './CoreLayout.css';

type ModuleNavItem = {
  label: string;
  path?: string;
  icon?: string;
};

type ModuleManifest = {
  id: string;
  name: string;
  navItems: ModuleNavItem[];
};

interface CoreLayoutProps {
  children: React.ReactNode;
  modules: ModuleManifest[];
  activeModule: string;
  onModuleChange: (moduleId: string) => void;
  logoUrl?: string | null;
  onLogout?: () => void;
  userInfo?: {
    name: string;
    secondary?: string | null;
  } | null;
}

const iconMap: Record<string, React.ReactNode> = {
  users: <Users size={16} />,
  user: <User size={16} />,
  'folder-kanban': <FolderKanban size={16} />,
  'layout-grid': <LayoutGrid size={16} />,
  list: <List size={16} />,
  wallet: <Wallet size={16} />,
  settings: <Settings size={16} />,
};

const CoreLayout: React.FC<CoreLayoutProps> = ({
  children,
  modules,
  activeModule,
  onModuleChange,
  logoUrl,
  onLogout,
  userInfo,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [mobileTopbarConfig, setMobileTopbarConfig] = useState<MobileTopbarConfig | null>(null);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [activeModule]);

  useEffect(() => {
    setMobileTopbarConfig(null);
  }, [activeModule]);

  useEffect(() => {
    const handleSet = (event: Event) => {
      const customEvent = event as CustomEvent<MobileTopbarConfig>;
      setMobileTopbarConfig(customEvent.detail ?? null);
    };

    const handleClear = () => {
      setMobileTopbarConfig(null);
    };

    window.addEventListener(MOBILE_TOPBAR_SET_EVENT, handleSet as EventListener);
    window.addEventListener(MOBILE_TOPBAR_CLEAR_EVENT, handleClear);

    return () => {
      window.removeEventListener(MOBILE_TOPBAR_SET_EVENT, handleSet as EventListener);
      window.removeEventListener(MOBILE_TOPBAR_CLEAR_EVENT, handleClear);
    };
  }, []);

  const mobileTopbarTitle = useMemo(
    () => mobileTopbarConfig?.title ?? modules.find((item) => item.id === activeModule)?.name ?? 'AIntel',
    [activeModule, mobileTopbarConfig?.title, modules],
  );

  const mobileTopbarActions = mobileTopbarConfig?.actions ?? [];
  const mobileTopbarLeadingAction = mobileTopbarConfig?.leadingAction;

  const renderMobileAction = (action: MobileTopbarAction) => (
    action.variant === 'badge' ? (
      <span key={action.id} className="core-shell__topbar-badge" aria-label={action.ariaLabel ?? action.label}>
        {action.label}
      </span>
    ) : (
      <button
        key={action.id}
        type="button"
        className={`core-shell__topbar-action core-shell__topbar-action--${action.variant ?? 'ghost'}`}
        onClick={action.onClick}
        disabled={action.disabled}
        aria-label={action.ariaLabel ?? action.label}
      >
        {action.label}
      </button>
    )
  );

  return (
    <div className="core-shell">
      <header className="core-shell__topbar">
        {mobileTopbarLeadingAction?.kind === 'back' ? (
          <button
            type="button"
            className="core-shell__menu-toggle"
            aria-label={mobileTopbarLeadingAction.ariaLabel ?? 'Nazaj'}
            onClick={mobileTopbarLeadingAction.onClick}
          >
            <ArrowLeft size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="core-shell__menu-toggle"
            aria-label={mobileTopbarLeadingAction?.ariaLabel ?? 'Odpri meni'}
            aria-expanded={isMobileSidebarOpen}
            aria-controls="core-shell-sidebar"
            onClick={mobileTopbarLeadingAction?.onClick ?? (() => setIsMobileSidebarOpen((prev) => !prev))}
          >
            <Menu size={18} />
          </button>
        )}
        <span className="core-shell__topbar-title">{mobileTopbarTitle}</span>
        <div className="core-shell__topbar-actions">
          {mobileTopbarActions.map(renderMobileAction)}
        </div>
      </header>
      <aside id="core-shell-sidebar" className="core-shell__sidebar" data-open={isMobileSidebarOpen}>
      {logoUrl ? <img src={logoUrl} alt="Logo podjetja" className="core-shell__logo" /> : <h2>AIntel</h2>}
      <ul>
        {modules.map((item) => {
          const navItem = item.navItems[0];
          const icon = navItem?.icon ? iconMap[navItem.icon] : null;
          const label = navItem?.label ?? item.name;
          const shouldRenderUserInfo = label === 'STRANKE' && !!userInfo;
          return (
            <React.Fragment key={item.id}>
              {shouldRenderUserInfo ? (
                <li className="core-shell__user">
                  <div className="core-shell__user-name">{userInfo?.name}</div>
                  {userInfo?.secondary ? (
                    <div className="core-shell__user-secondary">{userInfo.secondary}</div>
                  ) : null}
                </li>
              ) : null}
              <li>
                <button
                  type="button"
                  data-active={item.id === activeModule}
                  onClick={() => onModuleChange(item.id)}
                >
                  {icon ? <span className="core-shell__nav-icon">{icon}</span> : null}
                  <span>{label}</span>
                </button>
              </li>
            </React.Fragment>
          );
        })}
      </ul>
      {onLogout ? (
        <button type="button" className="core-shell__logout" onClick={onLogout}>
          Odjava
        </button>
      ) : null}
      </aside>
      {isMobileSidebarOpen ? <button className="core-shell__backdrop" type="button" onClick={() => setIsMobileSidebarOpen(false)} /> : null}
      <main className="core-shell__content">{children}</main>
    </div>
  );
};

export default CoreLayout;
