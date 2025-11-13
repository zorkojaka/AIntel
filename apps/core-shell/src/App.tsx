import React, { useState } from 'react';
import CoreLayout from './CoreLayout';
import { CRMPage } from '@aintel/module-crm';
import { ProjectsPage } from '@aintel/module-projects';
import { CenikPage } from '@aintel/module-cenik';
import { SettingsPage } from '@aintel/module-settings';

const moduleComponents: Record<'settings' | 'crm' | 'projects' | 'cenik', React.ReactNode> = {
  settings: <SettingsPage />,
  crm: <CRMPage />,
  projects: <ProjectsPage />,
  cenik: <CenikPage />
};

function App() {
  const [activeModule, setActiveModule] = useState<'settings' | 'crm' | 'projects' | 'cenik'>('settings');

  return (
    <CoreLayout activeModule={activeModule} onModuleChange={setActiveModule}>
      {moduleComponents[activeModule]}
    </CoreLayout>
  );
}

export default App;
