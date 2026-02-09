import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@aintel/ui';
import { useDashboardLayout } from './hooks/useDashboardLayout';
import { useInstallerDashboardData } from './hooks/useInstallerDashboardData';
import { ALL_WIDGETS, getWidgetById } from './widgets/registry';

const DEFAULT_AUTH = {
  userId: null as string | null,
  employeeId: null as string | null,
};

export function DashboardPage() {
  const [auth, setAuth] = useState(DEFAULT_AUTH);
  const [isEditing, setIsEditing] = useState(false);
  const { data, isLoading, error } = useInstallerDashboardData();
  const { visibleWidgets, toggleWidget, reorderWidget } = useDashboardLayout(auth.userId, 'installer');
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null);

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

  const availableWidgets = useMemo(
    () => ALL_WIDGETS.filter((widget) => !widget.roles || widget.roles.includes('installer')),
    [],
  );

  const handleDragStart = (widgetId: string, isSelected: boolean) => {
    if (!isSelected) {
      return;
    }
    setDraggingWidgetId(widgetId);
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>, widgetId: string, isSelected: boolean) => {
    if (!isSelected || draggingWidgetId === widgetId) {
      return;
    }
    event.preventDefault();
  };

  const handleDrop = (widgetId: string, isSelected: boolean) => {
    if (!isSelected || !draggingWidgetId || draggingWidgetId === widgetId) {
      return;
    }
    reorderWidget(draggingWidgetId, widgetId);
    setDraggingWidgetId(null);
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1>Nadzorna plošča</h1>
          <p>Dobrodošli na domači strani monterja.</p>
        </div>
        <Button variant="ghost" onClick={() => setIsEditing((prev) => !prev)}>
          {isEditing ? 'Zapri' : 'Dodaj widget'}
        </Button>
      </div>

      {isEditing ? (
        <div className="dashboard-editor">
          <p>Izberi pripomočke za prikaz:</p>
          <div className="dashboard-editor__list">
            {availableWidgets.map((widget) => {
              const isSelected = visibleWidgets.includes(widget.id);
              return (
                <label
                  key={widget.id}
                  className="dashboard-editor__item"
                  draggable={isSelected}
                  onDragStart={() => handleDragStart(widget.id, isSelected)}
                  onDragOver={(event) => handleDragOver(event, widget.id, isSelected)}
                  onDrop={() => handleDrop(widget.id, isSelected)}
                  onDragEnd={() => setDraggingWidgetId(null)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleWidget(widget.id)}
                  />
                  <span>{widget.title}</span>
                </label>
              );
            })}
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
