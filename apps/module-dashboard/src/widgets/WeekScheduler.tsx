import { useMemo, useState } from 'react';
import { Button } from '@aintel/ui';
import type { WorkOrderSummary } from '../types';
import { navigateToProject } from './utils';

const START_HOUR = 6;
const END_HOUR = 18;
const PX_PER_MIN = 1;
const MIN_BLOCK_MINUTES = 30;
const WINDOW_DAYS = 14;
const STEP_DAYS = 7;

const WEEKDAYS = ['Pon', 'Tor', 'Sre', 'Čet', 'Pet', 'Sob', 'Ned'];

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

function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  const startLabel = `${String(start.getDate()).padStart(2, '0')}.${String(start.getMonth() + 1).padStart(2, '0')}.`;
  const endLabel = `${String(end.getDate()).padStart(2, '0')}.${String(end.getMonth() + 1).padStart(2, '0')}.`;
  return `${startLabel} – ${endLabel}`;
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

function getMinutesFromStart(date: Date) {
  return date.getHours() * 60 + date.getMinutes() - START_HOUR * 60;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function displayValue(value?: string | null) {
  if (!value) {
    return '—';
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : '—';
}

function formatProjectLine(title?: string | null, address?: string | null) {
  const safeTitle = title ? title.trim() : '';
  const safeAddress = address ? address.trim() : '';
  if (safeTitle && safeAddress) {
    return `${safeTitle} – ${safeAddress}`;
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
      return 'Zaključeno';
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

type WeekSchedulerProps = {
  workOrders: WorkOrderSummary[];
};

export function WeekScheduler({ workOrders }: WeekSchedulerProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [hideNonWorkingDays, setHideNonWorkingDays] = useState(true);
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const weekStart = useMemo(() => addDays(getWeekStart(new Date()), weekOffset * STEP_DAYS), [weekOffset]);
  const weekEnd = useMemo(() => addDays(weekStart, WINDOW_DAYS), [weekStart]);

  const days = useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, index) => addDays(weekStart, index)),
    [weekStart],
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

  return (
    <div className="dashboard-week-scheduler">
      <div className="dashboard-week-scheduler__header">
        <div className="dashboard-week-scheduler__header-left">
          <Button variant="ghost" onClick={() => setWeekOffset((prev) => prev - 1)}>
            Prejšnji teden
          </Button>
        </div>
        <div className="dashboard-week-scheduler__range">{formatWeekRange(weekStart)}</div>
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

      <div className="dashboard-week-scheduler__grid">
        <div className="dashboard-week-scheduler__time">
          {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => {
            const hour = START_HOUR + index;
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
            const isWeekDivider = offset === 7;
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
                    const startMinutes = getMinutesFromStart(scheduledDate);
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
                    const materialStatus = item.materialStatus ? item.materialStatus.trim() : '';
                    const headerLabel = `${item.projectCode} – ${customerName}`;
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
                        {item.approx ? <span className="dashboard-week-scheduler__approx">≈</span> : null}
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
    </div>
  );
}
