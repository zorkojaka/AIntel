import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseApiEnvelope } from '@aintel/shared/utils/api-client';
import type { DashboardWidgetDefinition } from '../types';

// Moja razpoložljivost: monter na koledarju poklika dneve, ko je na voljo za
// montaže. Klik na prazen dan ga označi s privzetim delavnikom; klik na
// označen dan odpre ure, kjer lahko doda/odvzame posamezno uro ali dan počisti.
// Iz teh dni sistem stranki ponudi izbiro termina montaže.

interface ScheduleSettings {
  mode: 'self' | 'fixed';
  dayStartHour: number;
  dayEndHour: number;
}

interface AvailabilityDay {
  date: string;
  hours: number[];
  source: 'manual' | 'fixed' | 'none';
}

const DAYS_SHOWN = 28;
const HOUR_CHOICES = Array.from({ length: 15 }, (_, index) => 6 + index); // 6–20

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekdayShort(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('sl-SI', { weekday: 'short' });
}

function MyAvailability() {
  const [schedule, setSchedule] = useState<ScheduleSettings | null>(null);
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState<number>(8);
  const [draftEnd, setDraftEnd] = useState<number>(16);

  const fromKey = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return dateKey(tomorrow);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [scheduleRes, calendarRes] = await Promise.all([
        fetch('/api/availability/my/schedule', { credentials: 'include' }),
        fetch(`/api/availability/my/calendar?from=${fromKey}&days=${DAYS_SHOWN}`, { credentials: 'include' }),
      ]);
      const schedulePayload = await parseApiEnvelope<{ schedule: ScheduleSettings }>(scheduleRes, 'Urnika ni bilo mogoče naložiti.');
      const calendarPayload = await parseApiEnvelope<{ days: AvailabilityDay[] }>(calendarRes, 'Koledarja ni bilo mogoče naložiti.');
      setSchedule(schedulePayload.schedule);
      setDraftStart(schedulePayload.schedule.dayStartHour);
      setDraftEnd(schedulePayload.schedule.dayEndHour);
      setDays(calendarPayload.days);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju.');
    } finally {
      setLoading(false);
    }
  }, [fromKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveDay = async (date: string, hours: number[]) => {
    setSavingDate(date);
    try {
      const response = await fetch(`/api/availability/my/days/${date}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      });
      const payload = await parseApiEnvelope<{ day: AvailabilityDay }>(response, 'Dneva ni bilo mogoče shraniti.');
      setDays((current) => current.map((day) => (day.date === date ? payload.day : day)));
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Dneva ni bilo mogoče shraniti.');
    } finally {
      setSavingDate(null);
    }
  };

  const defaultHours = useMemo(() => {
    if (!schedule) return [];
    const hours: number[] = [];
    for (let hour = schedule.dayStartHour; hour < schedule.dayEndHour; hour += 1) hours.push(hour);
    return hours;
  }, [schedule]);

  const handleDayClick = (day: AvailabilityDay) => {
    if (savingDate) return;
    if (day.hours.length === 0) {
      void saveDay(day.date, defaultHours);
      setEditingDate(day.date);
    } else {
      setEditingDate((current) => (current === day.date ? null : day.date));
    }
  };

  const toggleHour = (day: AvailabilityDay, hour: number) => {
    const next = day.hours.includes(hour)
      ? day.hours.filter((entry) => entry !== hour)
      : [...day.hours, hour].sort((a, b) => a - b);
    void saveDay(day.date, next);
  };

  const saveDefaults = async () => {
    try {
      const response = await fetch('/api/availability/my/schedule', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayStartHour: draftStart, dayEndHour: draftEnd }),
      });
      const payload = await parseApiEnvelope<{ schedule: ScheduleSettings }>(response, 'Urnika ni bilo mogoče shraniti.');
      setSchedule(payload.schedule);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Urnika ni bilo mogoče shraniti.');
    }
  };

  if (loading) return <div className="dashboard-widget__meta">Nalagam razpoložljivost...</div>;
  if (!schedule) return <div className="dashboard-widget__meta">{error ?? 'Urnika ni bilo mogoče naložiti.'}</div>;

  const editingDay = days.find((day) => day.date === editingDate) ?? null;

  return (
    <div className="razpolozljivost">
      {schedule.mode === 'fixed' ? (
        <div className="dashboard-widget__meta">
          Tvoj delavnik je fiksen — dnevi so označeni samodejno. S klikom na dan urediš izjemo (npr. dopust ali drugačne ure).
        </div>
      ) : (
        <div className="razpolozljivost__privzeto">
          <span className="dashboard-widget__meta">Privzet delavnik ob kliku na dan:</span>
          <select value={draftStart} onChange={(event) => setDraftStart(Number(event.target.value))}>
            {HOUR_CHOICES.map((hour) => <option key={hour} value={hour}>{hour}:00</option>)}
          </select>
          <span>–</span>
          <select value={draftEnd} onChange={(event) => setDraftEnd(Number(event.target.value))}>
            {HOUR_CHOICES.map((hour) => <option key={hour + 1} value={hour + 1}>{hour + 1}:00</option>)}
          </select>
          {(draftStart !== schedule.dayStartHour || draftEnd !== schedule.dayEndHour) && (
            <button type="button" className="razpolozljivost__gumb" onClick={() => void saveDefaults()}>Shrani</button>
          )}
        </div>
      )}

      <div className="razpolozljivost__mreza">
        {days.map((day) => {
          const active = day.hours.length > 0;
          const label = new Date(`${day.date}T00:00:00`).getDate();
          return (
            <button
              key={day.date}
              type="button"
              className={[
                'razpolozljivost__dan',
                active ? 'je-aktiven' : '',
                day.source === 'fixed' ? 'je-fiksen' : '',
                editingDate === day.date ? 'je-izbran' : '',
              ].filter(Boolean).join(' ')}
              title={active ? `${day.date}: ${day.hours[0]}:00–${(day.hours[day.hours.length - 1] ?? 0) + 1}:00` : day.date}
              disabled={savingDate === day.date}
              onClick={() => handleDayClick(day)}
            >
              <span className="razpolozljivost__dan-teden">{weekdayShort(day.date)}</span>
              <span className="razpolozljivost__dan-st">{label}</span>
              {active && <span className="razpolozljivost__dan-ure">{day.hours.length} h</span>}
            </button>
          );
        })}
      </div>

      {editingDay && (
        <div className="razpolozljivost__ure">
          <div className="dashboard-widget__meta">
            {new Date(`${editingDay.date}T00:00:00`).toLocaleDateString('sl-SI', { weekday: 'long', day: 'numeric', month: 'long' })} — klikni uro za dodajanje/odvzem:
          </div>
          <div className="razpolozljivost__ure-mreza">
            {HOUR_CHOICES.map((hour) => (
              <button
                key={hour}
                type="button"
                className={`razpolozljivost__ura ${editingDay.hours.includes(hour) ? 'je-aktivna' : ''}`}
                disabled={savingDate === editingDay.date}
                onClick={() => toggleHour(editingDay, hour)}
              >
                {hour}:00
              </button>
            ))}
          </div>
          <button
            type="button"
            className="razpolozljivost__gumb razpolozljivost__gumb--pocisti"
            disabled={savingDate === editingDay.date}
            onClick={() => { void saveDay(editingDay.date, []); setEditingDate(null); }}
          >
            Počisti dan (nisem na voljo)
          </button>
        </div>
      )}

      {error && <div className="razpolozljivost__napaka">{error}</div>}
    </div>
  );
}

export const availabilityWidget: DashboardWidgetDefinition = {
  id: 'my-availability',
  title: 'Moja razpoložljivost',
  description: 'Označi dneve in ure, ko si na voljo za montaže — iz njih stranke izbirajo termin.',
  roles: ['installer'],
  defaultEnabledForRoles: ['installer'],
  size: 'lg',
  render: () => <MyAvailability />,
};
