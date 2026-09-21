import { useEffect, useState } from 'react';
import { Button, Card } from '@aintel/ui';
import { parseApiEnvelope } from '@aintel/shared/utils/api-client';

type Values = Record<string, Record<string, boolean | string[] | undefined>>;
type Options = {
  events: Array<{ key: string; label: string }>;
  roles: Array<{ key: string; label: string; description: string; events: string[] }>;
  recipients: Record<string, Array<{ email: string; name: string }>>;
  value: Values;
};

export function InternalNotificationsSection() {
  const [options, setOptions] = useState<Options | null>(null);
  const [value, setValue] = useState<Values>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    void (async () => {
      try {
        const response = await fetch('/api/settings/communication/internal-notifications', { credentials: 'include' });
        const data = await parseApiEnvelope<Options>(response, 'Nastavitev ni mogoče naložiti.');
        if (active) { setOptions(data); setValue(data.value); }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Nalaganje ni uspelo.'); }
    })();
    return () => { active = false; };
  }, [reload]);

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const response = await fetch('/api/settings/communication/internal-notifications', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
      });
      setValue(await parseApiEnvelope<Values>(response, 'Nastavitev ni mogoče shraniti.'));
      setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Shranjevanje ni uspelo.'); }
    finally { setSaving(false); }
  }

  return (
    <Card title="Interno obveščanje">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Izberite, ob katerih dogodkih se posamezni vlogi samodejno pošlje email.
          Nastavitev termina vključuje tudi izbiro termina prek povezave, ki jo prejme stranka.
          Monter prejme delovni nalog s PDF prilogo. Ročno pošiljanje ostane na voljo.
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!options ? (
          error ? <Button type="button" onClick={() => setReload((old) => old + 1)}>Poskusi znova</Button> : <p>Nalagam nastavitve …</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {options.roles.map((role) => (
                <fieldset key={role.key} disabled={saving} className="space-y-2 rounded-md border border-border p-4">
                  <legend className="px-1 text-sm font-medium">{role.label}</legend>
                  <p className="text-xs text-muted-foreground">{role.description}</p>
                  {options.events.filter((event) => role.events.includes(event.key)).map((event) => (
                    <label key={event.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={value[role.key]?.[event.key] === true}
                        onChange={(e) => {
                          setSaved(false);
                          setValue((old) => ({ ...old, [role.key]: { ...old[role.key], [event.key]: e.target.checked } }));
                        }} />
                      {event.label}
                    </label>
                  ))}
                  {(options.recipients[role.key] ?? []).length > 0 && (
                    <div className="space-y-1 border-t border-border pt-2">
                      <p className="text-xs text-muted-foreground">Prejemniki te vloge</p>
                      {(options.recipients[role.key] ?? []).map((recipient) => {
                        const selected = value[role.key]?.recipients;
                        const isSelected = !Array.isArray(selected) || selected.includes(recipient.email);
                        return (
                          <label key={recipient.email} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={isSelected}
                              onChange={(e) => {
                                setSaved(false);
                                setValue((old) => {
                                  const current = old[role.key] ?? {};
                                  const configured = Array.isArray(current.recipients)
                                    ? current.recipients : (options.recipients[role.key] ?? []).map((item) => item.email);
                                  const recipients = e.target.checked
                                    ? Array.from(new Set([...configured, recipient.email]))
                                    : configured.filter((email) => email !== recipient.email);
                                  return { ...old, [role.key]: { ...current, recipients } };
                                });
                              }} />
                            <span>{recipient.name ? `${recipient.name} — ` : ''}{recipient.email}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              ))}
            </div>
            <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Shranjujem …' : 'Shrani interno obveščanje'}</Button>
            {saved && <p role="status" className="text-sm text-muted-foreground">Nastavitve internega obveščanja so shranjene.</p>}
          </>
        )}
      </div>
    </Card>
  );
}
