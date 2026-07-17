import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  maxWorkdaysPerWeek?: number | null;
}

interface WeekLimit {
  weekStart: string;
  maxWorkdays: number | null;
  hasOverride: boolean;
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

function mondayKey(date: string) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}

function MyAvailability() {
  const [schedule, setSchedule] = useState<ScheduleSettings | null>(null);
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [termini, setTermini] = useState<EmployeeTermin[]>([]);
  const [weekLimits, setWeekLimits] = useState<WeekLimit[]>([]);
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
  // Pon–ned: prazne celice pred prvim PRIKAZANIM dnem računamo iz podatkov
  // (days), ne iz izbranega meseca — med menjavo mesecev sta sicer za hip
  // neusklajena in koledar izriše smetne vrstice.
  const leadingBlanks = useMemo(() => {
    if (!days.length) return 0;
    return (new Date(`${days[0].date}T00:00:00`).getDay() + 6) % 7;
  }, [days]);

  // Ob hitrem preklapljanju mesecev lahko starejši odgovor prehiti novejšega —
  // upošteva se samo zadnja sprožena zahteva.
  const reloadSeq = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++reloadSeq.current;
    try {
      const fromKey = dateKey(monthStart);
      const [scheduleRes, calendarRes] = await Promise.all([
        fetch('/api/availability/my/schedule', { credentials: 'include' }),
        fetch(`/api/availability/my/calendar?from=${fromKey}&days=${daysInMonth}`, { credentials: 'include' }),
      ]);
      const schedulePayload = await parseApiEnvelope<{ schedule: ScheduleSettings }>(scheduleRes, 'Urnika ni bilo mogoče naložiti.');
      const calendarPayload = await parseApiEnvelope<{ days: AvailabilityDay[]; termini?: EmployeeTermin[]; weekLimits?: WeekLimit[] }>(
        calendarRes,
        'Koledarja ni bilo mogoče naložiti.',
      );
      if (seq !== reloadSeq.current) return; // medtem je bila sprožena novejša zahteva
      setSchedule(schedulePayload.schedule);
      setDraftStart(schedulePayload.schedule.dayStartHour);
      setDraftEnd(schedulePayload.schedule.dayEndHour);
      setDays(calendarPayload.days);
      setTermini(calendarPayload.termini ?? []);
      setWeekLimits(calendarPayload.weekLimits ?? []);
      setError(null);
    } catch (loadError) {
      if (seq !== reloadSeq.current) return;
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

  const saveDefaultWeekLimit = async (value: string) => {
    try {
      const response = await fetch('/api/availability/my/schedule', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxWorkdaysPerWeek: value === '' ? null : Number(value) }),
      });
      const payload = await parseApiEnvelope<{ schedule: ScheduleSettings }>(response, 'Omejitve ni bilo mogoče shraniti.');
      setSchedule(payload.schedule);
      await reload(); // efektivne tedenske omejitve se spremenijo
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Omejitve ni bilo mogoče shraniti.');
    }
  };

  const saveWeekLimit = async (weekStart: string, value: string) => {
    try {
      const response = await fetch(`/api/availability/my/weeks/${weekStart}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxWorkdays: value === '' ? null : Number(value) }),
      });
      const payload = await parseApiEnvelope<{ week: WeekLimit }>(response, 'Omejitve tedna ni bilo mogoče shraniti.');
      setWeekLimits((current) => current.map((week) => (week.weekStart === weekStart ? payload.week : week)));
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Omejitve tedna ni bilo mogoče shraniti.');
    }
  };

  if (loading) return <div className="dashboard-widget__meta">Nalagam razpoložljivost...</div>;
  if (!schedule) return <div className="dashboard-widget__meta">{error ?? 'Urnika ni bilo mogoče naložiti.'}</div>;

  const editingDay = days.find((day) => day.date === editingDate) ?? null;

  const renderDay = (day: AvailabilityDay) => {
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
  };

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
          <span className="dashboard-widget__meta">· Največ dni/teden:</span>
          <select
            value={schedule.maxWorkdaysPerWeek ?? ''}
            title="Privzeta omejitev delovnih dni na teden — ko je v tednu zasedenih toliko dni, se preostali prosti dnevi tistega tedna strankam ne ponujajo več. Izjemo za posamezen teden nastaviš v stolpcu ob koledarju."
            onChange={(event) => void saveDefaultWeekLimit(event.target.value)}
          >
            <option value="">brez</option>
            {[1, 2, 3, 4, 5, 6, 7].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
          </select>
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
        <span className="razpolozljivost__mreza-glava" title="Največ delovnih dni v tednu">maks</span>
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="razpolozljivost__mreza-glava">{weekday}</span>
        ))}
        {Array.from({ length: Math.ceil((leadingBlanks + days.length) / 7) }, (_, rowIndex) => {
          const rowDays = days.slice(
            Math.max(0, rowIndex * 7 - leadingBlanks),
            (rowIndex + 1) * 7 - leadingBlanks,
          );
          const weekStart = rowDays[0] ? mondayKey(rowDays[0].date) : `prazen-${rowIndex}`;
          const limit = weekLimits.find((week) => week.weekStart === weekStart);
          const busyDates = new Set(
            termini.filter((termin) => mondayKey(termin.date) === weekStart).map((termin) => termin.date),
          );
          const blanksBefore = rowIndex === 0 ? leadingBlanks : 0;
          const blanksAfter = 7 - blanksBefore - rowDays.length;
          return (
            <div key={`vrstica-${weekStart}`} className="razpolozljivost__vrstica">
              {rowDays[0] ? (
                <select
                  className="razpolozljivost__teden"
                  value={limit?.hasOverride ? String(limit.maxWorkdays) : ''}
                  title={`Največ delovnih dni v tem tednu (zasedeni: ${busyDates.size}${limit?.maxWorkdays != null ? ` od ${limit.maxWorkdays}` : ''}). »auto« = privzeta vrednost iz nastavitve.`}
                  onChange={(event) => void saveWeekLimit(weekStart, event.target.value)}
                >
                  <option value="">{limit?.maxWorkdays != null && !limit.hasOverride ? `(${limit.maxWorkdays})` : 'auto'}</option>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              ) : (
                <span className="razpolozljivost__dan--prazen" />
              )}
              {Array.from({ length: blanksBefore }, (_, index) => (
                <span key={`pred-${index}`} className="razpolozljivost__dan--prazen" />
              ))}
              {rowDays.map((day) => renderDay(day))}
              {Array.from({ length: Math.max(0, blanksAfter) }, (_, index) => (
                <span key={`za-${index}`} className="razpolozljivost__dan--prazen" />
              ))}
            </div>
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
