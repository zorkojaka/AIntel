import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Input } from '@aintel/ui';

type ProductInfo = { id: string; name: string; price: number } | null;

type ScenarioType = 'posiljanje' | 'izvedba' | 'izvedba_napeljava';

type WebInquirySettings = {
  enabled: boolean;
  autoSendEmail: boolean;
  emailTemplateKey: string | null;
  videonadzor: {
    wifiCameraProductId: string | null;
    wifiCameraProduct: ProductInfo;
    wiredCameraProductId: string | null;
    wiredCameraProduct: ProductInfo;
    includeBrackets: boolean;
    dniSnemanja: number;
    motionRecord: boolean;
    scenarioWifi: ScenarioType;
    scenarioWiringReady: ScenarioType;
    scenarioWiringNotReady: ScenarioType;
    napeljavaUrPerCamera: number;
    utpKabelMetrovPerCamera: number;
    kanalMetrovPerCamera: number;
  };
  apiKeyConfigured: boolean;
  alarm: Record<string, any>;
  domofon: Record<string, any>;
  pametniDom: Record<string, any>;
  popusti: Array<{ nad: number; odstotek: number }>;
};

const PILLAR_PICKERJI: Array<{ kljuc: 'alarm' | 'domofon' | 'pametniDom'; naslov: string; polja: Array<[string, string]> }> = [
  {
    kljuc: 'alarm',
    naslov: 'Alarm (brezžični) – fiksne izbire',
    polja: [
      ['centralaProductId', 'Centrala (Ajax Hub)'],
      ['sensorAProductId', 'Senzor A (osnovni)'],
      ['sensorBProductId', 'Senzor B (srednji)'],
      ['sensorCProductId', 'Senzor C (napredni)'],
      ['sirenaZunanjaProductId', 'Zunanja sirena'],
      ['sirenaNotranjaProductId', 'Notranja sirena'],
      ['tipkovnicaProductId', 'Tipkovnica'],
      ['pozarProductId', 'Požarni senzor'],
      ['coProductId', 'CO senzor'],
    ],
  },
  {
    kljuc: 'domofon',
    naslov: 'Domofon – fiksne izbire',
    polja: [
      ['notranjaEnotaProductId', 'Notranja enota'],
      ['zunanjaEnotaProductId', 'Zunanja enota'],
    ],
  },
  {
    kljuc: 'pametniDom',
    naslov: 'Pametni dom – fiksne izbire (cena po napravi)',
    polja: [
      ['modulLuciProductId', 'Modul za luči'],
      ['modulSencilProductId', 'Modul za senčila'],
    ],
  },
];

type WebInquiryRow = {
  id: string;
  createdAt: string;
  pillar: string;
  status: string;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    siteAddress?: { full?: string };
  };
  projectId?: string | null;
  offerNumber?: string | null;
  offerTotalWithVat?: number | null;
  emailSent: boolean;
  defaultsApplied: string[];
  errorMessage?: string | null;
};

type SearchItem = { id: string; name: string; unitPrice: number };

const SCENARIO_OPTIONS: Array<{ value: ScenarioType; label: string }> = [
  { value: 'posiljanje', label: 'Pošiljanje' },
  { value: 'izvedba', label: 'Izvedba' },
  { value: 'izvedba_napeljava', label: 'Izvedba + napeljava' },
];

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  ponudba_poslana: 'Ponudba poslana',
  ponudba_ni_poslana: 'Ponudba ni poslana',
  napaka: 'Napaka',
};

function ProductPicker({
  label,
  product,
  onSelect,
}: {
  label: string;
  product: ProductInfo;
  onSelect: (item: SearchItem | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setResults([]);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/price-list/items/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        const data = Array.isArray(payload?.data) ? (payload.data as SearchItem[]) : [];
        setResults(data.slice(0, 10));
      } catch {
        /* aborted or failed – ignore */
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, open]);

  return (
    <div className="relative">
      <p className="mb-1 text-sm font-medium text-foreground">{label}</p>
      {product ? (
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
          <span>
            {product.name}
            <span className="ml-2 text-muted-foreground">{product.price?.toFixed(2)} € (neto)</span>
          </span>
          <Button variant="ghost" onClick={() => onSelect(null)}>
            Zamenjaj
          </Button>
        </div>
      ) : (
        <>
          <Input
            placeholder="Išči po ceniku (min. 2 znaka) ..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 200)}
          />
          {open && results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-background shadow-lg">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(item);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  {item.name}
                  <span className="ml-2 text-muted-foreground">{item.unitPrice?.toFixed(2)} €</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function WebInquiriesSection() {
  const [settings, setSettings] = useState<WebInquirySettings | null>(null);
  const [inquiries, setInquiries] = useState<WebInquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsResponse, inquiriesResponse] = await Promise.all([
        fetch('/api/web-inquiries/settings'),
        fetch('/api/web-inquiries?limit=30'),
      ]);
      const settingsPayload = await settingsResponse.json();
      const inquiriesPayload = await inquiriesResponse.json();
      if (!settingsPayload?.success) throw new Error(settingsPayload?.error ?? 'Napaka pri branju nastavitev.');
      setSettings(settingsPayload.data as WebInquirySettings);
      setInquiries(Array.isArray(inquiriesPayload?.data) ? (inquiriesPayload.data as WebInquiryRow[]) : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const response = await fetch('/api/web-inquiries/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: settings.enabled,
          autoSendEmail: settings.autoSendEmail,
          emailTemplateKey: settings.emailTemplateKey,
          videonadzor: {
            wifiCameraProductId: settings.videonadzor.wifiCameraProductId,
            wiredCameraProductId: settings.videonadzor.wiredCameraProductId,
            includeBrackets: settings.videonadzor.includeBrackets,
            dniSnemanja: settings.videonadzor.dniSnemanja,
            motionRecord: settings.videonadzor.motionRecord,
            scenarioWifi: settings.videonadzor.scenarioWifi,
            scenarioWiringReady: settings.videonadzor.scenarioWiringReady,
            scenarioWiringNotReady: settings.videonadzor.scenarioWiringNotReady,
            napeljavaUrPerCamera: settings.videonadzor.napeljavaUrPerCamera,
            utpKabelMetrovPerCamera: settings.videonadzor.utpKabelMetrovPerCamera,
            kanalMetrovPerCamera: settings.videonadzor.kanalMetrovPerCamera,
          },
          alarm: settings.alarm,
          domofon: settings.domofon,
          pametniDom: settings.pametniDom,
          popusti: settings.popusti,
        }),
      });
      const payload = await response.json();
      if (!payload?.success) throw new Error(payload?.error ?? 'Shranjevanje ni uspelo.');
      setSettings(payload.data as WebInquirySettings);
      setStatus('Nastavitve so shranjene.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Shranjevanje ni uspelo.');
    } finally {
      setSaving(false);
    }
  };

  const patchVideo = <K extends keyof WebInquirySettings['videonadzor']>(
    field: K,
    value: WebInquirySettings['videonadzor'][K]
  ) => {
    setSettings((current) => (current ? { ...current, videonadzor: { ...current.videonadzor, [field]: value } } : current));
  };

  if (loading && !settings) {
    return <Card title="Spletna povpraševanja">Nalagam ...</Card>;
  }

  return (
    <div className="space-y-6">
      <Card title="Spletna povpraševanja – vtičnik za inteligent.si">
        <div className="space-y-4">
          {error && <div className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">{error}</div>}
          {status && <div className="rounded-md border border-success px-3 py-2 text-sm text-success">{status}</div>}
          {settings && !settings.apiKeyConfigured && (
            <div className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
              API ključ ni nastavljen — v backend .env dodaj AINTEL_WEB_INQUIRY_API_KEY, sicer javni endpoint ne deluje.
            </div>
          )}
          {settings && (
            <>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
                  />
                  Sprejem spletnih povpraševanj je vklopljen
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.autoSendEmail}
                    onChange={(event) => setSettings({ ...settings, autoSendEmail: event.target.checked })}
                  />
                  Ponudbo samodejno pošlji stranki na e-mail
                </label>
              </div>

              <Input
                label="Ključ email predloge (offer_send)"
                value={settings.emailTemplateKey ?? ''}
                placeholder="prazno = privzeta predloga"
                onChange={(event) => setSettings({ ...settings, emailTemplateKey: event.target.value || null })}
              />

              <h4 className="pt-2 text-sm font-semibold text-foreground">Videonadzor – fiksne izbire</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <ProductPicker
                  label="WiFi kamera (1–3 kamere)"
                  product={settings.videonadzor.wifiCameraProduct}
                  onSelect={(item) => {
                    patchVideo('wifiCameraProductId', item ? item.id : null);
                    patchVideo('wifiCameraProduct', item ? { id: item.id, name: item.name, price: item.unitPrice } : null);
                  }}
                />
                <ProductPicker
                  label="Žična kamera (PoE)"
                  product={settings.videonadzor.wiredCameraProduct}
                  onSelect={(item) => {
                    patchVideo('wiredCameraProductId', item ? item.id : null);
                    patchVideo('wiredCameraProduct', item ? { id: item.id, name: item.name, price: item.unitPrice } : null);
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.videonadzor.includeBrackets}
                    onChange={(event) => patchVideo('includeBrackets', event.target.checked)}
                  />
                  V ponudbo vključi nosilce kamer
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.videonadzor.motionRecord}
                    onChange={(event) => patchVideo('motionRecord', event.target.checked)}
                  />
                  Snemanje ob gibanju (manjši disk)
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <Input
                  label="Dni snemanja (disk)"
                  type="number"
                  value={String(settings.videonadzor.dniSnemanja)}
                  onChange={(event) => patchVideo('dniSnemanja', Number(event.target.value) || 30)}
                />
                <Input
                  label="Ur napeljave / kamero"
                  type="number"
                  value={String(settings.videonadzor.napeljavaUrPerCamera)}
                  onChange={(event) => patchVideo('napeljavaUrPerCamera', Number(event.target.value) || 0)}
                />
                <Input
                  label="m UTP kabla / kamero"
                  type="number"
                  value={String(settings.videonadzor.utpKabelMetrovPerCamera)}
                  onChange={(event) => patchVideo('utpKabelMetrovPerCamera', Number(event.target.value) || 0)}
                />
                <Input
                  label="m kanala / kamero"
                  type="number"
                  value={String(settings.videonadzor.kanalMetrovPerCamera)}
                  onChange={(event) => patchVideo('kanalMetrovPerCamera', Number(event.target.value) || 0)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {(
                  [
                    ['scenarioWifi', 'Scenarij: WiFi kamere'],
                    ['scenarioWiringReady', 'Scenarij: žične, napeljava obstaja'],
                    ['scenarioWiringNotReady', 'Scenarij: žične, potrebna napeljava'],
                  ] as Array<[keyof WebInquirySettings['videonadzor'], string]>
                ).map(([field, label]) => (
                  <div key={field}>
                    <p className="mb-1 text-sm font-medium text-foreground">{label}</p>
                    <select
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={settings.videonadzor[field] as string}
                      onChange={(event) => patchVideo(field, event.target.value as never)}
                    >
                      {SCENARIO_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <h4 className="text-sm font-semibold text-foreground">Količinski popusti (po vrednosti ponudbe z DDV)</h4>
                <p className="text-xs text-muted-foreground">Uporabi se najvišji doseženi prag. Prazna lestvica = brez popustov.</p>
                {(settings.popusti ?? []).map((prag, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span>nad</span>
                    <Input
                      type="number"
                      value={String(prag.nad)}
                      onChange={(e) => {
                        const popusti = [...settings.popusti];
                        popusti[i] = { ...popusti[i], nad: Number(e.target.value) || 0 };
                        setSettings({ ...settings, popusti });
                      }}
                    />
                    <span>€ →</span>
                    <Input
                      type="number"
                      value={String(prag.odstotek)}
                      onChange={(e) => {
                        const popusti = [...settings.popusti];
                        popusti[i] = { ...popusti[i], odstotek: Number(e.target.value) || 0 };
                        setSettings({ ...settings, popusti });
                      }}
                    />
                    <span>%</span>
                    <Button variant="ghost" onClick={() => setSettings({ ...settings, popusti: settings.popusti.filter((_, j) => j !== i) })}>
                      Odstrani
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" onClick={() => setSettings({ ...settings, popusti: [...(settings.popusti ?? []), { nad: 0, odstotek: 0 }] })}>
                  + Dodaj prag
                </Button>
              </div>

              {PILLAR_PICKERJI.map((sklop) => (
                <div key={sklop.kljuc} className="space-y-4 border-t border-border pt-4">
                  <h4 className="text-sm font-semibold text-foreground">{sklop.naslov}</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    {sklop.polja.map(([polje, oznaka]) => (
                      <ProductPicker
                        key={polje}
                        label={oznaka}
                        product={settings[sklop.kljuc]?.[polje.replace('ProductId', 'Product')] ?? null}
                        onSelect={(item) => {
                          setSettings((current) =>
                            current
                              ? {
                                  ...current,
                                  [sklop.kljuc]: {
                                    ...current[sklop.kljuc],
                                    [polje]: item ? item.id : null,
                                    [polje.replace('ProductId', 'Product')]: item
                                      ? { id: item.id, name: item.name, price: item.unitPrice }
                                      : null,
                                  },
                                }
                              : current
                          );
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex justify-end">
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? 'Shranjujem ...' : 'Shrani nastavitve'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card title={`Zadnja spletna povpraševanja (${inquiries.length})`}>
        {inquiries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Še ni spletnih povpraševanj.</p>
        ) : (
          <div className="space-y-2">
            {inquiries.map((inquiry) => (
              <div key={inquiry.id} className="rounded-md border border-border px-3 py-2 text-sm">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                  onClick={() => setExpandedId(expandedId === inquiry.id ? null : inquiry.id)}
                >
                  <span>
                    <b>
                      {inquiry.contact.firstName} {inquiry.contact.lastName}
                    </b>{' '}
                    · {inquiry.pillar} · {new Date(inquiry.createdAt).toLocaleString('sl-SI')}
                  </span>
                  <span
                    className={
                      inquiry.status === 'ponudba_poslana'
                        ? 'text-success'
                        : inquiry.status === 'napaka'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    }
                  >
                    {STATUS_LABELS[inquiry.status] ?? inquiry.status}
                    {inquiry.offerNumber ? ` · ${inquiry.offerNumber}` : ''}
                    {inquiry.offerTotalWithVat ? ` · ${inquiry.offerTotalWithVat.toFixed(2)} €` : ''}
                  </span>
                </button>
                {expandedId === inquiry.id && (
                  <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                    <p>
                      {inquiry.contact.email} · {inquiry.contact.phone} · {inquiry.contact.siteAddress?.full}
                    </p>
                    {inquiry.projectId && <p>Projekt: {inquiry.projectId}</p>}
                    {inquiry.errorMessage && <p className="text-destructive">Napaka: {inquiry.errorMessage}</p>}
                    {inquiry.defaultsApplied?.length > 0 && (
                      <ul className="list-disc pl-4">
                        {inquiry.defaultsApplied.map((entry, index) => (
                          <li key={index}>{entry}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
