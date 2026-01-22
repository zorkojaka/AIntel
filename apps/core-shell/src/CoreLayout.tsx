import React from 'react';
import { FolderKanban, List, Settings, User, Users, Wallet } from 'lucide-react';
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
}

const iconMap: Record<string, React.ReactNode> = {
  users: <Users size={16} />,
  user: <User size={16} />,
  'folder-kanban': <FolderKanban size={16} />,
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
}) => (
  <div className="core-shell">
    <aside className="core-shell__sidebar">
      {logoUrl ? <img src={logoUrl} alt="Logo podjetja" className="core-shell__logo" /> : <h2>AIntel</h2>}
      <ul>
        {modules.map((item) => {
          const navItem = item.navItems[0];
          const icon = navItem?.icon ? iconMap[navItem.icon] : null;
          return (
            <li key={item.id}>
              <button type="button" data-active={item.id === activeModule} onClick={() => onModuleChange(item.id)}>
                {icon ? <span className="core-shell__nav-icon">{icon}</span> : null}
                <span>{navItem?.label ?? item.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {onLogout ? (
        <button type="button" className="core-shell__logout" onClick={onLogout}>
          Odjava
        </button>
      ) : null}
    </aside>
    <main className="core-shell__content">{children}</main>
  </div>
);

export default CoreLayout;
