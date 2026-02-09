import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardWidgetId } from '../types';

const DEFAULT_WIDGETS: DashboardWidgetId[] = ['upcoming-projects', 'material-orders', 'work-orders'];

function getStorageKey(userId: string | null) {
  return userId ? `dashboard:layout:${userId}` : null;
}

function normalizeWidgetList(input: unknown): DashboardWidgetId[] {
  if (!Array.isArray(input)) {
    return DEFAULT_WIDGETS;
  }
  const allowed = new Set<DashboardWidgetId>(DEFAULT_WIDGETS);
  const normalized = input.filter((value): value is DashboardWidgetId => allowed.has(value as DashboardWidgetId));
  return normalized.length > 0 ? normalized : DEFAULT_WIDGETS;
}

export function useDashboardLayout(userId: string | null) {
  const storageKey = useMemo(() => getStorageKey(userId), [userId]);
  const [visibleWidgets, setVisibleWidgets] = useState<DashboardWidgetId[]>(DEFAULT_WIDGETS);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      setVisibleWidgets(DEFAULT_WIDGETS);
      return;
    }
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setVisibleWidgets(DEFAULT_WIDGETS);
      return;
    }
    try {
      setVisibleWidgets(normalizeWidgetList(JSON.parse(raw)));
    } catch {
      setVisibleWidgets(DEFAULT_WIDGETS);
    }
  }, [storageKey]);

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

  return {
    visibleWidgets,
    toggleWidget,
    setVisibleWidgets,
  };
}
