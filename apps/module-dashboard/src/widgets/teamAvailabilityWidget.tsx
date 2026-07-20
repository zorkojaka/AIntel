import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseApiEnvelope } from '@aintel/shared/utils/api-client';
import type { DashboardWidgetDefinition } from '../types';

// Pregled ekipe (admin/organizator): za vsak dan meseca vidiš, kateri monterji
// so na voljo in kaj imajo razpisano. Vrstica = monter, stolpec = dan.
// Klik na dan odpre podroben seznam terminov tistega dne.

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

interface WeekLimit {
  weekStart: string;
  maxWorkdays: number | null;
  hasOverride: boolean;
}

interface TeamMember {
  employeeId: string;
  name: string;
  days: AvailabilityDay[];
  termini: EmployeeTermin[];
  weekLimits: WeekLimit[];
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekdayShort(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('sl-SI', { weekday: 'narrow' });
}

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function TeamAvailability() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthShift, setMonthShift] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  // Ob hitrem preklapljanju mesecev sme obveljati samo zadnja zahteva.
  const reloadSeq = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++reloadSeq.current;
    try {
      const response = await fetch(
        `/api/availability/team/calendar?from=${dateKey(monthStart)}&days=${daysInMonth}`,
        { credentials: 'include' },
      );
      const payload = await parseApiEnvelope<{ members: TeamMember[] }>(
        response,
        'Ekipnega koledarja ni bilo mogoče naložiti.',
      );
      if (seq !== reloadSeq.current) return;
      setMembers(payload.members);
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

  const dates = useMemo(
    () => (members[0]?.days ?? []).map((day) => day.date),
    [members],
  );

  // Termini izbranega dne po monterjih — za seznam pod mrežo.
  const selectedDetails = useMemo(() => {
    if (!selectedDate) return [];
    return members
      .map((member) => ({
        name: member.name,
        hours: member.days.find((day) => day.date === selectedDate)?.hours ?? [],
        termini: member.termini.filter((termin) => termin.date === selectedDate),
      }))
      .filter((entry) => entry.hours.length > 0 || entry.termini.length > 0);
  }, [members, selectedDate]);

  if (loading) return <div className="dashboard-widget__meta">Nalagam koledar ekipe...</div>;
  if (error) return <div className="dashboard-widget__meta">{error}</div>;
  if (!members.length) return <div className="dashboard-widget__meta">Ni aktivnih monterjev.</div>;

  return (
    <div className="ekipa">
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
        <span className="dashboard-widget__meta ekipa__legenda">
          <span className="ekipa__vzorec je-prost" /> na voljo
          <span className="ekipa__vzorec je-termin" /> razpisan termin
          <span className="ekipa__vzorec je-opravljen" /> opravljeno
        </span>
      </div>

      <div className="ekipa__tabela-ovoj">
        <table className="ekipa__tabela">
          <thead>
            <tr>
              <th className="ekipa__monter-glava">Monter</th>
              {dates.map((date) => (
                <th
                  key={date}
                  className={[
                    'ekipa__dan-glava',
                    isWeekend(date) ? 'je-vikend' : '',
                    date === todayKey ? 'je-danes' : '',
                    date === selectedDate ? 'je-izbran' : '',
                  ].filter(Boolean).join(' ')}
                  title={new Date(`${date}T00:00:00`).toLocaleDateString('sl-SI', { weekday: 'long', day: 'numeric', month: 'long' })}
                >
                  <span className="ekipa__dan-teden">{weekdayShort(date)}</span>
                  <span>{Number(date.slice(8, 10))}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const terminiByDate = new Map<string, EmployeeTermin[]>();
              member.termini.forEach((termin) => {
                terminiByDate.set(termin.date, [...(terminiByDate.get(termin.date) ?? []), termin]);
              });
              const zasedenihDni = new Set(member.termini.map((termin) => termin.date)).size;
              return (
                <tr key={member.employeeId}>
                  <th className="ekipa__monter" title={`${zasedenihDni} zasedenih dni v prikazanem mesecu`}>
                    {member.name}
                    <span className="ekipa__monter-meta">{zasedenihDni} dni</span>
                  </th>
                  {member.days.map((day) => {
                    const dayTermini = terminiByDate.get(day.date) ?? [];
                    const done = dayTermini.length > 0 && dayTermini.every((termin) => termin.done);
                    const tooltip = [
                      `${member.name} — ${day.date}`,
                      day.hours.length ? `Na voljo ${day.hours[0]}:00–${(day.hours[day.hours.length - 1] ?? 0) + 1}:00` : 'Ni označene razpoložljivosti',
                      ...dayTermini.map(
                        (termin) => `${termin.done ? '✓' : '🔧'} ${termin.title} (${termin.startHour}:00–${termin.startHour + termin.hours}:00)`,
                      ),
                    ].join('\n');
                    return (
                      <td
                        key={day.date}
                        className={[
                          'ekipa__celica',
                          day.hours.length ? 'je-prost' : '',
                          dayTermini.length ? (done ? 'je-opravljen' : 'je-termin') : '',
                          isWeekend(day.date) ? 'je-vikend' : '',
                          day.date === todayKey ? 'je-danes' : '',
                          day.date === selectedDate ? 'je-izbran' : '',
                        ].filter(Boolean).join(' ')}
                        title={tooltip}
                        onClick={() => setSelectedDate((current) => (current === day.date ? null : day.date))}
                      >
                        {dayTermini.length ? (done ? '✓' : dayTermini.length) : ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedDate && (
        <div className="ekipa__podrobnosti">
          <div className="dashboard-widget__meta">
            {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('sl-SI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          {selectedDetails.length === 0 ? (
            <div className="dashboard-widget__meta">Ta dan ni ne razpoložljivosti ne terminov.</div>
          ) : (
            <ul className="ekipa__seznam">
              {selectedDetails.map((entry) => (
                <li key={entry.name}>
                  <strong>{entry.name}</strong>
                  {entry.hours.length ? (
                    <span className="ekipa__seznam-ure">
                      na voljo {entry.hours[0]}:00–{(entry.hours[entry.hours.length - 1] ?? 0) + 1}:00
                    </span>
                  ) : (
                    <span className="ekipa__seznam-ure">brez označene razpoložljivosti</span>
                  )}
                  {entry.termini.map((termin, index) => (
                    <span key={index} className={`ekipa__seznam-termin${termin.done ? ' je-opravljen' : ''}`}>
                      {termin.done ? '✓' : '🔧'} {termin.startHour}:00–{termin.startHour + termin.hours}:00 · {termin.title}
                      {termin.projectId ? ` (${termin.projectId})` : ''}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export const teamAvailabilityWidget: DashboardWidgetDefinition = {
  id: 'team-availability',
  title: 'Koledar ekipe',
  description: 'Razpoložljivost in razpisani termini vseh monterjev — klik na dan odpre podrobnosti.',
  roles: ['admin', 'organizer'],
  defaultEnabledForRoles: ['admin', 'organizer'],
  size: 'lg',
  render: () => <TeamAvailability />,
};
