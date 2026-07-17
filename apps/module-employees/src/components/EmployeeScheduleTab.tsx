import { useEffect, useState } from 'react';

// Urnik za termine montaž: admin tu izbere, ali si monter razpoložljivost
// klika sam (self) ali ima fiksni tedenski delavnik (fixed). Pri fiksnem se
// dnevi na koledarju označijo samodejno; ure tedna se klikajo enako kot pri
// monterjevem lastnem koledarju (dodaš/odvzameš posamezno uro).

interface ScheduleSettings {
  mode: 'self' | 'fixed';
  dayStartHour: number;
  dayEndHour: number;
  fixedWeeklyHours?: Record<string, number[]>;
  maxWorkdaysPerWeek?: number | null;
}

const HOUR_CHOICES = Array.from({ length: 15 }, (_, index) => 6 + index); // 6–20
const WEEK: Array<{ key: string; label: string }> = [
  { key: '1', label: 'Ponedeljek' },
  { key: '2', label: 'Torek' },
  { key: '3', label: 'Sreda' },
  { key: '4', label: 'Četrtek' },
  { key: '5', label: 'Petek' },
  { key: '6', label: 'Sobota' },
  { key: '0', label: 'Nedelja' },
];

export function EmployeeScheduleTab({ employeeId }: { employeeId: string }) {
  const [schedule, setSchedule] = useState<ScheduleSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/availability/employees/${encodeURIComponent(employeeId)}/schedule`, { credentials: 'include' })
      .then((response) => response.json())
      .then((payload) => {
        if (!alive) return;
        const data = payload?.data ?? payload;
        setSchedule(data?.schedule ?? { mode: 'self', dayStartHour: 8, dayEndHour: 16 });
      })
      .catch(() => alive && setMessage('Urnika ni bilo mogoče naložiti.'));
    return () => { alive = false; };
  }, [employeeId]);

  if (!schedule) return <p className="text-sm text-slate-500">{message ?? 'Nalagam urnik...'}</p>;

  const weekly = schedule.fixedWeeklyHours ?? {};

  const toggleHour = (dayKey: string, hour: number) => {
    const current = weekly[dayKey] ?? [];
    const next = current.includes(hour) ? current.filter((entry) => entry !== hour) : [...current, hour].sort((a, b) => a - b);
    setSchedule({ ...schedule, fixedWeeklyHours: { ...weekly, [dayKey]: next } });
  };

  const fillWorkweek = () => {
    const hours: number[] = [];
    for (let hour = schedule.dayStartHour; hour < schedule.dayEndHour; hour += 1) hours.push(hour);
    const next = { ...weekly };
    for (const key of ['1', '2', '3', '4', '5']) next[key] = hours;
    setSchedule({ ...schedule, fixedWeeklyHours: next });
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/availability/employees/${encodeURIComponent(employeeId)}/schedule`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: schedule.mode,
          dayStartHour: schedule.dayStartHour,
          dayEndHour: schedule.dayEndHour,
          fixedWeeklyHours: schedule.fixedWeeklyHours ?? {},
          maxWorkdaysPerWeek: schedule.maxWorkdaysPerWeek ?? null,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || 'Urnika ni bilo mogoče shraniti.');
      setMessage('Urnik je shranjen.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Urnika ni bilo mogoče shraniti.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Kdo določa razpoložljivost?</label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={schedule.mode}
          onChange={(event) => setSchedule({ ...schedule, mode: event.target.value as 'self' | 'fixed' })}
        >
          <option value="self">Monter sam klika proste dneve (privzeto)</option>
          <option value="fixed">Fiksni tedenski delavnik (označi se samodejno)</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Privzet delavnik:</label>
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={schedule.dayStartHour}
          onChange={(event) => setSchedule({ ...schedule, dayStartHour: Number(event.target.value) })}
        >
          {HOUR_CHOICES.map((hour) => <option key={hour} value={hour}>{hour}:00</option>)}
        </select>
        <span className="text-sm text-slate-500">–</span>
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={schedule.dayEndHour}
          onChange={(event) => setSchedule({ ...schedule, dayEndHour: Number(event.target.value) })}
        >
          {HOUR_CHOICES.map((hour) => <option key={hour + 1} value={hour + 1}>{hour + 1}:00</option>)}
        </select>
        <label className="ml-4 text-sm font-medium text-slate-700">Največ delovnih dni/teden:</label>
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={schedule.maxWorkdaysPerWeek ?? ''}
          title="Ko je v tednu zasedenih toliko dni, se preostali označeni prosti dnevi tistega tedna strankam ne ponujajo več. Izjeme po tednih monter nastavi na svojem koledarju."
          onChange={(event) =>
            setSchedule({ ...schedule, maxWorkdaysPerWeek: event.target.value === '' ? null : Number(event.target.value) })
          }
        >
          <option value="">brez omejitve</option>
          {[1, 2, 3, 4, 5, 6, 7].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
        </select>
      </div>

      {schedule.mode === 'fixed' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Tedenski delavnik (klikni ure)</span>
            <button type="button" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200" onClick={fillWorkweek}>
              Zapolni pon–pet s privzetim delavnikom
            </button>
          </div>
          {WEEK.map((day) => (
            <div key={day.key} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-sm text-slate-600">{day.label}</span>
              {HOUR_CHOICES.map((hour) => {
                const active = (weekly[day.key] ?? []).includes(hour);
                return (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => toggleHour(day.key, hour)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {hour}
                  </button>
                );
              })}
            </div>
          ))}
          <p className="text-xs text-slate-500">Izjeme (dopust, drugačen dan) monter ali admin uredi na koledarju razpoložljivosti — zapis dneva prepiše tedenski vzorec.</p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Monter na nadzorni plošči (widget »Moja razpoložljivost«) sam poklika dneve; privzet delavnik zgoraj se uporabi ob kliku na dan.</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Shranjujem...' : 'Shrani urnik'}
        </button>
        {message ? <span className="text-sm text-slate-600">{message}</span> : null}
      </div>
    </div>
  );
}
