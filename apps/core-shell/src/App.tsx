import React, { useState } from 'react';
import CoreLayout from './CoreLayout';
import { CRMPage } from '@aintel/module-crm';
import { ProjectsPage } from '@aintel/module-projects';
import { FinancePage } from '@aintel/module-finance';

const moduleComponents = {
  crm: <CRMPage />,
  projects: <ProjectsPage />,
  finance: <FinancePage />,
};

type ModuleId = keyof typeof moduleComponents;

function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('finance');

  return (
    <CoreLayout activeModule={activeModule} onModuleChange={setActiveModule}>
      {moduleComponents[activeModule]}
    </CoreLayout>
  );
}

export default App;
