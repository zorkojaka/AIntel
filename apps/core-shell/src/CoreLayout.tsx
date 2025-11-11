import React from 'react';
import { manifest as crmManifest } from '@aintel/module-crm';
import './CoreLayout.css';

const modules = [crmManifest];

const CoreLayout: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="core-shell">
    <aside className="core-shell__sidebar">
      <h2>AIntel</h2>
      <ul>
        {modules.map((item) => (
          <li key={item.id}>{item.navItems[0]?.label ?? item.id}</li>
        ))}
      </ul>
    </aside>
    <main className="core-shell__content">{children}</main>
  </div>
);

export default CoreLayout;
