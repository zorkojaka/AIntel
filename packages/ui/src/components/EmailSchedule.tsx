import { useEffect, useState } from 'react';

export function useEmailSchedule(open: boolean) {
  const [value, setValue] = useState('');
  useEffect(() => { setValue(''); }, [open]);
  const getScheduledAt = () => {
    if (!value) return undefined;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      throw new Error('Izberite veljaven datum in uro v prihodnosti.');
    }
    return date.toISOString();
  };
  return { value, setValue, getScheduledAt };
}

export function EmailSchedule({ value, onChange, disabled }: {
  value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  return <div className="space-y-2 rounded-md border p-3 text-sm">
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => {
        if (!event.target.checked) return onChange('');
        const date = new Date(Date.now() + 60 * 60 * 1000);
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        onChange(local.toISOString().slice(0, 16));
      }} />
      Odloženo pošiljanje
    </label>
    {value && <label className="block space-y-1">
      <span>Datum in ura pošiljanja</span>
      <input className="block rounded-md border bg-transparent px-3 py-2" aria-label="Datum in ura pošiljanja" type="datetime-local"
        required value={value} disabled={disabled} onChange={(event) => onChange(event.target.value || value)} />
      <span className="block text-xs text-muted-foreground">Časovni pas naprave: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Pošiljanje se izvede ob naslednjem preverjanju, praviloma v eni minuti.</span>
    </label>}
  </div>;
}
