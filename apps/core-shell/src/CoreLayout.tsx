import React from 'react';
import { manifest as crmManifest } from '@aintel/module-crm';
import { manifest as projectsManifest } from '@aintel/module-projects';
import { manifest as financeManifest } from '@aintel/module-finance';
import './CoreLayout.css';

const modules = [crmManifest, projectsManifest, financeManifest] as const;

type ModuleId = typeof modules[number]['id'];

interface CoreLayoutProps extends React.PropsWithChildren {
  activeModule: ModuleId;
  onModuleChange: (moduleId: ModuleId) => void;
}

const CoreLayout: React.FC<CoreLayoutProps> = ({ children, activeModule, onModuleChange }) => (
  <div className="core-shell">
    <aside className="core-shell__sidebar">
      <h2>AIntel</h2>
      <ul>
        {modules.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              data-active={item.id === activeModule}
              onClick={() => onModuleChange(item.id)}
            >
              {item.navItems[0]?.label ?? item.name}
            </button>
          </li>
        ))}
      </ul>
    </aside>
    <main className="core-shell__content">{children}</main>
  </div>
);

export default CoreLayout;
