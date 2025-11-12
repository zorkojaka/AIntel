import React, { useState } from 'react';
import CoreLayout from './CoreLayout';
import { CRMPage } from '@aintel/module-crm';
import { ProjectsPage } from '@aintel/module-projects';
import { CenikPage } from '@aintel/module-cenik';

const moduleComponents: Record<'crm' | 'projects' | 'cenik', React.ReactNode> = {
  crm: <CRMPage />,
  projects: <ProjectsPage />,
  cenik: <CenikPage />
};

function App() {
  const [activeModule, setActiveModule] = useState<'crm' | 'projects' | 'cenik'>('cenik');

  return (
    <CoreLayout activeModule={activeModule} onModuleChange={setActiveModule}>
      {moduleComponents[activeModule]}
    </CoreLayout>
  );
}

export default App;
