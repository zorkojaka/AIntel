import React from 'react';
import { Users } from 'lucide-react';
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
}

const iconMap: Record<string, React.ReactNode> = {
  users: <Users size={16} />,
};

const CoreLayout: React.FC<CoreLayoutProps> = ({ children, modules, activeModule, onModuleChange }) => (
  <div className="core-shell">
    <aside className="core-shell__sidebar">
      <h2>AIntel</h2>
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
    </aside>
    <main className="core-shell__content">{children}</main>
  </div>
);

export default CoreLayout;
