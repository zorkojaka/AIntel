import React, { useMemo, useState } from 'react';
import CoreLayout from './CoreLayout';
import { CRMPage, manifest as crmManifest } from '@aintel/module-crm';
import { ProjectsPage, manifest as projectsManifest } from '@aintel/module-projects';

const moduleRegistry = [
  { manifest: projectsManifest, Component: ProjectsPage },
  { manifest: crmManifest, Component: CRMPage }
];

function App() {
  const [activeModule, setActiveModule] = useState(moduleRegistry[0].manifest.id);
  const activeEntry = useMemo(
    () => moduleRegistry.find((entry) => entry.manifest.id === activeModule),
    [activeModule]
  );

  const ActiveComponent = activeEntry?.Component;

  return (
    <CoreLayout
      modules={moduleRegistry.map((entry) => entry.manifest)}
      activeModule={activeModule}
      onModuleSelect={setActiveModule}
    >
      {ActiveComponent ? <ActiveComponent /> : null}
    </CoreLayout>
  );
}

export default App;
