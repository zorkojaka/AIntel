import { useEffect, useMemo, useState } from 'react';
import { Button } from '@aintel/ui';
import type { WorkOrderSummary } from '../types';
import { navigateToProject, normalizeMaterialStatusLabel } from './utils';

const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 18;
const PX_PER_MIN = 0.5;
const MIN_BLOCK_MINUTES = 30;
const STANDARD_DESKTOP_WINDOW_DAYS = 14;
const STEP_DAYS = 7;
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

const WEEKDAYS = ['Pon', 'Tor', 'Sre', 'Cet', 'Pet', 'Sob', 'Ned'];

type SchedulerVariant = 'standard' | 'week' | 'adaptive';

type SchedulerItem = {
  id: string;
  projectId: string;
  projectCode: string;
  title?: string | null;
  projectTitle?: string | null;
  projectAddress?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  materialStatus?: string | null;
  status: string;
  scheduledAt: string;
  durationMin: number;
  approx: boolean;
};

function getWeekStart(baseDate: Date) {
  const date = new Date(baseDate);
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDayHeader(date: Date, index: number) {
  const dayLabel = WEEKDAYS[index] ?? '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${dayLabel} ${day}.${month}.`;
}

function formatWeekRange(start: Date, dayCount: number) {
  const end = addDays(start, Math.max(0, dayCount - 1));
  const startLabel = `${String(start.getDate()).padStart(2, '0')}.${String(start.getMonth() + 1).padStart(2, '0')}.`;
  const endLabel = `${String(end.getDate()).padStart(2, '0')}.${String(end.getMonth() + 1).padStart(2, '0')}.`;
  return `${startLabel} - ${endLabel}`;
}

function buildItems(workOrders: WorkOrderSummary[], weekStart: Date, weekEnd: Date) {
  const items: SchedulerItem[] = [];

  workOrders.forEach((order) => {
    if (!order.scheduledAt) {
      return;
    }
    const date = new Date(order.scheduledAt);
    if (Number.isNaN(date.valueOf())) {
      return;
    }
    if (date < weekStart || date >= weekEnd) {
      return;
    }

    const durationMin = Number.isFinite(order.casovnaNorma) && order.casovnaNorma > 0 ? order.casovnaNorma : MIN_BLOCK_MINUTES;
    const approx = !(Number.isFinite(order.casovnaNorma) && order.casovnaNorma > 0);

    items.push({
      id: order.id,
      projectId: order.projectId,
      projectCode: order.projectCode,
      title: order.title ?? null,
      projectTitle: order.projectTitle ?? null,
      projectAddress: order.projectAddress ?? null,
      customerName: order.customerName ?? null,
      customerAddress: order.customerAddress ?? null,
      materialStatus: order.materialStatus ?? null,
      status: order.status,
      scheduledAt: order.scheduledAt,
      durationMin,
      approx,
    });
  });

  items.sort((a, b) => new Date(a.scheduledAt).valueOf() - new Date(b.scheduledAt).valueOf());
  return items;
}

function getDayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getMinutesFromStart(date: Date, startHour: number) {
  return date.getHours() * 60 + date.getMinutes() - startHour * 60;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function displayValue(value?: string | null) {
  if (!value) {
    return '-';
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : '-';
}

function formatProjectLine(title?: string | null, address?: string | null) {
  const safeTitle = title ? title.trim() : '';
  const safeAddress = address ? address.trim() : '';
  if (safeTitle && safeAddress) {
    return `${safeTitle} - ${safeAddress}`;
  }
  return displayValue(safeTitle || safeAddress);
}

function mapStatusLabel(status?: string | null) {
  switch (status) {
    case 'draft':
      return 'V pripravi';
    case 'issued':
      return 'Izdano';
    case 'completed':
      return 'Zakljuceno';
    case 'cancelled':
      return 'Preklicano';
    default:
      return 'V pripravi';
  }
}

function mapStatusTone(status?: string | null) {
  switch (status) {
    case 'draft':
      return 'neutral';
    case 'issued':
      return 'info';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString('sl-SI', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type WeekSchedulerProps = {
  workOrders: WorkOrderSummary[];
  variant?: SchedulerVariant;
};

export function WeekScheduler({ workOrders, variant = 'standard' }: WeekSchedulerProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [hideNonWorkingDays, setHideNonWorkingDays] = useState(true);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });

  const baseWeekStart = useMemo(() => addDays(getWeekStart(new Date()), weekOffset * STEP_DAYS), [weekOffset]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = () => setIsMobileView(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const adaptiveWindowDays = useMemo(() => {
    if (variant !== 'adaptive') {
      return 7;
    }
    const horizonEnd = addDays(baseWeekStart, 14);
    const horizonItems = buildItems(workOrders, baseWeekStart, horizonEnd);
    const activeDayCount = new Set(horizonItems.map((item) => localDayKey(new Date(item.scheduledAt)))).size;
    if (activeDayCount <= 2) return 3;
    if (activeDayCount <= 4) return 5;
    return 7;
  }, [variant, workOrders, baseWeekStart]);

  const windowDays =
    variant === 'week'
      ? 7
      : variant === 'adaptive'
        ? (isMobileView ? Math.min(adaptiveWindowDays, 5) : adaptiveWindowDays)
        : (isMobileView ? 7 : STANDARD_DESKTOP_WINDOW_DAYS);

  const weekStart = baseWeekStart;
  const weekEnd = useMemo(() => addDays(weekStart, windowDays), [weekStart, windowDays]);

  const days = useMemo(
    () => Array.from({ length: windowDays }, (_, index) => addDays(weekStart, index)),
    [weekStart, windowDays],
  );

  const visibleDays = useMemo(() => {
    const indexed = days.map((day, offset) => ({ day, offset }));
    const filtered = hideNonWorkingDays
      ? indexed.filter(({ day }) => {
          const dayOfWeek = day.getDay();
          return dayOfWeek !== 0 && dayOfWeek !== 6;
        })
      : indexed;
    return filtered;
  }, [days, hideNonWorkingDays]);

  const items = useMemo(() => buildItems(workOrders, weekStart, weekEnd), [workOrders, weekStart, weekEnd]);

  const schedulerBounds = useMemo(() => {
    if (variant !== 'adaptive' || items.length === 0) {
      return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
    }
    const minMinute = Math.min(...items.map((item) => {
      const date = new Date(item.scheduledAt);
      return date.getHours() * 60 + date.getMinutes();
    }));
    const maxMinute = Math.max(...items.map((item) => {
      const date = new Date(item.scheduledAt);
      return date.getHours() * 60 + date.getMinutes() + item.durationMin;
    }));

    const dynamicStart = clamp(Math.floor(minMinute / 60) - 1, 0, 20);
    const dynamicEnd = clamp(Math.ceil(maxMinute / 60) + 1, dynamicStart + 6, 24);
    return {
      startHour: dynamicStart,
      endHour: dynamicEnd,
    };
  }, [variant, items]);

  const totalMinutes = (schedulerBounds.endHour - schedulerBounds.startHour) * 60;

  const itemsByDay = useMemo(() => {
    const map = new Map<string, SchedulerItem[]>();
    items.forEach((item) => {
      const date = new Date(item.scheduledAt);
      const key = localDayKey(date);
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    });
    return map;
  }, [items]);

  const mobileAgendaItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        scheduledTimeLabel: formatDateTime(item.scheduledAt),
      })),
    [items],
  );

  const useAdaptiveCompact = variant === 'adaptive' && isMobileView;

  return (
    <div className="dashboard-week-scheduler">
      <div className="dashboard-week-scheduler__header">
        <div className="dashboard-week-scheduler__header-left">
          <Button variant="ghost" onClick={() => setWeekOffset((prev) => prev - 1)}>
            Prejsnji teden
          </Button>
        </div>
        <div className="dashboard-week-scheduler__range">{formatWeekRange(weekStart, windowDays)}</div>
        <div className="dashboard-week-scheduler__header-right">
          <label className="dashboard-week-scheduler__toggle">
            <input
              type="checkbox"
              checked={hideNonWorkingDays}
              onChange={(event) => setHideNonWorkingDays(event.target.checked)}
            />
            <span>Skrij nedelovne dni</span>
          </label>
          <Button variant="ghost" onClick={() => setWeekOffset((prev) => prev + 1)}>
            Naslednji teden
          </Button>
        </div>
      </div>

      {useAdaptiveCompact ? (
        <div className="dashboard-week-scheduler__adaptive-list">
          {visibleDays.map(({ day }) => {
            const dayKey = localDayKey(day);
            const dayItems = itemsByDay.get(dayKey) ?? [];
            const dayIndex = getDayIndex(day);
            return (
              <div key={`adaptive-${dayKey}`} className="dashboard-week-scheduler__adaptive-day">
                <h4>{formatDayHeader(day, dayIndex)}</h4>
                {dayItems.length === 0 ? (
                  <p className="dashboard-widget__empty">Brez terminov.</p>
                ) : (
                  <ul>
                    {dayItems.map((item) => (
                      <li key={`adaptive-item-${item.id}`}>
                        <button type="button" onClick={() => navigateToProject(item.projectId, 'execution')}>
                          <span className="dashboard-week-scheduler__mobile-title">
                            {item.projectCode} - {displayValue(item.customerName)}
                          </span>
                          <span className="dashboard-week-scheduler__mobile-meta">
                            {formatDateTime(item.scheduledAt)} · {mapStatusLabel(item.status)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dashboard-week-scheduler__grid">
          <div className="dashboard-week-scheduler__time">
            {Array.from({ length: schedulerBounds.endHour - schedulerBounds.startHour + 1 }, (_, index) => {
              const hour = schedulerBounds.startHour + index;
              return (
                <div key={hour} className="dashboard-week-scheduler__time-slot">
                  {`${String(hour).padStart(2, '0')}:00`}
                </div>
              );
            })}
          </div>

          <div className="dashboard-week-scheduler__days">
            {visibleDays.map(({ day, offset }) => {
              const index = getDayIndex(day);
              const dayItems = itemsByDay.get(localDayKey(day)) ?? [];
              const isWeekDivider = variant === 'standard' && offset === 7;
              return (
                <div
                  key={localDayKey(day)}
                  className={[
                    'dashboard-week-scheduler__day',
                    isWeekDivider ? 'dashboard-week-scheduler__day--week-divider' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="dashboard-week-scheduler__day-header">{formatDayHeader(day, index)}</div>
                  <div className="dashboard-week-scheduler__day-body" style={{ height: totalMinutes * PX_PER_MIN }}>
                    {dayItems.map((item) => {
                      const scheduledDate = new Date(item.scheduledAt);
                      const startMinutes = getMinutesFromStart(scheduledDate, schedulerBounds.startHour);
                      const endMinutes = startMinutes + item.durationMin;
                      if (endMinutes <= 0 || startMinutes >= totalMinutes) {
                        return null;
                      }

                      const clampedStart = clamp(startMinutes, 0, totalMinutes);
                      const clampedEnd = clamp(endMinutes, 0, totalMinutes);
                      const height = Math.max(item.approx ? MIN_BLOCK_MINUTES : 1, clampedEnd - clampedStart) * PX_PER_MIN;
                      const top = clampedStart * PX_PER_MIN;
                      const customerName = displayValue(item.customerName);
                      const projectLine = formatProjectLine(item.projectTitle, item.projectAddress);
                      const customerAddress = displayValue(item.customerAddress);
                      const materialStatus = normalizeMaterialStatusLabel(item.materialStatus) ?? '';
                      const headerLabel = `${item.projectCode} - ${customerName}`;
                      const statusLabel = mapStatusLabel(item.status);
                      const statusTone = mapStatusTone(item.status);

                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="dashboard-week-scheduler__event"
                          style={{ top, height }}
                          onClick={() => navigateToProject(item.projectId, 'execution')}
                        >
                          {item.approx ? <span className="dashboard-week-scheduler__approx">~</span> : null}
                          <div className="dashboard-week-scheduler__event-header">
                            <span className="dashboard-week-scheduler__event-title">{headerLabel}</span>
                            <span className="dashboard-week-scheduler__event-subtitle">{projectLine}</span>
                            <span className="dashboard-week-scheduler__event-subtitle">{customerAddress}</span>
                          </div>
                          <div className="dashboard-week-scheduler__event-divider" />
                          <div className="dashboard-week-scheduler__event-body">
                            <span className="dashboard-week-scheduler__event-label">Delovni nalog</span>
                            <div className="dashboard-week-scheduler__event-badges">
                              <span className={`dashboard-week-scheduler__badge dashboard-week-scheduler__badge--${statusTone}`}>
                                {statusLabel}
                              </span>
                              {materialStatus ? (
                                <span className="dashboard-week-scheduler__badge dashboard-week-scheduler__badge--material">
                                  {`Material: ${materialStatus}`}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!useAdaptiveCompact && isMobileView ? (
        <div className="dashboard-week-scheduler__mobile-list">
          <h4>Pregled terminov</h4>
          {mobileAgendaItems.length === 0 ? (
            <p className="dashboard-widget__empty">Za izbrani teden ni terminov.</p>
          ) : (
            <ul>
              {mobileAgendaItems.map((item) => (
                <li key={`mobile-${item.id}`}>
                  <button type="button" onClick={() => navigateToProject(item.projectId, 'execution')}>
                    <span className="dashboard-week-scheduler__mobile-title">
                      {item.projectCode} - {displayValue(item.customerName)}
                    </span>
                    <span className="dashboard-week-scheduler__mobile-meta">
                      {item.scheduledTimeLabel} · {mapStatusLabel(item.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
