import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseApiEnvelope } from '@aintel/shared/utils/api-client';
import type { DashboardWidgetDefinition } from '../types';

// Moja razpoložljivost: mesečni koledar (pon–ned) s premikanjem po mesecih.
// Klik na prazen prihodnji dan ga označi s privzetim delavnikom; klik na
// označen dan odpre ure; križec na dnevu razpoložljivost odstrani.
// Poleg razpoložljivosti so prikazani tudi razpisani termini montaž
// (prihodnji oranžno, opravljeni/pretekli sivo s kljukico).

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

interface EmployeeTermin {
  date: string;
  startHour: number;
  hours: number;
  title: string;
  projectId: string;
  done: boolean;
}

const HOUR_CHOICES = Array.from({ length: 15 }, (_, index) => 6 + index); // 6–20
const WEEKDAYS = ['pon', 'tor', 'sre', 'čet', 'pet', 'sob', 'ned'];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function MyAvailability() {
  const [schedule, setSchedule] = useState<ScheduleSettings | null>(null);
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [termini, setTermini] = useState<EmployeeTermin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState<number>(8);
  const [draftEnd, setDraftEnd] = useState<number>(16);
  // Prikazani mesec: 0 = tekoči, -1 = prejšnji, 1 = naslednji ...
  const [monthShift, setMonthShift] = useState(0);

  const todayKey = useMemo(() => dateKey(new Date()), []);
  const monthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthShift, 1);
  }, [monthShift]);
  const daysInMonth = useMemo(
    () => new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate(),
    [monthStart],
  );
  const monthLabel = useMemo(() => {
    const label = monthStart.toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [monthStart]);
  // Pon–ned: koliko praznih celic pred 1. dnem meseca (getDay: 0=ned).
  const leadingBlanks = useMemo(() => (monthStart.getDay() + 6) % 7, [monthStart]);

  const reload = useCallback(async () => {
    try {
      const fromKey = dateKey(monthStart);
      const [scheduleRes, calendarRes] = await Promise.all([
        fetch('/api/availability/my/schedule', { credentials: 'include' }),
        fetch(`/api/availability/my/calendar?from=${fromKey}&days=${daysInMonth}`, { credentials: 'include' }),
      ]);
      const schedulePayload = await parseApiEnvelope<{ schedule: ScheduleSettings }>(scheduleRes, 'Urnika ni bilo mogoče naložiti.');
      const calendarPayload = await parseApiEnvelope<{ days: AvailabilityDay[]; termini?: EmployeeTermin[] }>(
        calendarRes,
        'Koledarja ni bilo mogoče naložiti.',
      );
      setSchedule(schedulePayload.schedule);
      setDraftStart(schedulePayload.schedule.dayStartHour);
      setDraftEnd(schedulePayload.schedule.dayEndHour);
      setDays(calendarPayload.days);
      setTermini(calendarPayload.termini ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju.');
    } finally {
      setLoading(false);
    }
  }, [daysInMonth, monthStart]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const terminiByDate = useMemo(() => {
    const map = new Map<string, EmployeeTermin[]>();
    termini.forEach((termin) => map.set(termin.date, [...(map.get(termin.date) ?? []), termin]));
    return map;
  }, [termini]);

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
    if (day.date <= todayKey) return; // pretekli dnevi in danes se ne urejajo
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

      <div className="razpolozljivost__mesec">
        <button type="button" className="razpolozljivost__mesec-gumb" aria-label="Prejšnji mesec" onClick={() => setMonthShift((value) => value - 1)}>
          ‹
        </button>
        <strong className="razpolozljivost__mesec-naziv">{monthLabel}</strong>
        <button type="button" className="razpolozljivost__mesec-gumb" aria-label="Naslednji mesec" onClick={() => setMonthShift((value) => value + 1)}>
          ›
        </button>
        {monthShift !== 0 && (
          <button type="button" className="razpolozljivost__mesec-danes" onClick={() => setMonthShift(0)}>
            Danes
          </button>
        )}
      </div>

      <div className="razpolozljivost__mreza">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="razpolozljivost__mreza-glava">{weekday}</span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <span key={`prazno-${index}`} className="razpolozljivost__dan--prazen" />
        ))}
        {days.map((day) => {
          const active = day.hours.length > 0;
          const past = day.date <= todayKey;
          const label = Number(day.date.slice(8, 10));
          const firstHour = day.hours[0] ?? 0;
          const lastHour = (day.hours[day.hours.length - 1] ?? 0) + 1;
          const dayTermini = terminiByDate.get(day.date) ?? [];
          const tooltip = [
            active ? `Na voljo ${firstHour}:00–${lastHour}:00` : null,
            ...dayTermini.map(
              (termin) =>
                `${termin.done || past ? 'Opravljeno' : 'Termin'}: ${termin.title} (${termin.startHour}:00–${termin.startHour + termin.hours}:00)`,
            ),
          ].filter(Boolean).join('\n');
          return (
            <button
              key={day.date}
              type="button"
              className={[
                'razpolozljivost__dan',
                active ? 'je-aktiven' : '',
                day.source === 'fixed' ? 'je-fiksen' : '',
                editingDate === day.date ? 'je-izbran' : '',
                past ? 'je-pretekli' : '',
              ].filter(Boolean).join(' ')}
              title={tooltip || day.date}
              disabled={savingDate === day.date}
              onClick={() => handleDayClick(day)}
            >
              {active && !past && (
                <span
                  className="razpolozljivost__dan-x"
                  role="button"
                  aria-label={`Odstrani ${day.date}`}
                  title="Nisem na voljo ta dan"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (savingDate) return;
                    void saveDay(day.date, []);
                    setEditingDate((current) => (current === day.date ? null : current));
                  }}
                >
                  ×
                </span>
              )}
              <span className="razpolozljivost__dan-st">{label}</span>
              {active && (
                <span className="razpolozljivost__dan-ure">
                  {firstHour}–{lastHour}h
                </span>
              )}
              {dayTermini.map((termin, index) => (
                <span
                  key={`${day.date}-termin-${index}`}
                  className={`razpolozljivost__dan-termin${termin.done || past ? ' je-opravljen' : ''}`}
                >
                  {termin.done || past ? '✓' : '🔧'} {termin.startHour}–{termin.startHour + termin.hours}h
                </span>
              ))}
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
