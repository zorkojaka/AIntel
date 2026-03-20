import React, { useEffect, useState } from 'react';
import { FolderKanban, LayoutGrid, List, Settings, User, Users, Wallet } from 'lucide-react';
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

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [activeModule]);

  return (
    <div className="core-shell">
      <header className="core-shell__topbar">
        <button
          type="button"
          className="core-shell__menu-toggle"
          aria-expanded={isMobileSidebarOpen}
          aria-controls="core-shell-sidebar"
          onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
        >
          ☰
        </button>
        <span className="core-shell__topbar-title">{modules.find((item) => item.id === activeModule)?.name ?? 'AIntel'}</span>
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
