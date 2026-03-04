import React, { useEffect, useMemo, useState } from 'react';
import CoreLayout from './CoreLayout';
import { CRMPage } from '@aintel/module-crm';
import { ProjectsPage } from '@aintel/module-projects';
import { CenikPage } from '@aintel/module-cenik';
import { SettingsPage, fetchSettings } from '@aintel/module-settings';
import { FinancePage } from '@aintel/module-finance';
import { EmployeesPage } from '@aintel/module-employees';
import { DashboardPage } from '@aintel/module-dashboard';
import { manifest as crmManifest } from '@aintel/module-crm';
import { manifest as projectsManifest } from '@aintel/module-projects';
import { manifest as cenikManifest } from '@aintel/module-cenik';
import { manifest as financeManifest } from '@aintel/module-finance';
import { manifest as settingsManifest } from '@aintel/module-settings';
import { manifest as employeesManifest } from '@aintel/module-employees';
import { manifest as dashboardManifest } from '@aintel/module-dashboard';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { ResetRequestPage } from './auth/ResetRequestPage';
import { ResetPasswordPage } from './auth/ResetPasswordPage';

const modules = [
  dashboardManifest,
  crmManifest,
  projectsManifest,
  cenikManifest,
  financeManifest,
  employeesManifest,
  settingsManifest,
];

type ModuleId = (typeof modules)[number]['id'];

function getModuleIdFromPath(pathname: string): ModuleId {
  const match = modules.find((module) => module.routes?.some((route) => pathname.startsWith(route)));
  return (match?.id as ModuleId) ?? 'settings';
}

const moduleComponents: Record<ModuleId, React.ReactNode> = {
  dashboard: <DashboardPage />,
  settings: <SettingsPage />,
  crm: <CRMPage />,
  projects: <ProjectsPage />,
  cenik: <CenikPage />,
  finance: <FinancePage />,
  employees: <EmployeesPage />,
};

const moduleRoleMap: Partial<Record<ModuleId, string[]>> = {
  finance: ['FINANCE'],
  employees: ['ADMIN'],
  settings: ['ADMIN'],
};

function hasAccess(moduleId: ModuleId, roles: string[]) {
  if (roles.includes('ADMIN')) {
    return true;
  }
  const required = moduleRoleMap[moduleId];
  if (!required || required.length === 0) {
    return true;
  }
  return required.some((role) => roles.includes(role));
}

function AppContent() {
  const { status, me, logout } = useAuth();
  const roles = me?.employee?.roles ?? [];
  const initialModule = useMemo(() => getModuleIdFromPath(window.location.pathname), []);
  const [activeModule, setActiveModule] = useState<ModuleId>(initialModule);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setActiveModule(getModuleIdFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchSettings()
      .then((settings) => {
        if (alive) {
          setLogoUrl(settings.logoUrl?.trim() || null);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const isAuthRoute = ['login', 'forgot-password', 'reset-password'].some((path) =>
    window.location.pathname.startsWith(`/${path}`),
  );

  useEffect(() => {
    if (status !== 'unauthenticated') {
      return;
    }
    if (!isAuthRoute) {
      window.history.replaceState({ moduleId: 'login' }, '', '/login');
    }
  }, [isAuthRoute, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    if (isAuthRoute) {
      const nextModule = modules.find((module) => hasAccess(module.id as ModuleId, roles));
      const navPath = nextModule?.navItems?.[0]?.path;
      if (navPath) {
        window.history.replaceState({ moduleId: nextModule.id }, '', navPath);
        setActiveModule(nextModule.id as ModuleId);
      }
    }
  }, [roles, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    const navPath = modules.find((module) => module.id === activeModule)?.navItems?.[0]?.path;
    if (navPath && !window.location.pathname.startsWith(navPath)) {
      window.history.replaceState({ moduleId: activeModule }, '', navPath);
    }
  }, [activeModule, status]);

  const availableModules = modules.filter((module) => hasAccess(module.id as ModuleId, roles));

  const handleModuleChange = (moduleId: ModuleId) => {
    if (!hasAccess(moduleId, roles)) {
      return;
    }
    setActiveModule(moduleId);
    const navPath = modules.find((module) => module.id === moduleId)?.navItems?.[0]?.path;
    if (navPath && !window.location.pathname.startsWith(navPath)) {
      window.history.pushState({ moduleId }, '', navPath);
    }
  };

  if (status === 'loading') {
    return <div className="auth-page">Nalagam...</div>;
  }

  if (status === 'unauthenticated' || isAuthRoute) {
    if (window.location.pathname.startsWith('/forgot-password')) {
      return <ResetRequestPage />;
    }
    if (window.location.pathname.startsWith('/reset-password')) {
      return <ResetPasswordPage />;
    }
    return <LoginPage />;
  }

  const hasModuleAccess = hasAccess(activeModule, roles);
  const userName = me?.employee?.name?.trim() || me?.user?.email || '';
  const userSecondary =
    me?.user?.email && me?.user?.email !== userName ? me.user.email : (me?.employee?.roles?.[0] ?? null);
  const userInfo = userName ? { name: userName, secondary: userSecondary } : null;

  return (
    <CoreLayout
      activeModule={activeModule}
      onModuleChange={handleModuleChange}
      modules={availableModules}
      logoUrl={logoUrl}
      onLogout={logout}
      userInfo={userInfo}
    >
      {hasModuleAccess ? moduleComponents[activeModule] : <div>Ni dostopa.</div>}
    </CoreLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
