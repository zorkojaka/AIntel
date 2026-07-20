import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@aintel/ui';
import { parseApiEnvelope } from '@aintel/shared/utils/api-client';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useDashboardLayout } from './hooks/useDashboardLayout';
import { useInstallerDashboardData } from './hooks/useInstallerDashboardData';
import { ALL_WIDGETS, getWidgetById } from './widgets/registry';
import type { DashboardWidgetId } from './types';

const DEFAULT_AUTH = {
  userId: null as string | null,
  employeeId: null as string | null,
  roles: [] as string[],
};

type DashboardAuthPayload = {
  roles?: string[] | null;
  user?: { id?: string | null } | null;
  employee?: { id?: string | null } | null;
};

// Zaledne vloge (ADMIN, ORGANIZER, EXECUTION …) → oznake vlog na widgetih.
function toWidgetRoles(roles: string[]): string[] {
  const out = new Set<string>();
  for (const role of roles) {
    const normalized = String(role).toUpperCase();
    if (normalized === 'ADMIN') out.add('admin');
    if (normalized === 'ORGANIZER') out.add('organizer');
    if (normalized === 'EXECUTION') out.add('installer');
  }
  // Brez znanih vlog ostane privzeti monterski pogled (kot doslej).
  if (!out.size) out.add('installer');
  return [...out];
}

export function DashboardPage() {
  const [auth, setAuth] = useState(DEFAULT_AUTH);
  const [isEditing, setIsEditing] = useState(false);
  const { data, isLoading, error } = useInstallerDashboardData();
  const widgetRoles = useMemo(() => toWidgetRoles(auth.roles), [auth.roles]);
  const { visibleWidgets, toggleWidget, reorderWidget } = useDashboardLayout(auth.userId, widgetRoles);
  const [draggingWidgetId, setDraggingWidgetId] = useState<DashboardWidgetId | null>(null);

  useEffect(() => {
    let active = true;

    const loadAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await parseApiEnvelope<DashboardAuthPayload>(response, 'Prijave ni mogoče preveriti.');
        if (!active) {
          return;
        }
        setAuth({
          userId: data?.user?.id ?? null,
          employeeId: data?.employee?.id ?? null,
          roles: Array.isArray(data?.roles) ? data.roles : [],
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

  const availableWidgets = useMemo(
    () => ALL_WIDGETS.filter((widget) => !widget.roles || widget.roles.some((role) => widgetRoles.includes(role))),
    [widgetRoles],
  );
  const selectedWidgets = useMemo(
    () =>
      visibleWidgets
        .map((widgetId) => availableWidgets.find((widget) => widget.id === widgetId) ?? null)
        .filter((widget): widget is (typeof availableWidgets)[number] => Boolean(widget)),
    [availableWidgets, visibleWidgets],
  );
  const unselectedWidgets = useMemo(
    () => availableWidgets.filter((widget) => !visibleWidgets.includes(widget.id)),
    [availableWidgets, visibleWidgets],
  );

  const handleDragStart = (widgetId: DashboardWidgetId) => {
    setDraggingWidgetId(widgetId);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, widgetId: DashboardWidgetId) => {
    if (draggingWidgetId === widgetId) {
      return;
    }
    event.preventDefault();
  };

  const handleDrop = (widgetId: DashboardWidgetId) => {
    if (!draggingWidgetId || draggingWidgetId === widgetId) {
      return;
    }
    reorderWidget(draggingWidgetId, widgetId);
    setDraggingWidgetId(null);
  };

  const moveSelectedWidget = (widgetId: DashboardWidgetId, direction: -1 | 1) => {
    const currentIndex = visibleWidgets.indexOf(widgetId);
    const targetId = visibleWidgets[currentIndex + direction];
    if (!targetId) {
      return;
    }
    if (direction < 0) {
      reorderWidget(widgetId, targetId);
      return;
    }
    reorderWidget(targetId, widgetId);
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1>Nadzorna plošča</h1>
        </div>
        <Button variant="ghost" onClick={() => setIsEditing((prev) => !prev)}>
          {isEditing ? 'Zapri' : 'Dodaj widget'}
        </Button>
      </div>

      {isEditing ? (
        <div className="dashboard-editor">
          <p>Izberi pripomočke za prikaz:</p>
          <div className="dashboard-editor__section">
            <div className="dashboard-editor__section-header">
              <span>Neizbrani pripomočki</span>
            </div>
            <div className="dashboard-editor__available-list">
              {unselectedWidgets.length > 0 ? (
                unselectedWidgets.map((widget) => (
                  <label key={widget.id} className="dashboard-editor__item dashboard-editor__item--available">
                    <input type="checkbox" checked={false} onChange={() => toggleWidget(widget.id)} />
                    <span>{widget.title}</span>
                  </label>
                ))
              ) : (
                <span className="dashboard-editor__empty">Vsi pripomočki so izbrani.</span>
              )}
            </div>
          </div>

          <div className="dashboard-editor__section">
            <div className="dashboard-editor__section-header">
              <span>Izbrani pripomočki</span>
              <span className="dashboard-editor__hint">Povleci vrstico ali uporabi puščice za vrstni red prikaza.</span>
            </div>
            <div className="dashboard-editor__selected-list">
              {selectedWidgets.length > 0 ? (
                selectedWidgets.map((widget, index) => (
                  <div
                    key={widget.id}
                    className={[
                      'dashboard-editor__selected-item',
                      draggingWidgetId === widget.id ? 'dashboard-editor__selected-item--dragging' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    draggable
                    onDragStart={() => handleDragStart(widget.id)}
                    onDragOver={(event) => handleDragOver(event, widget.id)}
                    onDrop={() => handleDrop(widget.id)}
                    onDragEnd={() => setDraggingWidgetId(null)}
                  >
                    <label className="dashboard-editor__item dashboard-editor__item--selected">
                      <input type="checkbox" checked onChange={() => toggleWidget(widget.id)} />
                      <span>{widget.title}</span>
                    </label>
                    <div className="dashboard-editor__order-actions" aria-label={`Vrstni red za ${widget.title}`}>
                      <button
                        type="button"
                        onClick={() => moveSelectedWidget(widget.id, -1)}
                        disabled={index === 0}
                        aria-label={`Premakni ${widget.title} gor`}
                      >
                        <ArrowUp aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelectedWidget(widget.id, 1)}
                        disabled={index === selectedWidgets.length - 1}
                        aria-label={`Premakni ${widget.title} dol`}
                      >
                        <ArrowDown aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <span className="dashboard-editor__empty">Ni izbranih pripomočkov.</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="dashboard-grid">
        {visibleWidgets.map((widgetId) => {
          const widget = getWidgetById(widgetId);
          if (!widget) {
            return null;
          }
          const sizeClass = widget.size ? `dashboard-grid__item--${widget.size}` : '';
          return (
            <div key={widget.id} className={['dashboard-grid__item', sizeClass].filter(Boolean).join(' ')}>
              <Card title={widget.title}>
                {widget.render({ data, isLoading, error, employeeId: auth.employeeId, userId: auth.userId })}
              </Card>
            </div>
          );
        })}
      </div>

      {!auth.employeeId ? (
        <p className="dashboard-hint">Podatki so vezani na prijavljenega zaposlenega.</p>
      ) : null}
    </div>
  );
}
