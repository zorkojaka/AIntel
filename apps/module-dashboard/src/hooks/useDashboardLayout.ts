import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardWidgetId } from '../types';
import { ALL_WIDGETS, getDefaultWidgetIdsForRoles } from '../widgets/registry';

function getStorageKey(userId: string | null) {
  return userId ? `dashboard:layout:${userId}` : null;
}

function normalizeWidgetList(input: unknown, allowed: Set<DashboardWidgetId>, fallback: DashboardWidgetId[]) {
  if (!Array.isArray(input)) {
    return fallback;
  }
  const normalized = input.filter((value): value is DashboardWidgetId => allowed.has(value as DashboardWidgetId));
  return normalized.length > 0 ? normalized : fallback;
}

export function useDashboardLayout(userId: string | null, role: string = 'installer') {
  const storageKey = useMemo(() => getStorageKey(userId), [userId]);
  const defaultWidgetIds = useMemo(() => getDefaultWidgetIdsForRoles([role]), [role]);
  const allowedWidgetIds = useMemo(() => new Set(ALL_WIDGETS.map((widget) => widget.id)), []);
  const [visibleWidgets, setVisibleWidgets] = useState<DashboardWidgetId[]>(defaultWidgetIds);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      setVisibleWidgets(defaultWidgetIds);
      return;
    }
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setVisibleWidgets(defaultWidgetIds);
      return;
    }
    try {
      setVisibleWidgets(normalizeWidgetList(JSON.parse(raw), allowedWidgetIds, defaultWidgetIds));
    } catch {
      setVisibleWidgets(defaultWidgetIds);
    }
  }, [storageKey, allowedWidgetIds, defaultWidgetIds]);

  const persist = useCallback(
    (next: DashboardWidgetId[]) => {
      if (!storageKey || typeof window === 'undefined') {
        return;
      }
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    },
    [storageKey],
  );

  const toggleWidget = useCallback(
    (widgetId: DashboardWidgetId) => {
      setVisibleWidgets((prev) => {
        const next = prev.includes(widgetId) ? prev.filter((id) => id !== widgetId) : [...prev, widgetId];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reorderWidget = useCallback(
    (sourceId: DashboardWidgetId, targetId: DashboardWidgetId) => {
      setVisibleWidgets((prev) => {
        if (sourceId === targetId) {
          return prev;
        }
        const sourceIndex = prev.indexOf(sourceId);
        const targetIndex = prev.indexOf(targetId);
        if (sourceIndex === -1 || targetIndex === -1) {
          return prev;
        }
        const next = [...prev];
        next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, sourceId);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return {
    visibleWidgets,
    toggleWidget,
    setVisibleWidgets,
    reorderWidget,
  };
}
