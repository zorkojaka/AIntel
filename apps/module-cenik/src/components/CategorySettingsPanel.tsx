import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@aintel/ui';
import { ChevronDown, ChevronRight, Save, UploadCloud } from 'lucide-react';
import { parseApiEnvelope } from '@aintel/shared/utils/api-client';

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
  marginPercent: number;
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

type SegmentGroup = {
  key: string;
  topLevel: string;
  name: string;
  segmentType: 'brand' | 'system_line' | null;
  children: DraftCategorySetting[];
  productCountInApi: number;
  productCountActive: number;
  activeChildren: number;
  priority: CategoryPriority;
  marginPercent: number;
  hasMixedMargin: boolean;
  hasMixedPriority: boolean;
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

const syncSteps = [
  'Prenašam iz AA API...',
  'Primerjam z bazo...',
  'Klasificiram izdelke...',
  'Posodabljam cenik...',
  'Končano ✓',
];

async function parseEnvelope<T>(response: Response) {
  return parseApiEnvelope<T>(response, 'Napaka pri komunikaciji s strežnikom.');
}

function priorityValue(priority: CategoryPriority) {
  return priority === null ? '' : String(priority);
}

function parsePriority(value: string): CategoryPriority {
  if (value === '1' || value === '2' || value === '3') return Number(value) as 1 | 2 | 3;
  return null;
}

function parseMarginPercent(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(500, Math.round((parsed + Number.EPSILON) * 100) / 100);
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
  const [syncing, setSyncing] = useState(false);
  const [syncStepIndex, setSyncStepIndex] = useState(0);
  const [syncProgress, setSyncProgress] = useState(0);
  const [message, setMessage] = useState<{ variant: 'success' | 'warning' | 'error'; text: string } | null>(null);

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
    const segmentsByTop = new Map<string, SegmentGroup[]>();
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

        const segmentKey = `${setting.topLevel}:${setting.thirdLevel}`;
        const segments = segmentsByTop.get(setting.topLevel) ?? [];
        const existing = segments.find((segment) => segment.key === segmentKey);
        if (existing) {
          existing.children.push(setting);
          existing.productCountInApi += setting.productCountInApi;
          existing.productCountActive += setting.productCountActive;
          existing.activeChildren += setting.isActive ? 1 : 0;
        } else {
          segments.push({
            key: segmentKey,
            topLevel: setting.topLevel,
            name: setting.thirdLevel ?? '',
            segmentType: setting.segmentType ?? null,
            children: [setting],
            productCountInApi: setting.productCountInApi,
            productCountActive: setting.productCountActive,
            activeChildren: setting.isActive ? 1 : 0,
            priority: setting.priority,
            marginPercent: setting.marginPercent ?? 0,
            hasMixedMargin: false,
            hasMixedPriority: false,
          });
          segmentsByTop.set(setting.topLevel, segments);
        }
      });
    subsByTop.forEach((subs) =>
      subs.sort((a, b) => b.productCountInApi - a.productCountInApi || a.path.localeCompare(b.path, 'sl')),
    );
    thirdBySub.forEach((children) =>
      children.sort((a, b) => b.productCountInApi - a.productCountInApi || a.path.localeCompare(b.path, 'sl')),
    );
    segmentsByTop.forEach((segments) => {
      segments.forEach((segment) => {
        segment.children.sort((a, b) => b.productCountInApi - a.productCountInApi || a.subLevel?.localeCompare(b.subLevel ?? '', 'sl') || 0);
        const priorities = new Set(segment.children.map((child) => child.priority ?? null));
        const margins = new Set(segment.children.map((child) => child.marginPercent ?? 0));
        segment.hasMixedPriority = priorities.size > 1;
        segment.hasMixedMargin = margins.size > 1;
        segment.priority = segment.hasMixedPriority ? null : segment.children[0]?.priority ?? null;
        segment.marginPercent = segment.hasMixedMargin ? 0 : segment.children[0]?.marginPercent ?? 0;
      });
      segments.sort((a, b) => b.productCountInApi - a.productCountInApi || a.name.localeCompare(b.name, 'sl'));
    });
    return { top, subsByTop, thirdBySub, segmentsByTop };
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

  function setSegmentActive(segment: SegmentGroup, isActive: boolean) {
    const affectedSubLevels = new Set(segment.children.map((child) => child.subLevel).filter(Boolean));
    setSettings((prev) =>
      prev.map((setting) => {
        if (setting.level === 3 && setting.topLevel === segment.topLevel && setting.thirdLevel === segment.name) {
          return { ...setting, isActive, isDirty: true };
        }
        if (isActive && setting.path === segment.topLevel) {
          return { ...setting, isActive: true, isDirty: true };
        }
        if (isActive && setting.level === 2 && setting.topLevel === segment.topLevel && affectedSubLevels.has(setting.subLevel)) {
          return { ...setting, isActive: true, isDirty: true };
        }
        return setting;
      }),
    );
  }

  function setSegmentPriority(segment: SegmentGroup, priority: CategoryPriority) {
    setSettings((prev) =>
      prev.map((setting) => {
        if (setting.level === 3 && setting.topLevel === segment.topLevel && setting.thirdLevel === segment.name) {
          return { ...setting, priority, isDirty: true };
        }
        return setting;
      }),
    );
  }

  function setSegmentMargin(segment: SegmentGroup, marginPercent: number) {
    setSettings((prev) =>
      prev.map((setting) => {
        if (setting.level === 3 && setting.topLevel === segment.topLevel && setting.thirdLevel === segment.name) {
          return { ...setting, marginPercent, isDirty: true };
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
          priority = null;
        } else if (
          recommendedVideoSubCategories.has(setting.path) ||
          (setting.level === 3 && recommendedVideoSubCategories.has(`${setting.topLevel}:${setting.subLevel}`))
        ) {
          isActive = true;
          priority = setting.level === 3 ? 1 : null;
        } else if (setting.path === 'Protivlomni sistemi') {
          isActive = true;
          priority = null;
        } else if (
          setting.topLevel === 'Protivlomni sistemi' &&
          setting.level !== 1 &&
          !excludedAlarmSubCategories.has(`${setting.topLevel}:${setting.subLevel}`)
        ) {
          isActive = true;
          priority = setting.level === 3 ? 1 : null;
        } else if (setting.path === 'Domofoni in video domofoni') {
          isActive = true;
          priority = null;
        } else if (setting.topLevel === 'Domofoni in video domofoni' && setting.level === 2) {
          isActive = true;
        } else if (setting.topLevel === 'Domofoni in video domofoni' && setting.level === 3) {
          isActive = true;
          priority = 2;
        } else if (setting.path === 'Mrežna oprema') {
          isActive = true;
          priority = null;
        } else if (setting.path === 'Mrežna oprema:Pribor') {
          isActive = true;
        } else if (setting.topLevel === 'Mrežna oprema' && setting.level === 3) {
          isActive = true;
          priority = 3;
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
        marginPercent: setting.marginPercent ?? 0,
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

  async function refreshStatsAfterSync() {
    const response = await fetch('/api/cenik/category-settings/refresh-stats', { method: 'POST' });
    const data = await parseEnvelope<CategorySetting[]>(response);
    setSettings(data.map((setting) => ({ ...setting, isDirty: false })));
  }

  async function syncAA() {
    if (dirtyCount > 0) {
      setMessage({ variant: 'warning', text: 'Najprej shrani spremembe nastavitev kategorij, nato zaženi sinhronizacijo iz AA.' });
      return;
    }

    setSyncing(true);
    setSyncStepIndex(0);
    setSyncProgress(8);
    setMessage(null);
    let progressTimer: number | undefined;

    try {
      progressTimer = window.setInterval(() => {
        setSyncProgress((current) => Math.min(current + 7, 88));
        setSyncStepIndex((current) => Math.min(current + 1, syncSteps.length - 2));
      }, 1200);

      const response = await fetch('/api/admin/import/products/from-git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'aa_api', mode: 'apply' }),
      });
      await parseEnvelope<unknown>(response);
      setSyncStepIndex(3);
      setSyncProgress(94);
      await refreshStatsAfterSync();
      setSyncStepIndex(4);
      setSyncProgress(100);
      setMessage({ variant: 'success', text: 'AA sync je zaključen. Statistike so osvežene.' });
    } catch (error) {
      setMessage({ variant: 'error', text: error instanceof Error ? error.message : 'AA sync ni uspel.' });
    } finally {
      if (progressTimer !== undefined) {
        window.clearInterval(progressTimer);
      }
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
          <Button
            type="button"
            variant="ghost"
            onClick={applyRecommendedDefaults}
            disabled={saving || syncing}
            className="border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
          >
            Naloži priporočene
          </Button>
          <Button type="button" onClick={syncAA} disabled={syncing || saving}>
            <UploadCloud className="mr-2 h-4 w-4" />
            {syncing ? 'Sinhroniziram ...' : 'Sinhroniziraj iz AA'}
          </Button>
          <Button type="button" onClick={saveChanges} disabled={saving || dirtyCount === 0}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Shranjujem ...' : `Shrani nastavitve${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </Button>
        </div>
      </div>

      {syncing && (
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">{syncSteps[syncStepIndex]}</span>
            <span className="text-muted-foreground">{syncProgress}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${syncProgress}%` }}
            />
          </div>
        </div>
      )}

      {message && (
        <div
          className={`rounded-md border px-4 py-2 text-sm ${
            message.variant === 'success'
              ? 'border-success text-success'
              : message.variant === 'warning'
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-destructive text-destructive'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
        {grouped.top.map((top) => {
          const subs = grouped.subsByTop.get(top.path) ?? [];
          const segments = grouped.segmentsByTop.get(top.path) ?? [];
          const unsegmentedSubs = subs.filter((sub) => (grouped.thirdBySub.get(sub.path) ?? []).length === 0);
          const isExpanded = expanded.has(top.path);
          return (
            <div key={top.path} className="border-b border-border/60 last:border-b-0">
              <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-3 py-3 md:grid-cols-[auto_auto_1fr_110px_120px_120px]">
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
                <span className="hidden text-xs text-muted-foreground md:block">Prioriteta</span>
                <span className="hidden text-xs text-muted-foreground md:block">Marža %</span>
                <span className="hidden text-right text-xs text-muted-foreground md:block">
                  {segments.length > 0 ? `${segments.length} segmentov` : `${subs.length} sub`}
                </span>
              </div>

              {isExpanded && (
                <div className="divide-y divide-border/50 bg-muted/20">
                  {segments.length > 0 ? (
                    <>
                      {segments.map((segment) => {
                        const isSegmentExpanded = expanded.has(segment.key);
                        const isSegmentActive = segment.children.length > 0 && segment.activeChildren === segment.children.length;
                        return (
                          <div key={segment.key}>
                            <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-4 py-2 pl-9 md:grid-cols-[auto_auto_1fr_110px_120px_120px]">
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded border border-border/60"
                                onClick={() =>
                                  setExpanded((prev) => {
                                    const next = new Set(prev);
                                    next.has(segment.key) ? next.delete(segment.key) : next.add(segment.key);
                                    return next;
                                  })
                                }
                                aria-label={isSegmentExpanded ? 'Skrči' : 'Razširi'}
                              >
                                {isSegmentExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                              <input
                                type="checkbox"
                                checked={isSegmentActive}
                                onChange={(event) => setSegmentActive(segment, event.target.checked)}
                                className="h-4 w-4"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-foreground">{segment.name}</span>
                                  <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                    {segment.segmentType === 'system_line' ? 'sistem' : 'proizvajalec'}
                                  </span>
                                  <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                    {segment.children.length} uporabnosti
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {segment.productCountInApi} v API | {segment.productCountActive} aktivnih v bazi
                                </div>
                              </div>
                              <select
                                value={segment.hasMixedPriority ? '' : priorityValue(segment.priority)}
                                onChange={(event) => setSegmentPriority(segment, parsePriority(event.target.value))}
                                disabled={!isSegmentActive}
                                className="rounded border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
                              >
                                <option value="">{segment.hasMixedPriority ? 'Mešano' : 'Brez'}</option>
                                <option value="1">Prioriteta 1</option>
                                <option value="2">Prioriteta 2</option>
                                <option value="3">Prioriteta 3</option>
                              </select>
                              <input
                                type="number"
                                min={0}
                                max={500}
                                step="0.01"
                                value={segment.hasMixedMargin ? '' : segment.marginPercent}
                                onChange={(event) => setSegmentMargin(segment, parseMarginPercent(event.target.value))}
                                placeholder={segment.hasMixedMargin ? 'Mešano' : '0'}
                                disabled={!isSegmentActive}
                                className="hidden rounded border border-border bg-background px-2 py-1 text-right text-sm disabled:opacity-50 md:block"
                              />
                              <span className="hidden text-right text-xs text-muted-foreground md:block">
                                {segment.marginPercent > 0 && !segment.hasMixedMargin ? `+${segment.marginPercent}%` : ''}
                              </span>
                            </div>
                            {isSegmentExpanded && (
                              <div className="divide-y divide-border/40 bg-background/70">
                                {segment.children.map((third) => (
                                  <div key={third.path} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-4 py-2 pl-20 md:grid-cols-[auto_1fr_110px_120px_120px]">
                                    <input
                                      type="checkbox"
                                      checked={third.isActive}
                                      onChange={(event) => setThirdActive(third, event.target.checked)}
                                      className="h-4 w-4"
                                    />
                                    <div className="min-w-0">
                                      <div className="truncate text-sm text-foreground">{third.subLevel}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {third.productCountInApi} v API | {third.productCountActive} aktivnih v bazi
                                      </div>
                                    </div>
                                    <span className="hidden text-xs text-muted-foreground md:block">
                                      {third.priority ? `Prioriteta ${third.priority}` : 'Brez prioritete'}
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={500}
                                      step="0.01"
                                      value={third.marginPercent ?? 0}
                                      onChange={(event) => updateSetting(third.path, { marginPercent: parseMarginPercent(event.target.value) })}
                                      disabled={!third.isActive}
                                      className="hidden rounded border border-border bg-background px-2 py-1 text-right text-sm disabled:opacity-50 md:block"
                                    />
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
                      {unsegmentedSubs.map((sub) => (
                        <div key={sub.path} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-4 py-2 pl-20 md:grid-cols-[auto_1fr_110px_120px_120px]">
                          <input
                            type="checkbox"
                            checked={sub.isActive}
                            onChange={(event) => setSubActive(sub, event.target.checked)}
                            className="h-4 w-4"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm text-foreground">{sub.subLevel}</div>
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
                            type="number"
                            min={0}
                            max={500}
                            step="0.01"
                            value={sub.marginPercent ?? 0}
                            onChange={(event) => updateSetting(sub.path, { marginPercent: parseMarginPercent(event.target.value) })}
                            disabled={!sub.isActive}
                            className="hidden rounded border border-border bg-background px-2 py-1 text-right text-sm disabled:opacity-50 md:block"
                          />
                        </div>
                      ))}
                    </>
                  ) : (
                    subs.map((sub) => {
                      return (
                        <div key={sub.path} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-4 py-2 pl-12 md:grid-cols-[auto_1fr_110px_120px_120px]">
                          <input
                            type="checkbox"
                            checked={sub.isActive}
                            onChange={(event) => setSubActive(sub, event.target.checked)}
                            className="h-4 w-4"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm text-foreground">{sub.subLevel}</span>
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
                            type="number"
                            min={0}
                            max={500}
                            step="0.01"
                            value={sub.marginPercent ?? 0}
                            onChange={(event) => updateSetting(sub.path, { marginPercent: parseMarginPercent(event.target.value) })}
                            disabled={!sub.isActive}
                            className="hidden rounded border border-border bg-background px-2 py-1 text-right text-sm disabled:opacity-50 md:block"
                          />
                          <input
                            type="text"
                            value={sub.notes}
                            onChange={(event) => updateSetting(sub.path, { notes: event.target.value })}
                            placeholder="Opomba"
                            className="hidden rounded border border-border bg-background px-2 py-1 text-sm md:block"
                          />
                        </div>
                      );
                    })
                  )}
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
