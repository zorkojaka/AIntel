import React, { useState } from 'react';
import CoreLayout from './CoreLayout';
import { CRMPage } from '@aintel/module-crm';
import { ProjectsPage } from '@aintel/module-projects';
import { CenikPage } from '@aintel/module-cenik';
import { SettingsPage } from '@aintel/module-settings';
import { FinancePage } from '@aintel/module-finance';

const moduleComponents = {
  settings: <SettingsPage />,
  crm: <CRMPage />,
  projects: <ProjectsPage />,
  cenik: <CenikPage />,
  finance: <FinancePage />
};

type ModuleId = keyof typeof moduleComponents;

function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('settings');

  return (
    <CoreLayout activeModule={activeModule} onModuleChange={setActiveModule}>
      {moduleComponents[activeModule]}
    </CoreLayout>
  );
}

export default App;
