import { useEffect, useMemo, useState } from 'react';
import type { DashboardWidgetDefinition, InstallerDashboardWidgetProps } from '../types';
import { navigateToProject, renderEmptyState } from './utils';
import { useProject } from '../../../module-projects/src/domains/core/useProject';
import { useProjectTimeline, type TimelineStep } from '../../../module-projects/src/domains/core/useProjectTimeline';
 
import { LogisticsPanel } from '../../../module-projects/src/domains/logistics/LogisticsPanel';

const STORAGE_PREFIX = 'dashboard:projectWidget:selectedProject:';

type ProjectOption = {
  id: string;
  code: string;
  customerName?: string | null;
  customerAddress?: string | null;
};

function getStorageKey(userId: string | null) {
  return userId ? `${STORAGE_PREFIX}${userId}` : null;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString('sl-SI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function collectProjectOptions(props: InstallerDashboardWidgetProps): ProjectOption[] {
  const map = new Map<string, ProjectOption>();

  props.data.upcomingConfirmedProjects.forEach((project) => {
    map.set(project.id, {
      id: project.id,
      code: project.code ?? project.id,
      customerName: project.customerName ?? null,
      customerAddress: project.customerAddress ?? null,
    });
  });

  props.data.myMaterialOrders.forEach((order) => {
    if (!map.has(order.projectId)) {
      map.set(order.projectId, {
        id: order.projectId,
        code: order.projectCode ?? order.projectId,
      });
    }
  });

  props.data.myWorkOrders.forEach((order) => {
    const existing = map.get(order.projectId);
    map.set(order.projectId, {
      id: order.projectId,
      code: order.projectCode ?? order.projectId,
      customerName: order.customerName ?? existing?.customerName ?? null,
      customerAddress: order.customerAddress ?? existing?.customerAddress ?? null,
    });
  });

  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function pickDefaultProjectId(options: ProjectOption[], props: InstallerDashboardWidgetProps) {
  if (!options.length) return null;
  const now = Date.now();
  const upcoming = props.data.myWorkOrders
    .filter((order) => order.scheduledAt && new Date(order.scheduledAt).valueOf() >= now)
    .sort((a, b) => new Date(a.scheduledAt ?? 0).valueOf() - new Date(b.scheduledAt ?? 0).valueOf());

  if (upcoming.length > 0) {
    return upcoming[0].projectId;
  }

  return options[0].id;
}

function getMaterialStatusLabel(steps: TimelineStep[]) {
  const logistics = steps.find((step) => step.key === 'logistics');
  return logistics?.logisticsSummary?.material?.label ?? '—';
}

function getCurrentPhase(steps: TimelineStep[]) {
  const allDone = steps.length > 0 && steps.every((step) => step.status === 'done');
  if (allDone) {
    return { key: 'completed' as const, label: 'Zaključeno' };
  }
  const active = steps.find((step) => step.status === 'inProgress');
  if (active) {
    return { key: active.key, label: active.label };
  }
  const pending = steps.find((step) => step.status === 'pending');
  return { key: pending?.key ?? 'requirements', label: pending?.label ?? 'Zahteve' };
}

function getNextScheduledForProject(props: InstallerDashboardWidgetProps, projectId: string) {
  const next = props.data.myWorkOrders
    .filter((order) => order.projectId === projectId && order.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt ?? 0).valueOf() - new Date(b.scheduledAt ?? 0).valueOf())[0];
  return next?.scheduledAt ?? null;
}

function ProjectSummaryWidget(props: InstallerDashboardWidgetProps) {
  const options = useMemo(() => collectProjectOptions(props), [props]);
  const storageKey = useMemo(() => getStorageKey(props.userId), [props.userId]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!options.length) {
      return;
    }
    if (selectedProjectId && options.some((option) => option.id === selectedProjectId)) {
      return;
    }
    let nextId: string | null = null;
    if (storageKey && typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(storageKey);
      if (stored && options.some((option) => option.id === stored)) {
        nextId = stored;
      }
    }
    if (!nextId) {
      nextId = pickDefaultProjectId(options, props);
    }
    if (nextId && nextId !== selectedProjectId) {
      setSelectedProjectId(nextId);
    }
  }, [options, props, selectedProjectId, storageKey]);

  if (!options.length) {
    return renderEmptyState('Ni projektov.');
  }

  return (
    <ProjectSummaryBody
      {...props}
      options={options}
      storageKey={storageKey}
      selectedProjectId={selectedProjectId}
      onSelectProject={setSelectedProjectId}
    />
  );
}

type ProjectSummaryBodyProps = InstallerDashboardWidgetProps & {
  options: ProjectOption[];
  storageKey: string | null;
  selectedProjectId: string | null;
  onSelectProject: (value: string) => void;
};

function ProjectSummaryBody({
  options,
  storageKey,
  selectedProjectId,
  onSelectProject,
  ...props
}: ProjectSummaryBodyProps) {
  const effectiveProjectId = selectedProjectId ?? options[0].id;
  const { project, loading } = useProject(effectiveProjectId, null);
  const timelineSteps = useProjectTimeline(project);
  const currentPhase = useMemo(() => getCurrentPhase(timelineSteps), [timelineSteps]);

  useEffect(() => {
    if (!storageKey || !selectedProjectId || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(storageKey, selectedProjectId);
  }, [storageKey, selectedProjectId]);

  const optionMeta = useMemo(
    () => options.find((option) => option.id === effectiveProjectId) ?? options[0],
    [options, effectiveProjectId],
  );

  const customerName = project?.customerDetail?.name ?? project?.customer ?? optionMeta?.customerName ?? '—';
  const customerAddress = project?.customerDetail?.address ?? optionMeta?.customerAddress ?? '—';
  const projectCode = project?.id ?? optionMeta?.code ?? effectiveProjectId;
  const materialStatus = project ? getMaterialStatusLabel(timelineSteps) : '—';
  const nextSchedule = getNextScheduledForProject(props, effectiveProjectId);
  const isCompleted = currentPhase.key === 'completed';
  const nextStepHelp =
    currentPhase.key === 'logistics'
      ? 'Nadaljuj pripravo materiala.'
      : currentPhase.key === 'execution'
        ? 'Nadaljuj izvedbo delovnega naloga.'
        : 'Račun se izda v Projects modulu.';

  const handleNextStepFocus = () => {
    const targetId =
      currentPhase.key === 'logistics'
        ? 'dashboard-logistics-material'
        : currentPhase.key === 'execution'
          ? 'dashboard-logistics-workorder'
          : null;
    if (!targetId || typeof document === 'undefined') {
      return;
    }
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="dashboard-project-widget">
      <label className="dashboard-project-widget__label">
        <span>Izberi projekt</span>
        <select
          className="dashboard-project-widget__select"
          value={effectiveProjectId}
          onChange={(event) => onSelectProject(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.code}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <p className="dashboard-widget__empty">Nalagam projekt...</p>
      ) : (
        <div className="dashboard-project-widget__content">
          <div className="dashboard-project-widget__phase-banner">
            <div>
              <span className="dashboard-project-widget__phase-label">Trenutna faza:</span>
              <span className="dashboard-project-widget__phase-value">{currentPhase.label}</span>
            </div>
            {isCompleted ? <span className="dashboard-project-widget__phase-badge">Zaključeno</span> : null}
          </div>
          <div className="dashboard-project-widget__header">
            <div className="dashboard-project-widget__title">[{projectCode}] – {customerName}</div>
            <div className="dashboard-project-widget__subtitle">{customerAddress}</div>
            <div className="dashboard-project-widget__meta">
              <span>Status materiala: {materialStatus}</span>
              <span>Termin: {formatDateTime(nextSchedule)}</span>
            </div>
          </div>
          <div className="dashboard-project-widget__next-step">
            <div className="dashboard-project-widget__next-step-header">
              <span>Naslednji korak</span>
              <button
                type="button"
                className="dashboard-project-widget__link"
                onClick={() => navigateToProject(effectiveProjectId, 'logistics')}
              >
                Odpri podrobnosti
              </button>
            </div>
            <div className="dashboard-project-widget__next-step-body">
              <p className="dashboard-project-widget__next-step-text">{nextStepHelp}</p>
              {currentPhase.key === 'logistics' || currentPhase.key === 'execution' ? (
                <button
                  type="button"
                  className="dashboard-project-widget__primary"
                  onClick={handleNextStepFocus}
                >
                  Pokaži korak
                </button>
              ) : (
                <span className="dashboard-project-widget__readonly">Čaka na račun</span>
              )}
            </div>
          </div>
          <div className="dashboard-project-widget__timeline">
            {timelineSteps.map((step) => {
              const statusClass = `dashboard-project-widget__step--${step.status}`;
              return (
                <div key={step.key} className={`dashboard-project-widget__step ${statusClass}`}>
                  <span className="dashboard-project-widget__step-label">{step.label}</span>
                </div>
              );
            })}
          </div>
          {currentPhase.key === 'logistics' ? (
            <LogisticsPanel projectId={effectiveProjectId} client={project?.customerDetail ?? null} mode="embedded" section="material" />
          ) : null}
          {currentPhase.key === 'execution' ? (
            <LogisticsPanel
              projectId={effectiveProjectId}
              client={project?.customerDetail ?? null}
              mode="embedded"
              section="workorder"
              workOrderMode="execute"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export const projectSummaryWidget: DashboardWidgetDefinition = {
  id: 'project-summary',
  title: 'Projekt',
  description: 'Povzetek izbranega projekta z fazami.',
  roles: ['installer'],
  defaultEnabledForRoles: ['installer'],
  size: 'lg',
  render: (props: InstallerDashboardWidgetProps) => {
    if (props.isLoading) {
      return renderEmptyState('Nalagam projekt...');
    }
    if (props.error) {
      return renderEmptyState('Napaka pri nalaganju projekta.');
    }

    return <ProjectSummaryWidget {...props} />;
  },
};
