import React from 'react';
import './CoreLayout.css';

export interface ModuleManifest {
  id: string;
  name?: string;
  navItems?: Array<{ label?: string }>;
}

interface CoreLayoutProps {
  children: React.ReactNode;
  modules: ModuleManifest[];
  activeModule: string;
  onModuleSelect: (id: string) => void;
}

const CoreLayout: React.FC<CoreLayoutProps> = ({
  children,
  modules,
  activeModule,
  onModuleSelect
}) => (
  <div className="core-shell">
    <aside className="core-shell__sidebar">
      <h2>AIntel</h2>
      <ul>
        {modules.map((module) => (
          <li key={module.id}>
            <button
              type="button"
              className={`core-shell__nav-button ${
                activeModule === module.id ? 'core-shell__nav-button--active' : ''
              }`}
              onClick={() => onModuleSelect(module.id)}
            >
              {module.navItems?.[0]?.label ?? module.name ?? module.id}
            </button>
          </li>
        ))}
      </ul>
    </aside>
    <main className="core-shell__content">{children}</main>
  </div>
);

export default CoreLayout;
