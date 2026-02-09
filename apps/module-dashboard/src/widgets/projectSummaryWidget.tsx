import { useEffect, useMemo, useState } from 'react';
import type { DashboardWidgetDefinition, InstallerDashboardWidgetProps } from '../types';
import { renderEmptyState } from './utils';
import { useProject } from '../../../module-projects/src/domains/core/useProject';
import { useProjectTimeline, type TimelineStep } from '../../../module-projects/src/domains/core/useProjectTimeline';
import type { MaterialOrder, WorkOrder } from '@aintel/shared/types/logistics';
import { ChevronDown, ChevronRight } from 'lucide-react';

const STORAGE_PREFIX = 'dashboard:projectWidget:selectedProject:';

const STATUS_LABELS: Record<string, string> = {
  draft: 'V pripravi',
  issued: 'Izdano',
  'in-progress': 'V teku',
  confirmed: 'Potrjeno',
  completed: 'Zaključeno',
  cancelled: 'Preklicano',
};

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

function getWorkOrderStatusLabel(status?: string | null) {
  if (!status) return 'V pripravi';
  return STATUS_LABELS[status] ?? status;
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
  const [showWorkOrders, setShowWorkOrders] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);

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
      showWorkOrders={showWorkOrders}
      showMaterials={showMaterials}
      onToggleWorkOrders={() => setShowWorkOrders((prev) => !prev)}
      onToggleMaterials={() => setShowMaterials((prev) => !prev)}
    />
  );
}

type ProjectSummaryBodyProps = InstallerDashboardWidgetProps & {
  options: ProjectOption[];
  storageKey: string | null;
  selectedProjectId: string | null;
  onSelectProject: (value: string) => void;
  showWorkOrders: boolean;
  showMaterials: boolean;
  onToggleWorkOrders: () => void;
  onToggleMaterials: () => void;
};

function ProjectSummaryBody({
  options,
  storageKey,
  selectedProjectId,
  onSelectProject,
  showWorkOrders,
  showMaterials,
  onToggleWorkOrders,
  onToggleMaterials,
  ...props
}: ProjectSummaryBodyProps) {
  const effectiveProjectId = selectedProjectId ?? options[0].id;
  const { project, loading, refresh } = useProject(effectiveProjectId, null);
  const timelineSteps = useProjectTimeline(project);

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
  const hasMaterialStatus = materialStatus !== '—';
  const nextSchedule = getNextScheduledForProject(props, effectiveProjectId);
  const logistics = project?.logistics ?? null;
  const workOrders: WorkOrder[] = logistics
    ? [...(logistics.workOrders ?? []), ...(logistics.workOrder ? [logistics.workOrder] : [])]
    : [];
  const materialOrders: MaterialOrder[] = logistics
    ? [...(logistics.materialOrders ?? []), ...(logistics.materialOrder ? [logistics.materialOrder] : [])]
    : [];

  const handleSaveWorkOrder = async (
    workOrder: WorkOrder,
    workOrderItems: WorkOrder['items'],
    materialOrder?: MaterialOrder | null,
    materialItems?: MaterialOrder['items'],
  ) => {
    if (!workOrder || !(workOrder as any)._id) {
      return;
    }
    const workOrderId = (workOrder as any)._id as string;
    const material = materialOrder ?? null;
    await fetch(`/api/projects/${effectiveProjectId}/work-orders/${workOrderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workOrderId,
        scheduledAt: (workOrder as any).scheduledAt ?? null,
        assignedEmployeeIds: Array.isArray((workOrder as any).assignedEmployeeIds)
          ? (workOrder as any).assignedEmployeeIds
          : [],
        location: (workOrder as any).location ?? '',
        notes: (workOrder as any).notes ?? '',
        status: (workOrder as any).status ?? undefined,
        items: Array.isArray(workOrderItems) ? workOrderItems : undefined,
        materialOrderId: material?._id ?? null,
        materialStatus: material?.materialStatus ?? undefined,
        materialAssignedEmployeeIds: Array.isArray(material?.assignedEmployeeIds)
          ? material?.assignedEmployeeIds
          : undefined,
        materialItems: Array.isArray(materialItems ?? material?.items) ? materialItems ?? material?.items : undefined,
      }),
    });
    await refresh();
  };

  const updateWorkOrderItem = async (workOrder: WorkOrder, itemId: string, nextExecuted: number) => {
    const nextItems = Array.isArray(workOrder.items)
      ? workOrder.items.map((item) =>
          item.id === itemId ? { ...item, executedQuantity: nextExecuted } : item,
        )
      : [];
    const materialOrder =
      materialOrders.find((order) => order.workOrderId === (workOrder as any)._id) ?? null;
    await handleSaveWorkOrder(workOrder, nextItems, materialOrder ?? undefined);
  };

  const updateMaterialItem = async (materialOrder: MaterialOrder, itemId: string, nextDelivered: number) => {
    const nextItems = Array.isArray(materialOrder.items)
      ? materialOrder.items.map((item) =>
          item.id === itemId ? { ...item, deliveredQty: nextDelivered } : item,
        )
      : [];
    const workOrder =
      workOrders.find((order) => (order as any)._id === materialOrder.workOrderId) ?? workOrders[0];
    if (!workOrder) return;
    await handleSaveWorkOrder(workOrder, workOrder.items ?? [], materialOrder, nextItems);
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
          <div className="dashboard-project-widget__header">
            <div className="dashboard-project-widget__title">[{projectCode}] – {customerName}</div>
            <div className="dashboard-project-widget__subtitle">{customerAddress}</div>
            <div className="dashboard-project-widget__meta">
              <span>Status materiala: {materialStatus}</span>
              <span>Termin: {formatDateTime(nextSchedule)}</span>
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
          <div className="dashboard-project-widget__accordion">
            <button
              type="button"
              className="dashboard-project-widget__accordion-header"
              onClick={onToggleWorkOrders}
            >
              <span>Delovni nalog</span>
              {showWorkOrders ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {showWorkOrders ? (
              <div className="dashboard-project-widget__accordion-body">
                {workOrders.length ? (
                  workOrders.map((workOrder) => (
                    <div key={(workOrder as any)._id ?? workOrder.id} className="dashboard-project-widget__list">
                      <div className="dashboard-project-widget__order-title">
                        {workOrder.title ?? 'Delovni nalog'}
                        <span className="dashboard-project-widget__badge dashboard-project-widget__badge--status">
                          {getWorkOrderStatusLabel(workOrder.status)}
                        </span>
                      </div>
                      {(workOrder.items ?? []).map((item) => {
                        const requiredQty = typeof item.quantity === 'number' ? item.quantity : 0;
                        const executedQty = typeof item.executedQuantity === 'number' ? item.executedQuantity : 0;
                        const diff = executedQty - requiredQty;
                        const isEnough = diff >= 0;
                        return (
                          <label key={item.id} className="dashboard-project-widget__checkbox-row">
                            <input
                              type="checkbox"
                              checked={isEnough}
                              onChange={() => {
                                void updateWorkOrderItem(workOrder, item.id, requiredQty);
                              }}
                            />
                            <span className="dashboard-project-widget__checkbox-label">
                              {item.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <p className="dashboard-widget__empty">Ni delovnih nalogov.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="dashboard-project-widget__accordion">
            <button
              type="button"
              className="dashboard-project-widget__accordion-header"
              onClick={onToggleMaterials}
            >
              <span>Naročilo materiala</span>
              {showMaterials ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {showMaterials ? (
              <div className="dashboard-project-widget__accordion-body">
                {materialOrders.length ? (
                  materialOrders.map((materialOrder) => (
                    <div key={materialOrder._id ?? materialOrder.id} className="dashboard-project-widget__list">
                      <div className="dashboard-project-widget__order-title">
                        <span>Material</span>
                        {hasMaterialStatus ? (
                          <span className="dashboard-project-widget__badge dashboard-project-widget__badge--material">
                            {`Material: ${materialStatus}`}
                          </span>
                        ) : null}
                      </div>
                      {(materialOrder.items ?? []).map((item) => {
                        const requiredQty = typeof item.quantity === 'number' ? item.quantity : 0;
                        const deliveredQty = typeof item.deliveredQty === 'number' ? item.deliveredQty : 0;
                        const diff = deliveredQty - requiredQty;
                        const isEnough = diff >= 0;
                        return (
                          <label key={item.id} className="dashboard-project-widget__checkbox-row">
                            <input
                              type="checkbox"
                              checked={isEnough}
                              onChange={() => {
                                void updateMaterialItem(materialOrder, item.id, requiredQty);
                              }}
                            />
                            <span className="dashboard-project-widget__checkbox-label">
                              {item.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <p className="dashboard-widget__empty">Ni materialnih naročil.</p>
                )}
              </div>
            ) : null}
          </div>
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
