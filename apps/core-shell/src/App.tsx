import React, { useEffect, useMemo, useState } from 'react';
import CoreLayout from './CoreLayout';
import { CRMPage } from '@aintel/module-crm';
import { ProjectsPage } from '@aintel/module-projects';
import { CenikPage } from '@aintel/module-cenik';
import { SettingsPage } from '@aintel/module-settings';
import { FinancePage } from '@aintel/module-finance';
import { EmployeesPage } from '@aintel/module-employees';
import { manifest as crmManifest } from '@aintel/module-crm';
import { manifest as projectsManifest } from '@aintel/module-projects';
import { manifest as cenikManifest } from '@aintel/module-cenik';
import { manifest as financeManifest } from '@aintel/module-finance';
import { manifest as settingsManifest } from '@aintel/module-settings';
import { manifest as employeesManifest } from '@aintel/module-employees';

const modules = [crmManifest, projectsManifest, cenikManifest, financeManifest, employeesManifest, settingsManifest];

type ModuleId = (typeof modules)[number]['id'];

function getModuleIdFromPath(pathname: string): ModuleId {
  const match = modules.find((module) => module.routes?.some((route) => pathname.startsWith(route)));
  return (match?.id as ModuleId) ?? 'settings';
}

const moduleComponents: Record<ModuleId, React.ReactNode> = {
  settings: <SettingsPage />,
  crm: <CRMPage />,
  projects: <ProjectsPage />,
  cenik: <CenikPage />,
  finance: <FinancePage />,
  employees: <EmployeesPage />,
};

function App() {
  const initialModule = useMemo(() => getModuleIdFromPath(window.location.pathname), []);
  const [activeModule, setActiveModule] = useState<ModuleId>(initialModule);

  useEffect(() => {
    const handlePopState = () => {
      setActiveModule(getModuleIdFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const navPath = modules.find((module) => module.id === activeModule)?.navItems?.[0]?.path;
    if (navPath && !window.location.pathname.startsWith(navPath)) {
      window.history.replaceState({ moduleId: activeModule }, '', navPath);
    }
  }, [activeModule]);

  const handleModuleChange = (moduleId: ModuleId) => {
    setActiveModule(moduleId);
    const navPath = modules.find((module) => module.id === moduleId)?.navItems?.[0]?.path;
    if (navPath && !window.location.pathname.startsWith(navPath)) {
      window.history.pushState({ moduleId }, '', navPath);
    }
  };

  return (
    <CoreLayout activeModule={activeModule} onModuleChange={handleModuleChange} modules={modules}>
      {moduleComponents[activeModule]}
    </CoreLayout>
  );
}

export default App;
