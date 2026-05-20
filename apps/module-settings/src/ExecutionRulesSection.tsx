import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, Input } from '@aintel/ui';
import {
  fetchCenikServiceProducts,
  fetchExecutionRuleSettings,
  fetchExecutionRuleSuggestions,
  saveExecutionRuleSettings,
  type CenikServiceProduct,
  type ExecutionQuantityRule,
  type ExecutionRuleSettings,
  type ExecutionScenario,
  type ProductServiceExecutionRule,
} from './api';

type PriceListSearchItem = {
  id: string;
  name: string;
  code?: string;
  categorySlugs?: string[];
  categories?: string[];
  isService?: boolean;
  externalSource?: string;
  unit?: string;
  unitPrice: number;
};

const SCENARIO_LABELS: Record<ExecutionScenario['type'], string> = {
  posiljanje: 'Pošiljanje',
  izvedba: 'Izvedba',
  izvedba_napeljava: 'Izvedba z napeljavo',
};

const DEFAULT_SCENARIOS: ExecutionScenario[] = [
  { type: 'posiljanje', ime: 'Pošiljanje', storitve: [] },
  { type: 'izvedba', ime: 'Izvedba', storitve: [] },
  {
    type: 'izvedba_napeljava',
    ime: 'Izvedba z napeljavo',
    storitve: [],
    defaultEstimates: {
      napeljavaUrPerKamera: 2,
      utpKabelMetrovPerKamera: 20,
      kanalMetrovPerKamera: 4,
      kilometrinaKm: 0,
    },
  },
];

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultQuantityRule(): ExecutionQuantityRule {
  return { type: 'fixed', value: 1, field: '' };
}

function serviceName(services: CenikServiceProduct[], id: string) {
  return services.find((service) => service._id === id)?.ime ?? 'Izberi storitev';
}

function selectedProduct(services: CenikServiceProduct[], id: string) {
  return services.find((service) => service._id === id) ?? null;
}

function formatCurrency(value: number) {
  return `${Number(value ?? 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function mergeScenarios(input: ExecutionScenario[] = []) {
  const byType = new Map(input.map((scenario) => [scenario.type, scenario]));
  return DEFAULT_SCENARIOS.map((fallback) => ({
    ...fallback,
    ...(byType.get(fallback.type) ?? {}),
    defaultEstimates: {
      ...(fallback.defaultEstimates ?? {}),
      ...(byType.get(fallback.type)?.defaultEstimates ?? {}),
    },
  }));
}

export function ExecutionRulesSection() {
  const [settings, setSettings] = useState<ExecutionRuleSettings | null>(null);
  const [services, setServices] = useState<CenikServiceProduct[]>([]);
  const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof fetchExecutionRuleSuggestions>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchExecutionRuleSettings(), fetchCenikServiceProducts()])
      .then(([loadedSettings, loadedServices]) => {
        if (!active) return;
        setSettings({ ...loadedSettings, scenarios: mergeScenarios(loadedSettings.scenarios) });
        setServices(loadedServices);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Pravil izvedbe ni mogoče naložiti.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = (updater: (current: ExecutionRuleSettings) => ExecutionRuleSettings) => {
    setSettings((current) => (current ? updater(current) : current));
  };

  const addRule = () => {
    updateSettings((current) => ({
      ...current,
      productServiceRules: [
        ...current.productServiceRules,
        {
          id: newId('rule'),
          triggerType: 'classification',
          triggerValue: 'kamera',
          serviceProductId: '',
          quantityRule: { type: 'per_unit', value: 1, field: '' },
          isActive: true,
        },
      ],
    }));
  };

  const updateRule = (id: string, patch: Partial<ProductServiceExecutionRule>) => {
    updateSettings((current) => ({
      ...current,
      productServiceRules: current.productServiceRules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    }));
  };

  const updateRuleQuantity = (id: string, patch: Partial<ExecutionQuantityRule>) => {
    updateSettings((current) => ({
      ...current,
      productServiceRules: current.productServiceRules.map((rule) =>
        rule.id === id ? { ...rule, quantityRule: { ...rule.quantityRule, ...patch } } : rule,
      ),
    }));
  };

  const removeRule = (id: string) => {
    updateSettings((current) => ({
      ...current,
      productServiceRules: current.productServiceRules.filter((rule) => rule.id !== id),
    }));
  };

  const addScenarioService = (type: ExecutionScenario['type']) => {
    updateSettings((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) =>
        scenario.type === type
          ? {
              ...scenario,
              storitve: [
                ...scenario.storitve,
                {
                  id: newId('scenario-service'),
                  serviceProductId: '',
                  quantityRule: defaultQuantityRule(),
                  description: '',
                },
              ],
            }
          : scenario,
      ),
    }));
  };

  const updateScenario = (type: ExecutionScenario['type'], updater: (scenario: ExecutionScenario) => ExecutionScenario) => {
    updateSettings((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) => (scenario.type === type ? updater(scenario) : scenario)),
    }));
  };

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      setSuggestions(await fetchExecutionRuleSuggestions());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Predlogov ni mogoče pripraviti.');
    } finally {
      setLoading(false);
    }
  };

  const acceptSuggestions = () => {
    if (!suggestions) return;
    updateSettings((current) => {
      const existingRuleKeys = new Set(current.productServiceRules.map((rule) => `${rule.triggerType}:${rule.triggerValue}:${rule.serviceProductId}`));
      const nextRules = [
        ...current.productServiceRules,
        ...suggestions.productServiceRules.filter((rule) => !existingRuleKeys.has(`${rule.triggerType}:${rule.triggerValue}:${rule.serviceProductId}`)),
      ];
      const nextScenarios = current.scenarios.map((scenario) => {
        const additions = suggestions.scenarios.filter((suggestion) => suggestion.type === scenario.type);
        const existingServices = new Set(scenario.storitve.map((service) => service.serviceProductId));
        return {
          ...scenario,
          storitve: [
            ...scenario.storitve,
            ...additions
              .filter((suggestion) => !existingServices.has(suggestion.serviceProductId))
              .map((suggestion) => ({
                id: newId('scenario-service'),
                serviceProductId: suggestion.serviceProductId,
                quantityRule: suggestion.quantityRule ?? defaultQuantityRule(),
                description: suggestion.description ?? '',
              })),
          ],
        };
      });
      return { ...current, productServiceRules: nextRules, scenarios: nextScenarios };
    });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await saveExecutionRuleSettings({
        productServiceRules: settings.productServiceRules,
        scenarios: settings.scenarios,
      });
      setSettings({ ...saved, scenarios: mergeScenarios(saved.scenarios) });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pravil izvedbe ni mogoče shraniti.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return <Card title="Pravila izvedbe">Nalagam pravila izvedbe ...</Card>;
  }

  if (!settings) {
    return <Card title="Pravila izvedbe">{error ?? 'Pravila izvedbe niso na voljo.'}</Card>;
  }

  return (
    <section className="space-y-6">
      <Card title="Pravila izvedbe">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Nastavitve so vezane na podjetje/uporabnika in se uporabijo pri nadaljevanju Zahteve v Ponudbo.
          </p>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Shranjujem ...' : 'Shrani pravila izvedbe'}
          </Button>
        </div>
        {error ? <div className="mt-3 text-sm text-destructive">{error}</div> : null}
      </Card>

      <Card title="Izdelek → priporočena storitev">
        <div className="mb-3 flex justify-end">
          <Button type="button" variant="outline" onClick={addRule}>Dodaj pravilo</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left">Pogoj</th>
                <th className="px-3 py-2 text-left">Vrednost</th>
                <th className="px-3 py-2 text-left">Dodatno polje</th>
                <th className="px-3 py-2 text-left">Storitev</th>
                <th className="px-3 py-2 text-left">Količina</th>
                <th className="px-3 py-2 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {settings.productServiceRules.map((rule) => (
                <tr key={rule.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <select className="w-full rounded border border-border px-2 py-2" value={rule.triggerType} onChange={(event) => updateRule(rule.id, { triggerType: event.target.value as ProductServiceExecutionRule['triggerType'] })}>
                      <option value="classification">Vrsta izdelka</option>
                      <option value="product">Konkreten izdelek</option>
                      <option value="category">Kategorija</option>
                      <option value="project">Tip projekta</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Input value={rule.triggerValue} onChange={(event) => updateRule(rule.id, { triggerValue: event.target.value })} placeholder="kamera, productId, kategorija ..." />
                  </td>
                  <td className="px-3 py-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={rule.triggerField ?? ''} onChange={(event) => updateRule(rule.id, { triggerField: event.target.value })} placeholder="nvrChannels" />
                      <Input value={rule.triggerFieldValue ?? ''} onChange={(event) => updateRule(rule.id, { triggerFieldValue: event.target.value })} placeholder="8" />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <PriceListServiceAutocomplete
                      selected={selectedProduct(services, rule.serviceProductId)}
                      onSelect={(product) => updateRule(rule.id, { serviceProductId: product.id })}
                      onClear={() => updateRule(rule.id, { serviceProductId: '' })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <QuantityRuleEditor value={rule.quantityRule} onChange={(patch) => updateRuleQuantity(rule.id, patch)} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeRule(rule.id)}>Izbriši</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Scenariji izvedbe">
        <div className="grid gap-4">
          {settings.scenarios.map((scenario) => (
            <div key={scenario.type} className="rounded-md border border-border p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{SCENARIO_LABELS[scenario.type]}</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => addScenarioService(scenario.type)}>Dodaj storitev</Button>
              </div>
              <div className="space-y-2">
                {scenario.storitve.map((service) => (
                  <div key={service.id} className="grid gap-2 md:grid-cols-[1fr_180px_1fr_auto]">
                    <PriceListServiceAutocomplete
                      selected={selectedProduct(services, service.serviceProductId)}
                      onSelect={(product) => updateScenario(scenario.type, (current) => ({ ...current, storitve: current.storitve.map((entry) => entry.id === service.id ? { ...entry, serviceProductId: product.id } : entry) }))}
                      onClear={() => updateScenario(scenario.type, (current) => ({ ...current, storitve: current.storitve.map((entry) => entry.id === service.id ? { ...entry, serviceProductId: '' } : entry) }))}
                    />
                    <QuantityRuleEditor value={service.quantityRule} onChange={(patch) => updateScenario(scenario.type, (current) => ({ ...current, storitve: current.storitve.map((entry) => entry.id === service.id ? { ...entry, quantityRule: { ...entry.quantityRule, ...patch } } : entry) }))} />
                    <Input value={service.description ?? ''} onChange={(event) => updateScenario(scenario.type, (current) => ({ ...current, storitve: current.storitve.map((entry) => entry.id === service.id ? { ...entry, description: event.target.value } : entry) }))} placeholder="opis" />
                    <Button type="button" variant="ghost" size="sm" onClick={() => updateScenario(scenario.type, (current) => ({ ...current, storitve: current.storitve.filter((entry) => entry.id !== service.id) }))}>Izbriši</Button>
                  </div>
                ))}
                {scenario.storitve.length === 0 ? <p className="text-sm text-muted-foreground">Ni dodanih storitev.</p> : null}
              </div>
              {scenario.type === 'izvedba_napeljava' ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Input label="Ur napeljave / kamera" type="number" value={scenario.defaultEstimates?.napeljavaUrPerKamera ?? 2} onChange={(event) => updateScenario(scenario.type, (current) => ({ ...current, defaultEstimates: { ...(current.defaultEstimates ?? { napeljavaUrPerKamera: 2, utpKabelMetrovPerKamera: 20, kanalMetrovPerKamera: 4, kilometrinaKm: 0 }), napeljavaUrPerKamera: Number(event.target.value) } }))} />
                  <Input label="UTP metrov / kamera" type="number" value={scenario.defaultEstimates?.utpKabelMetrovPerKamera ?? 20} onChange={(event) => updateScenario(scenario.type, (current) => ({ ...current, defaultEstimates: { ...(current.defaultEstimates ?? { napeljavaUrPerKamera: 2, utpKabelMetrovPerKamera: 20, kanalMetrovPerKamera: 4, kilometrinaKm: 0 }), utpKabelMetrovPerKamera: Number(event.target.value) } }))} />
                  <Input label="Kanal metrov / kamera" type="number" value={scenario.defaultEstimates?.kanalMetrovPerKamera ?? 4} onChange={(event) => updateScenario(scenario.type, (current) => ({ ...current, defaultEstimates: { ...(current.defaultEstimates ?? { napeljavaUrPerKamera: 2, utpKabelMetrovPerKamera: 20, kanalMetrovPerKamera: 4, kilometrinaKm: 0 }), kanalMetrovPerKamera: Number(event.target.value) } }))} />
                  <Input label="Privzeta kilometrina (km)" type="number" value={scenario.defaultEstimates?.kilometrinaKm ?? 0} onChange={(event) => updateScenario(scenario.type, (current) => ({ ...current, defaultEstimates: { ...(current.defaultEstimates ?? { napeljavaUrPerKamera: 2, utpKabelMetrovPerKamera: 20, kanalMetrovPerKamera: 4, kilometrinaKm: 0 }), kilometrinaKm: Number(event.target.value) } }))} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Hitri pomočnik">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => void loadSuggestions()} disabled={loading}>Predlagaj pravila iz cenika</Button>
          {suggestions ? <Button type="button" onClick={acceptSuggestions}>Potrdi predloge</Button> : null}
        </div>
        {suggestions ? (
          <div className="mt-4 grid gap-3 text-sm">
            {suggestions.productServiceRules.map((rule) => (
              <div key={rule.id} className="rounded-md border border-border p-3">
                {rule.reason} Pogoj: {rule.triggerType} = {rule.triggerValue}, storitev: {rule.serviceProduct?.name ?? serviceName(services, rule.serviceProductId)}
              </div>
            ))}
            {suggestions.scenarios.map((suggestion) => (
              <div key={`${suggestion.type}-${suggestion.serviceProductId}`} className="rounded-md border border-border p-3">
                Scenarij: {SCENARIO_LABELS[suggestion.type]}, storitev: {suggestion.serviceProduct?.name ?? serviceName(services, suggestion.serviceProductId)}
              </div>
            ))}
            {!suggestions.productServiceRules.length && !suggestions.scenarios.length ? <p className="text-muted-foreground">Ni najdenih predlogov v ceniku storitev.</p> : null}
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function PriceListServiceAutocomplete({
  selected,
  onSelect,
  onClear,
}: {
  selected: CenikServiceProduct | null;
  onSelect: (product: PriceListSearchItem) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PriceListSearchItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const dropdownInteractionRef = useRef(false);

  const updateAnchorRect = useCallback(() => {
    if (inputRef.current) {
      setAnchorRect(inputRef.current.getBoundingClientRect());
    }
  }, []);

  const openDropdown = useCallback(() => {
    setIsOpen(true);
    updateAnchorRect();
  }, [updateAnchorRect]);

  useEffect(() => {
    if (!isOpen) {
      setAnchorRect(null);
      setResults([]);
      setLoading(false);
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
      return;
    }

    updateAnchorRect();
    const onPositionChange = () => updateAnchorRect();
    window.addEventListener('scroll', onPositionChange, true);
    window.addEventListener('resize', onPositionChange);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return () => {
        window.removeEventListener('scroll', onPositionChange, true);
        window.removeEventListener('resize', onPositionChange);
      };
    }

    setLoading(true);
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/price-list/items/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        const data = Array.isArray(payload?.data) ? payload.data as PriceListSearchItem[] : [];
        setResults(
          data.sort((a, b) => {
            const aPreferred = a.isService || a.externalSource === 'manual' ? 0 : 1;
            const bPreferred = b.isService || b.externalSource === 'manual' ? 0 : 1;
            return aPreferred - bPreferred;
          }).slice(0, 12),
        );
      } catch (error) {
        if ((error as DOMException)?.name !== 'AbortError') {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      window.removeEventListener('scroll', onPositionChange, true);
      window.removeEventListener('resize', onPositionChange);
    };
  }, [isOpen, query, updateAnchorRect]);

  useEffect(
    () => () => {
      fetchAbortRef.current?.abort();
      if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
    },
    [],
  );

  const handleSelect = (product: PriceListSearchItem) => {
    onSelect(product);
    setQuery('');
    setIsOpen(false);
  };

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  return (
    <div className="relative">
      {selected ? (
        <div className="flex min-h-10 items-center justify-between gap-2 rounded border border-border bg-background px-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium">{selected.ime}</span>
            <span className="block text-xs text-muted-foreground">{formatCurrency(selected.prodajnaCena)}</span>
          </span>
          <button type="button" className="shrink-0 rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClear} aria-label="Počisti storitev">
            ×
          </button>
        </div>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Išči storitev..."
          className="min-h-10 w-full rounded border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => {
            setQuery(event.target.value);
            if (!isOpen) openDropdown();
          }}
          onFocus={() => {
            if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
            openDropdown();
          }}
          onBlur={() => {
            if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = window.setTimeout(() => {
              if (!dropdownInteractionRef.current) setIsOpen(false);
            }, 100);
          }}
        />
      )}

      {isOpen && !selected && anchorRect && portalTarget
        ? createPortal(
            <div
              className="fixed z-[9999] rounded border border-border bg-popover text-sm shadow-lg"
              style={{ top: anchorRect.bottom + 4, left: anchorRect.left, width: anchorRect.width }}
              onMouseEnter={() => {
                dropdownInteractionRef.current = true;
              }}
              onMouseLeave={() => {
                dropdownInteractionRef.current = false;
              }}
            >
              <div className="max-h-72 overflow-y-auto py-1">
                {loading ? <div className="px-3 py-2 text-xs text-muted-foreground">Iskanje...</div> : null}
                {!loading && query.trim() && results.length === 0 ? <div className="px-3 py-2 text-xs text-muted-foreground">Ni zadetkov.</div> : null}
                {!loading && !query.trim() ? <div className="px-3 py-2 text-xs text-muted-foreground">Začni pisati naziv storitve.</div> : null}
                {!loading
                  ? results.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/70"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelect(product)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{product.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {product.isService ? 'Storitev' : product.externalSource === 'manual' ? 'Ročni vnos' : 'Izdelek'}
                            {product.unit ? ` • ${product.unit}` : ''}
                            {product.categorySlugs?.length ? ` • ${product.categorySlugs.slice(0, 2).join(', ')}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatCurrency(product.unitPrice)}</span>
                      </button>
                    ))
                  : null}
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}

function QuantityRuleEditor({ value, onChange }: { value: ExecutionQuantityRule; onChange: (patch: Partial<ExecutionQuantityRule>) => void }) {
  return (
    <div className="grid grid-cols-[1fr_90px] gap-2">
      <select className="rounded border border-border px-2 py-2 text-sm" value={value.type} onChange={(event) => onChange({ type: event.target.value as ExecutionQuantityRule['type'] })}>
        <option value="fixed">Fixed</option>
        <option value="per_unit">Per unit</option>
        <option value="per_classification_field">Per field</option>
      </select>
      {value.type === 'per_classification_field' ? (
        <Input value={value.field ?? ''} onChange={(event) => onChange({ field: event.target.value })} placeholder="field" />
      ) : (
        <Input type="number" value={value.value ?? 1} onChange={(event) => onChange({ value: Number(event.target.value) })} />
      )}
    </div>
  );
}
