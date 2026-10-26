import { useEffect, useState } from 'react';
import { Button, Card } from '@aintel/ui';
import { parseApiEnvelope } from '@aintel/shared/utils/api-client';

type BookingConfig = { bookingMinLeadDays?: number };

export function BookingSettingsSection() {
  const [days, setDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/config/platform.general', { credentials: 'include' });
        const data = await parseApiEnvelope<BookingConfig>(response, 'Nastavitev ni mogoče naložiti.');
        if (active) setDays(data.bookingMinLeadDays ?? 2);
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Nalaganje ni uspelo.'); }
    })();
    return () => { active = false; };
  }, []);

  async function save() {
    if (days === null) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const response = await fetch('/api/config/platform.general', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingMinLeadDays: days }),
      });
      const data = await parseApiEnvelope<BookingConfig>(response, 'Nastavitve ni mogoče shraniti.');
      setDays(data.bookingMinLeadDays ?? days);
      setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Shranjevanje ni uspelo.'); }
    finally { setSaving(false); }
  }

  return (
    <Card title="Izbira termina">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Privzeto, čez koliko dni je prvi termin, ki ga stranka lahko izbere prek povezave v emailu s ponudbo.
          Ob pošiljanju ga lahko ročno spremenite.
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {days === null ? (
          !error && <p>Nalagam nastavitve …</p>
        ) : (
          <>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span>Prvi razpoložljiv termin čez</span>
              <input
                type="number"
                min={0}
                max={30}
                value={days}
                disabled={saving}
                onChange={(event) => {
                  setSaved(false);
                  setDays(Math.max(0, Math.min(30, Math.floor(Number(event.target.value) || 0))));
                }}
                className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm"
              />
              <span>dni (0 = še isti dan, 1 = naslednji dan, 2 = čez dva dni)</span>
            </label>
            <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Shranjujem …' : 'Shrani'}</Button>
            {saved && <p role="status" className="text-sm text-muted-foreground">Shranjeno.</p>}
          </>
        )}
      </div>
    </Card>
  );
}
