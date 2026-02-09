import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@aintel/ui';
import type { DashboardWidgetId, InstallerDashboardResponse } from './types';
import { useDashboardLayout } from './hooks/useDashboardLayout';
import { useInstallerDashboardData } from './hooks/useInstallerDashboardData';

const DEFAULT_AUTH = {
  userId: null as string | null,
  employeeId: null as string | null,
};

const widgetLabels: Record<DashboardWidgetId, string> = {
  'upcoming-projects': 'Prihajajoči projekti (potrjena ponudba)',
  'material-orders': 'Moja naročila za material',
  'work-orders': 'Moji delovni nalogi',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleDateString('sl-SI');
}

function navigateToProject(projectId: string, tab?: string) {
  const params = new URLSearchParams();
  params.set('projectId', projectId);
  if (tab) {
    params.set('tab', tab);
  }
  window.location.assign(`/projects?${params.toString()}`);
}

function showMetaParts(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(' • ');
}

function renderEmptyState(message: string) {
  return <p className="dashboard-widget__empty">{message}</p>;
}

function renderError(message: string) {
  return <p className="dashboard-widget__error">{message}</p>;
}

export function DashboardPage() {
  const [auth, setAuth] = useState(DEFAULT_AUTH);
  const [isEditing, setIsEditing] = useState(false);
  const { data, isLoading, error } = useInstallerDashboardData();
  const { visibleWidgets, toggleWidget } = useDashboardLayout(auth.userId);

  useEffect(() => {
    let active = true;

    const loadAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        const result = await response.json();
        if (!result?.success) {
          return;
        }
        if (!active) {
          return;
        }
        setAuth({
          userId: result?.data?.user?.id ?? null,
          employeeId: result?.data?.employee?.id ?? null,
        });
      } catch {
        if (!active) {
          return;
        }
        setAuth(DEFAULT_AUTH);
      }
    };

    loadAuth();

    return () => {
      active = false;
    };
  }, []);

  const widgetList = useMemo(
    () =>
      (Object.keys(widgetLabels) as DashboardWidgetId[]).map((id) => ({
        id,
        label: widgetLabels[id],
      })),
    [],
  );

  const renderUpcomingProjects = (payload: InstallerDashboardResponse) => {
    if (isLoading) {
      return renderEmptyState('Nalagam projekte...');
    }
    if (error) {
      return renderError(error);
    }
    if (!payload.upcomingConfirmedProjects.length) {
      return renderEmptyState('Ni potrjenih projektov.');
    }

    return (
      <ul className="dashboard-widget__list">
        {payload.upcomingConfirmedProjects.slice(0, 10).map((project) => (
          <li key={project.id} className="dashboard-widget__item">
            <div>
              <div className="dashboard-widget__title">{project.code ?? project.id}</div>
              <div className="dashboard-widget__meta">
                {showMetaParts([project.customerName, project.customerAddress ?? undefined])}
              </div>
              <div className="dashboard-widget__meta">
                {showMetaParts([
                  project.confirmedOfferVersionLabel
                    ? `Ponudba: ${project.confirmedOfferVersionLabel}`
                    : project.confirmedOfferVersionId
                      ? `Ponudba: ${project.confirmedOfferVersionId}`
                      : 'Ponudba ni označena',
                ])}
              </div>
              <div className="dashboard-widget__meta">
                {showMetaParts([
                  `Ustvarjeno: ${formatDate(project.createdAt)}`,
                  `Posodobljeno: ${formatDate(project.updatedAt)}`,
                ])}
              </div>
            </div>
            <Button variant="ghost" onClick={() => navigateToProject(project.id)}>
              Odpri projekt
            </Button>
          </li>
        ))}
      </ul>
    );
  };

  const renderMaterialOrders = (payload: InstallerDashboardResponse) => {
    if (isLoading) {
      return renderEmptyState('Nalagam naročila...');
    }
    if (error) {
      return renderError(error);
    }
    if (!payload.myMaterialOrders.length) {
      return renderEmptyState('Ni materialnih naročil.');
    }

    return (
      <ul className="dashboard-widget__list">
        {payload.myMaterialOrders.slice(0, 10).map((order) => (
          <li key={order.id} className="dashboard-widget__item">
            <div>
              <div className="dashboard-widget__title">{order.projectCode}</div>
              <div className="dashboard-widget__meta">
                {showMetaParts([`Status: ${order.materialStatus}`, `Postavke: ${order.itemCount}`])}
              </div>
              <div className="dashboard-widget__meta">{`Ustvarjeno: ${formatDate(order.createdAt)}`}</div>
            </div>
            <Button variant="ghost" onClick={() => navigateToProject(order.projectId, 'logistics')}>
              Odpri logistiko
            </Button>
          </li>
        ))}
      </ul>
    );
  };

  const renderWorkOrders = (payload: InstallerDashboardResponse) => {
    if (isLoading) {
      return renderEmptyState('Nalagam delovne naloge...');
    }
    if (error) {
      return renderError(error);
    }
    if (!payload.myWorkOrders.length) {
      return renderEmptyState('Ni delovnih nalogov.');
    }

    return (
      <ul className="dashboard-widget__list">
        {payload.myWorkOrders.slice(0, 10).map((order) => (
          <li key={order.id} className="dashboard-widget__item">
            <div>
              <div className="dashboard-widget__title">{order.projectCode}</div>
              <div className="dashboard-widget__meta">
                {showMetaParts([
                  order.scheduledAt ? `Termin: ${formatDate(order.scheduledAt)}` : 'Termin ni določen',
                  `Status: ${order.status}`,
                ])}
              </div>
              <div className="dashboard-widget__meta">
                {showMetaParts([`Postavke: ${order.itemCount}`, `Ustvarjeno: ${formatDate(order.createdAt)}`])}
              </div>
            </div>
            <Button variant="ghost" onClick={() => navigateToProject(order.projectId, 'execution')}>
              Odpri delovni nalog
            </Button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1>Nadzorna plošča</h1>
          <p>Dobrodošli na domači strani monterja.</p>
        </div>
        <Button variant="ghost" onClick={() => setIsEditing((prev) => !prev)}>
          {isEditing ? 'Zapri' : 'Uredi'}
        </Button>
      </div>

      {isEditing ? (
        <div className="dashboard-editor">
          <p>Izberi pripomočke za prikaz:</p>
          <div className="dashboard-editor__list">
            {widgetList.map((widget) => (
              <label key={widget.id} className="dashboard-editor__item">
                <input
                  type="checkbox"
                  checked={visibleWidgets.includes(widget.id)}
                  onChange={() => toggleWidget(widget.id)}
                />
                <span>{widget.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="dashboard-grid">
        {visibleWidgets.includes('upcoming-projects') ? (
          <Card title={widgetLabels['upcoming-projects']}>
            {renderUpcomingProjects(data)}
            <div className="dashboard-widget__footer">
              <Button variant="ghost" onClick={() => window.location.assign('/projects')}>
                Pokaži vse
              </Button>
            </div>
          </Card>
        ) : null}
        {visibleWidgets.includes('material-orders') ? (
          <Card title={widgetLabels['material-orders']}>
            {renderMaterialOrders(data)}
            <div className="dashboard-widget__footer">
              <Button variant="ghost" onClick={() => window.location.assign('/projects')}>
                Pokaži vse
              </Button>
            </div>
          </Card>
        ) : null}
        {visibleWidgets.includes('work-orders') ? (
          <Card title={widgetLabels['work-orders']}>
            {renderWorkOrders(data)}
            <div className="dashboard-widget__footer">
              <Button variant="ghost" onClick={() => window.location.assign('/projects')}>
                Pokaži vse
              </Button>
            </div>
          </Card>
        ) : null}
      </div>

      {!auth.employeeId ? (
        <p className="dashboard-hint">Podatki so vezani na prijavljenega zaposlenega.</p>
      ) : null}
    </div>
  );
}
