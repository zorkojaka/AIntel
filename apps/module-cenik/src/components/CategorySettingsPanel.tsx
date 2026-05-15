import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@aintel/ui';
import { ChevronDown, ChevronRight, RefreshCw, Save, UploadCloud } from 'lucide-react';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: string | null;
};

type CategoryPriority = 1 | 2 | 3 | null;

type CategorySetting = {
  _id: string;
  path: string;
  topLevel: string;
  subLevel: string | null;
  thirdLevel?: string | null;
  segmentType?: 'brand' | 'system_line' | null;
  level: 1 | 2 | 3;
  isActive: boolean;
  priority: CategoryPriority;
  productCountInApi: number;
  productCountActive: number;
  lastSyncedAt?: string | null;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
};

type DraftCategorySetting = CategorySetting & {
  isDirty?: boolean;
};

const recommendedVideoSubCategories = new Set([
  'Videonadzorni sistemi:Kamere',
  'Videonadzorni sistemi:Snemalniki',
  'Videonadzorni sistemi:Nosilci',
  'Videonadzorni sistemi:PoE stikala',
  'Videonadzorni sistemi:PTZ kamere',
  'Videonadzorni sistemi:Dodatki sistema videonadzora',
  'Videonadzorni sistemi:Mrežna oprema',
  'Videonadzorni sistemi:Konektorji',
  'Videonadzorni sistemi:Napajalniki',
  'Videonadzorni sistemi:Trdi diski',
  'Videonadzorni sistemi:Kabli',
  'Videonadzorni sistemi:Merjenje temperature',
  'Videonadzorni sistemi:PTZ tipkovnice',
]);

const excludedAlarmSubCategories = new Set([
  'Protivlomni sistemi:Sistemi zamegljevanja',
  'Protivlomni sistemi:Centri za sprejem podatkov in programska oprema',
]);

async function parseEnvelope<T>(response: Response) {
  const payload: ApiEnvelope<T> = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? 'Napaka pri komunikaciji s strežnikom.');
  }
  return payload.data;
}

function priorityValue(priority: CategoryPriority) {
  return priority === null ? '' : String(priority);
}

function parsePriority(value: string): CategoryPriority {
  if (value === '1' || value === '2' || value === '3') return Number(value) as 1 | 2 | 3;
  return null;
}

function formatPriority(priority: CategoryPriority, inherited?: CategoryPriority) {
  if (priority) return String(priority);
  if (inherited) return `Privzeto (${inherited})`;
  return 'Privzeto';
}

export function CategorySettingsPanel() {
  const [settings, setSettings] = useState<DraftCategorySetting[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cenik/category-settings');
      const data = await parseEnvelope<CategorySetting[]>(response);
      setSettings(data.map((setting) => ({ ...setting, isDirty: false })));
      setExpanded((prev) => (prev.size > 0 ? prev : new Set(data.filter((setting) => setting.level === 1).slice(0, 4).map((setting) => setting.path))));
      setMessage(null);
    } catch (error) {
      setMessage({ variant: 'error', text: error instanceof Error ? error.message : 'Nastavitev ni mogoče naložiti.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const grouped = useMemo(() => {
    const top = settings
      .filter((setting) => setting.level === 1)
      .slice()
      .sort((a, b) => b.productCountInApi - a.productCountInApi || a.path.localeCompare(b.path, 'sl'));
    const subsByTop = new Map<string, DraftCategorySetting[]>();
    const thirdBySub = new Map<string, DraftCategorySetting[]>();
    settings
      .filter((setting) => setting.level === 2)
      .forEach((setting) => {
        const current = subsByTop.get(setting.topLevel) ?? [];
        current.push(setting);
        subsByTop.set(setting.topLevel, current);
      });
    settings
      .filter((setting) => setting.level === 3)
      .forEach((setting) => {
        const subPath = `${setting.topLevel}:${setting.subLevel}`;
        const current = thirdBySub.get(subPath) ?? [];
        current.push(setting);
        thirdBySub.set(subPath, current);
      });
    subsByTop.forEach((subs) =>
      subs.sort((a, b) => b.productCountInApi - a.productCountInApi || a.path.localeCompare(b.path, 'sl')),
    );
    thirdBySub.forEach((children) =>
      children.sort((a, b) => b.productCountInApi - a.productCountInApi || a.path.localeCompare(b.path, 'sl')),
    );
    return { top, subsByTop, thirdBySub };
  }, [settings]);

  const dirtyCount = settings.filter((setting) => setting.isDirty).length;
  const activeCount = settings.filter((setting) => setting.isActive).length;
  const activeProductCount = settings
    .filter((setting) => {
      if (!setting.isActive) return false;
      if (setting.level === 3) return true;
      if (setting.level !== 2) return false;
      return !settings.some(
        (candidate) =>
          candidate.level === 3 &&
          candidate.topLevel === setting.topLevel &&
          candidate.subLevel === setting.subLevel,
      );
    })
    .reduce((total, setting) => total + setting.productCountInApi, 0);

  function updateSetting(path: string, patch: Partial<DraftCategorySetting>) {
    setSettings((prev) =>
      prev.map((setting) => (setting.path === path ? { ...setting, ...patch, isDirty: true } : setting)),
    );
  }

  function setTopActive(top: DraftCategorySetting, isActive: boolean) {
    if (!isActive) {
      const confirmed = window.confirm(`Deaktiviram tudi vse sub-kategorije za ${top.path}?`);
      if (!confirmed) return;
    }

    setSettings((prev) =>
      prev.map((setting) => {
        if (setting.path === top.path || setting.topLevel === top.path) {
          return { ...setting, isActive, isDirty: true };
        }
        return setting;
      }),
    );
  }

  function setSubActive(sub: DraftCategorySetting, isActive: boolean) {
    setSettings((prev) =>
      prev.map((setting) => {
        if (setting.path === sub.path || (setting.level === 3 && setting.topLevel === sub.topLevel && setting.subLevel === sub.subLevel)) {
          return { ...setting, isActive, isDirty: true };
        }
        if (isActive && setting.path === sub.topLevel && !setting.isActive) {
          return { ...setting, isActive: true, isDirty: true };
        }
        return setting;
      }),
    );
    if (isActive && !settings.find((setting) => setting.path === sub.topLevel)?.isActive) {
      window.alert(`Aktivirana je tudi top kategorija ${sub.topLevel}.`);
    }
  }

  function setThirdActive(third: DraftCategorySetting, isActive: boolean) {
    setSettings((prev) =>
      prev.map((setting) => {
        if (setting.path === third.path) {
          return { ...setting, isActive, isDirty: true };
        }
        if (isActive && setting.path === third.topLevel) {
          return { ...setting, isActive: true, isDirty: true };
        }
        if (isActive && setting.path === `${third.topLevel}:${third.subLevel}`) {
          return { ...setting, isActive: true, isDirty: true };
        }
        return setting;
      }),
    );
  }

  function applyRecommendedDefaults() {
    const confirmed = window.confirm('Naložim priporočene nastavitve za videonadzor, alarm, domofon in mrežno opremo?');
    if (!confirmed) return;

    setSettings((prev) =>
      prev.map((setting) => {
        let isActive = false;
        let priority: CategoryPriority = null;

        if (setting.path === 'Videonadzorni sistemi') {
          isActive = true;
          priority = 1;
        } else if (
          recommendedVideoSubCategories.has(setting.path) ||
          (setting.level === 3 && recommendedVideoSubCategories.has(`${setting.topLevel}:${setting.subLevel}`))
        ) {
          isActive = true;
        } else if (setting.path === 'Protivlomni sistemi') {
          isActive = true;
          priority = 1;
        } else if (
          setting.topLevel === 'Protivlomni sistemi' &&
          setting.level !== 1 &&
          !excludedAlarmSubCategories.has(`${setting.topLevel}:${setting.subLevel}`)
        ) {
          isActive = true;
        } else if (setting.path === 'Domofoni in video domofoni') {
          isActive = true;
          priority = 2;
        } else if (setting.topLevel === 'Domofoni in video domofoni' && setting.level === 2) {
          isActive = true;
        } else if (setting.path === 'Mrežna oprema') {
          isActive = true;
          priority = 3;
        } else if (setting.path === 'Mrežna oprema:Pribor') {
          isActive = true;
        }

        if (setting.isActive === isActive && setting.priority === priority) {
          return setting;
        }

        return { ...setting, isActive, priority, isDirty: true };
      }),
    );
    setMessage({ variant: 'success', text: 'Priporočene nastavitve so pripravljene. Za uveljavitev klikni Shrani nastavitve.' });
  }

  async function saveChanges() {
    const updates = settings
      .filter((setting) => setting.isDirty)
      .map((setting) => ({
        path: setting.path,
        isActive: setting.isActive,
        priority: setting.priority,
        notes: setting.notes,
      }));
    if (updates.length === 0) return;

    setSaving(true);
    try {
      const response = await fetch('/api/cenik/category-settings/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await parseEnvelope<CategorySetting[]>(response);
      setSettings(data.map((setting) => ({ ...setting, isDirty: false })));
      setMessage({ variant: 'success', text: 'Nastavitve kategorij so shranjene.' });
    } catch (error) {
      setMessage({ variant: 'error', text: error instanceof Error ? error.message : 'Shranjevanje ni uspelo.' });
    } finally {
      setSaving(false);
    }
  }

  async function refreshStats() {
    setRefreshing(true);
    try {
      const response = await fetch('/api/cenik/category-settings/refresh-stats', { method: 'POST' });
      const data = await parseEnvelope<CategorySetting[]>(response);
      setSettings(data.map((setting) => ({ ...setting, isDirty: false })));
      setMessage({ variant: 'success', text: 'Statistike kategorij so osvežene.' });
    } catch (error) {
      setMessage({ variant: 'error', text: error instanceof Error ? error.message : 'Osveževanje statistik ni uspelo.' });
    } finally {
      setRefreshing(false);
    }
  }

  async function syncAA() {
    const confirmed = window.confirm('Zaženem AA sync z aktivnimi kategorijami?');
    if (!confirmed) return;
    setSyncing(true);
    try {
      const response = await fetch('/api/admin/import/products/from-git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'aa_api', mode: 'apply' }),
      });
      await parseEnvelope<unknown>(response);
      setMessage({ variant: 'success', text: 'AA sync je zaključen.' });
      await refreshStats();
    } catch (error) {
      setMessage({ variant: 'error', text: error instanceof Error ? error.message : 'AA sync ni uspel.' });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <div className="rounded-lg border border-border/60 bg-card p-4 text-sm text-muted-foreground">Nalaganje nastavitev kategorij ...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Nastavitve kategorij</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Označi katere kategorije iz Alarm Automatika uporabljaš. Sync uvozi samo aktivne kategorije.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={applyRecommendedDefaults} disabled={saving}>
            Naloži priporočene
          </Button>
          <Button type="button" variant="outline" onClick={syncAA} disabled={syncing || saving}>
            <UploadCloud className="mr-2 h-4 w-4" />
            {syncing ? 'Sinhroniziram ...' : 'Sinhroniziraj iz AA'}
          </Button>
          <Button type="button" variant="outline" onClick={refreshStats} disabled={refreshing || saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {refreshing ? 'Osvežujem ...' : 'Posodobi statistike'}
          </Button>
          <Button type="button" onClick={saveChanges} disabled={saving || dirtyCount === 0}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Shranjujem ...' : `Shrani nastavitve${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </Button>
        </div>
      </div>

      {message && (
        <div className={`rounded-md border px-4 py-2 text-sm ${message.variant === 'success' ? 'border-success text-success' : 'border-destructive text-destructive'}`}>
          {message.text}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
        {grouped.top.map((top) => {
          const subs = grouped.subsByTop.get(top.path) ?? [];
          const isExpanded = expanded.has(top.path);
          return (
            <div key={top.path} className="border-b border-border/60 last:border-b-0">
              <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-3 py-3 md:grid-cols-[auto_auto_1fr_150px_120px]">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded border border-border/60"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      next.has(top.path) ? next.delete(top.path) : next.add(top.path);
                      return next;
                    })
                  }
                  aria-label={isExpanded ? 'Skrči' : 'Razširi'}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <input
                  type="checkbox"
                  checked={top.isActive}
                  onChange={(event) => setTopActive(top, event.target.checked)}
                  className="h-4 w-4"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{top.path}</div>
                  <div className="text-xs text-muted-foreground">
                    {top.productCountInApi} v API | {top.productCountActive} aktivnih v bazi
                  </div>
                </div>
                <select
                  value={priorityValue(top.priority)}
                  onChange={(event) => updateSetting(top.path, { priority: parsePriority(event.target.value) })}
                  disabled={!top.isActive}
                  className="hidden rounded border border-border bg-background px-2 py-1 text-sm disabled:opacity-50 md:block"
                >
                  <option value="">Brez</option>
                  <option value="1">Prioriteta 1</option>
                  <option value="2">Prioriteta 2</option>
                  <option value="3">Prioriteta 3</option>
                </select>
                <span className="hidden text-right text-xs text-muted-foreground md:block">{subs.length} sub</span>
              </div>

              {isExpanded && (
                <div className="divide-y divide-border/50 bg-muted/20">
                  {subs.map((sub) => {
                    const thirdChildren = grouped.thirdBySub.get(sub.path) ?? [];
                    const isSubExpanded = expanded.has(sub.path);
                    return (
                      <div key={sub.path}>
                        <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-4 py-2 pl-9 md:grid-cols-[auto_auto_1fr_150px_120px]">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border/60 disabled:opacity-30"
                            disabled={thirdChildren.length === 0}
                            onClick={() =>
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                next.has(sub.path) ? next.delete(sub.path) : next.add(sub.path);
                                return next;
                              })
                            }
                            aria-label={isSubExpanded ? 'Skrči' : 'Razširi'}
                          >
                            {thirdChildren.length === 0 ? null : isSubExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          <input
                            type="checkbox"
                            checked={sub.isActive}
                            onChange={(event) => setSubActive(sub, event.target.checked)}
                            className="h-4 w-4"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm text-foreground">{sub.subLevel}</span>
                              {thirdChildren.length > 0 && (
                                <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {thirdChildren.length} segmentov
                                </span>
                              )}
                              {!sub.isActive && sub.productCountInApi > 0 && (
                                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                  Nova
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {sub.productCountInApi} v API | {sub.productCountActive} aktivnih v bazi
                            </div>
                          </div>
                          <select
                            value={priorityValue(sub.priority)}
                            onChange={(event) => updateSetting(sub.path, { priority: parsePriority(event.target.value) })}
                            disabled={!sub.isActive}
                            className="rounded border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
                          >
                            <option value="">{formatPriority(null, top.priority)}</option>
                            <option value="1">Prioriteta 1</option>
                            <option value="2">Prioriteta 2</option>
                            <option value="3">Prioriteta 3</option>
                          </select>
                          <input
                            type="text"
                            value={sub.notes}
                            onChange={(event) => updateSetting(sub.path, { notes: event.target.value })}
                            placeholder="Opomba"
                            className="hidden rounded border border-border bg-background px-2 py-1 text-sm md:block"
                          />
                        </div>
                        {isSubExpanded && thirdChildren.length > 0 && (
                          <div className="divide-y divide-border/40 bg-background/70">
                            {thirdChildren.map((third) => (
                              <div key={third.path} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-4 py-2 pl-20 md:grid-cols-[auto_1fr_150px_120px]">
                                <input
                                  type="checkbox"
                                  checked={third.isActive}
                                  onChange={(event) => setThirdActive(third, event.target.checked)}
                                  className="h-4 w-4"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-sm text-foreground">{third.thirdLevel}</span>
                                    <span className="rounded-full border border-border/60 bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                      {third.segmentType === 'system_line' ? 'sistem' : 'proizvajalec'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {third.productCountInApi} v API | {third.productCountActive} aktivnih v bazi
                                  </div>
                                </div>
                                <select
                                  value={priorityValue(third.priority)}
                                  onChange={(event) => updateSetting(third.path, { priority: parsePriority(event.target.value) })}
                                  disabled={!third.isActive}
                                  className="rounded border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
                                >
                                  <option value="">{formatPriority(null, sub.priority ?? top.priority)}</option>
                                  <option value="1">Prioriteta 1</option>
                                  <option value="2">Prioriteta 2</option>
                                  <option value="3">Prioriteta 3</option>
                                </select>
                                <input
                                  type="text"
                                  value={third.notes}
                                  onChange={(event) => updateSetting(third.path, { notes: event.target.value })}
                                  placeholder="Opomba"
                                  className="hidden rounded border border-border bg-background px-2 py-1 text-sm md:block"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <span>Skupno aktivnih kategorij: {activeCount} od {settings.length}</span>
        <span>Skupno aktivnih izdelkov po izboru: {activeProductCount}</span>
      </div>
    </div>
  );
}
