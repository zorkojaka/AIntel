import React, { useEffect, useState } from 'react';
import { Button, Card, Input } from '@aintel/ui';

type SupplierEmailEntry = { address: string; isDefault: boolean };
type SupplierEntry = { key: string; name: string; emails: SupplierEmailEntry[] };

async function parseEnvelope<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || fallback);
  }
  return (payload?.data ?? payload) as T;
}

export const SuppliersSettingsSection: React.FC = () => {
  const [suppliers, setSuppliers] = useState<SupplierEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [draftEmails, setDraftEmails] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await parseEnvelope<{ suppliers: SupplierEntry[] }>(
          await fetch('/api/suppliers', { credentials: 'include' }),
          'Dobaviteljev ni bilo mogoče naložiti.'
        );
        if (active) setSuppliers(data.suppliers ?? []);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const save = async (supplier: SupplierEntry, emails: SupplierEmailEntry[]) => {
    setSavingKey(supplier.key);
    setError(null);
    try {
      const data = await parseEnvelope<{ supplier: SupplierEntry }>(
        await fetch(`/api/suppliers/${encodeURIComponent(supplier.key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: supplier.name, emails }),
        }),
        'Dobavitelja ni bilo mogoče shraniti.'
      );
      setSuppliers((prev) => prev.map((entry) => (entry.key === supplier.key ? data.supplier : entry)));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Napaka pri shranjevanju.');
    } finally {
      setSavingKey(null);
    }
  };

  const addEmail = (supplier: SupplierEntry) => {
    const address = (draftEmails[supplier.key] ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) {
      setError(`Vnesite veljaven e-naslov za dobavitelja ${supplier.name}.`);
      return;
    }
    if (supplier.emails.some((entry) => entry.address === address)) return;
    const emails = [...supplier.emails, { address, isDefault: supplier.emails.length === 0 }];
    setDraftEmails((prev) => ({ ...prev, [supplier.key]: '' }));
    void save(supplier, emails);
  };

  const removeEmail = (supplier: SupplierEntry, address: string) => {
    void save(supplier, supplier.emails.filter((entry) => entry.address !== address));
  };

  const setDefaultEmail = (supplier: SupplierEntry, address: string) => {
    void save(
      supplier,
      supplier.emails.map((entry) => ({ ...entry, isDefault: entry.address === address }))
    );
  };

  return (
    <div className="space-y-4">
      <Card title="Dobavitelji in naslovi za naročila">
        <p className="text-sm text-muted-foreground">
          Za vsakega dobavitelja nastavite e-naslove za pošiljanje naročil materiala. Privzeti naslov je v oknu
          »Naroči po emailu« predizbran; če jih je več, jih tam izberete iz spustnega seznama.
        </p>
        {error ? (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
        ) : null}
        {loading ? <p className="mt-3 text-sm text-muted-foreground">Nalagam dobavitelje ...</p> : null}
        {!loading && suppliers.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Ni dobaviteljev — dobavitelji se zbirajo iz cenika in naročil materiala.</p>
        ) : null}
      </Card>
      {suppliers.map((supplier) => (
        <Card key={supplier.key} title={supplier.name}>
          <div className="space-y-3">
            {supplier.emails.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ni nastavljenih e-naslovov.</p>
            ) : (
              <div className="space-y-2">
                {supplier.emails.map((entry) => (
                  <div key={entry.address} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                    <span className="text-sm font-medium">{entry.address}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="radio"
                          name={`default-${supplier.key}`}
                          checked={entry.isDefault}
                          onChange={() => setDefaultEmail(supplier, entry.address)}
                          disabled={savingKey === supplier.key}
                        />
                        privzeti
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeEmail(supplier, entry.address)}
                        disabled={savingKey === supplier.key}
                      >
                        Odstrani
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1">
                <Input
                  label="Dodaj e-naslov"
                  type="email"
                  placeholder="narocila@dobavitelj.si"
                  value={draftEmails[supplier.key] ?? ''}
                  onChange={(event) => setDraftEmails((prev) => ({ ...prev, [supplier.key]: event.target.value }))}
                />
              </div>
              <Button type="button" onClick={() => addEmail(supplier)} disabled={savingKey === supplier.key}>
                {savingKey === supplier.key ? 'Shranjujem ...' : 'Dodaj'}
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
