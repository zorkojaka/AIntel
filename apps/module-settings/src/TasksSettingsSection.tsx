import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input } from '@aintel/ui';
import { parseApiEnvelope } from '@aintel/shared/utils/api-client';

// Nastavitve → Opravila: podjetje tu uredi svoje procese —
// (1) predloge opravil za hitri izbor pri ročnem dodajanju,
// (2) avtomatska pravila kolesa (katera opravila sistem generira sam).

type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

type TaskTemplate = {
  _id: string;
  name: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  dueInDays?: number | null;
  assigneeRole?: string | null;
  isActive: boolean;
  order: number;
};

type WheelConfig = {
  rules: Record<string, { enabled: boolean }>;
  params: {
    offerFollowUpDays: number;
    inquiryStaleBusinessDays: number;
    workStartHour: number;
    workEndHour: number;
  };
};

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low', label: 'nizka' },
  { value: 'normal', label: 'običajna' },
  { value: 'high', label: 'visoka' },
  { value: 'urgent', label: 'nujna' },
];

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'ustvarjalcu (meni)' },
  { value: 'SALES', label: 'bazen: prodaja' },
  { value: 'EXECUTION', label: 'bazen: montaža' },
  { value: 'FINANCE', label: 'bazen: finance' },
  { value: 'ORGANIZER', label: 'bazen: organizacija' },
  { value: 'ADMIN', label: 'bazen: admin' },
];

const WHEEL_RULES: Array<{ key: string; label: string; description: string }> = [
  {
    key: 'inquiry.first_contact',
    label: 'Prvi kontakt povpraševanja',
    description: 'Novo spletno povpraševanje → opravilo »pokliči stranko« z rokom znotraj delovnega časa.',
  },
  {
    key: 'inquiry.next_step',
    label: 'Naslednji korak povpraševanja',
    description: 'Stranka na spletu izbere naslednji korak (ogled, posvet …) → opravilo za izvedbo koraka.',
  },
  {
    key: 'inquiry.stale_escalation',
    label: 'Eskalacija nekontaktiranega povpraševanja',
    description: 'Povpraševanje brez prvega kontakta po nastavljenih delovnih dneh → eskalacijsko opravilo.',
  },
  {
    key: 'offer.follow_up',
    label: 'Follow-up poslane ponudbe',
    description: 'Poslana ponudba brez odgovora po nastavljenih dneh → opravilo s pripravljenim e-mailom (pošlješ ročno).',
  },
  {
    key: 'offer.expiry',
    label: 'Potek veljavnosti ponudbe',
    description: 'Ponudbi poteče veljavnost → opravilo »podaljšaj ali zapri«.',
  },
];

const PARAM_FIELDS: Array<{ key: keyof WheelConfig['params']; label: string }> = [
  { key: 'offerFollowUpDays', label: 'Follow-up ponudbe po (dneh)' },
  { key: 'inquiryStaleBusinessDays', label: 'Eskalacija po (delovnih dneh)' },
  { key: 'workStartHour', label: 'Začetek delovnega časa (ura)' },
  { key: 'workEndHour', label: 'Konec delovnega časa (ura)' },
];

type TemplateDraft = {
  name: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueInDays: string;
  assigneeRole: string;
  isActive: boolean;
};

function draftFromTemplate(template: TaskTemplate): TemplateDraft {
  return {
    name: template.name,
    title: template.title,
    description: template.description ?? '',
    priority: template.priority,
    dueInDays: template.dueInDays === null || template.dueInDays === undefined ? '' : String(template.dueInDays),
    assigneeRole: template.assigneeRole ?? '',
    isActive: template.isActive,
  };
}

function draftPayload(draft: TemplateDraft) {
  return {
    name: draft.name,
    title: draft.title || draft.name,
    description: draft.description,
    priority: draft.priority,
    dueInDays: draft.dueInDays === '' ? null : Number(draft.dueInDays),
    assigneeRole: draft.assigneeRole,
    isActive: draft.isActive,
  };
}

const EMPTY_DRAFT: TemplateDraft = {
  name: '',
  title: '',
  description: '',
  priority: 'normal',
  dueInDays: '',
  assigneeRole: '',
  isActive: true,
};

export function TasksSettingsSection() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [wheel, setWheel] = useState<WheelConfig | null>(null);
  const [wheelForbidden, setWheelForbidden] = useState(false);
  const [status, setStatus] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/tasks/templates?all=1');
      setTemplates(await parseApiEnvelope<TaskTemplate[]>(response, 'Predlog opravil ni mogoče naložiti.'));
    } catch (err) {
      setStatus({ variant: 'error', text: err instanceof Error ? err.message : 'Napaka pri nalaganju predlog.' });
    }
    try {
      const response = await fetch('/api/tasks/wheel-config');
      if (response.status === 403) {
        setWheelForbidden(true);
        return;
      }
      setWheel(await parseApiEnvelope<WheelConfig>(response, 'Nastavitev kolesa ni mogoče naložiti.'));
    } catch (err) {
      setStatus({ variant: 'error', text: err instanceof Error ? err.message : 'Napaka pri nalaganju pravil.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (template: TaskTemplate) => {
    setAdding(false);
    setEditingId(template._id);
    setDraft(draftFromTemplate(template));
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setDraft(EMPTY_DRAFT);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAdding(false);
    setDraft(EMPTY_DRAFT);
  };

  const saveDraft = async () => {
    if (!draft.name.trim()) {
      setStatus({ variant: 'error', text: 'Ime predloge je obvezno.' });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      if (adding) {
        const response = await fetch('/api/tasks/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftPayload(draft)),
        });
        await parseApiEnvelope(response, 'Predloge ni mogoče ustvariti.');
      } else if (editingId) {
        const response = await fetch(`/api/tasks/templates/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftPayload(draft)),
        });
        await parseApiEnvelope(response, 'Predloge ni mogoče posodobiti.');
      }
      cancelEdit();
      await load();
      setStatus({ variant: 'success', text: 'Predloga je shranjena.' });
    } catch (err) {
      setStatus({ variant: 'error', text: err instanceof Error ? err.message : 'Shranjevanje ni uspelo.' });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (template: TaskTemplate) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks/templates/${template._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      await parseApiEnvelope(response, 'Predloge ni mogoče posodobiti.');
      await load();
    } catch (err) {
      setStatus({ variant: 'error', text: err instanceof Error ? err.message : 'Posodobitev ni uspela.' });
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async (template: TaskTemplate) => {
    if (!window.confirm(`Izbrišem predlogo »${template.name}«?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks/templates/${template._id}`, { method: 'DELETE' });
      await parseApiEnvelope(response, 'Predloge ni mogoče izbrisati.');
      await load();
    } catch (err) {
      setStatus({ variant: 'error', text: err instanceof Error ? err.message : 'Brisanje ni uspelo.' });
    } finally {
      setBusy(false);
    }
  };

  const saveWheel = async (next: WheelConfig) => {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch('/api/tasks/wheel-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      setWheel(await parseApiEnvelope<WheelConfig>(response, 'Nastavitev kolesa ni mogoče shraniti.'));
      setStatus({ variant: 'success', text: 'Avtomatska pravila so shranjena.' });
    } catch (err) {
      setStatus({ variant: 'error', text: err instanceof Error ? err.message : 'Shranjevanje pravil ni uspelo.' });
    } finally {
      setBusy(false);
    }
  };

  const toggleRule = (key: string) => {
    if (!wheel) return;
    const enabled = wheel.rules[key]?.enabled === true;
    void saveWheel({ ...wheel, rules: { ...wheel.rules, [key]: { enabled: !enabled } } });
  };

  const roleLabel = (role?: string | null) =>
    ROLE_OPTIONS.find((option) => option.value === (role ?? ''))?.label ?? role ?? '';

  const renderDraftForm = () => (
    <div className="grid gap-3 rounded-md border border-primary/40 bg-primary/5 p-4 md:grid-cols-2">
      <Input label="Ime (gumb za hitri izbor)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
      <Input label="Naslov opravila" value={draft.title} placeholder="privzeto enak imenu" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      <label className="md:col-span-2 block space-y-1">
        <span className="text-sm font-medium text-foreground">Opis</span>
        <textarea
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          rows={2}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-foreground">Prioriteta</span>
        <select
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
          value={draft.priority}
          onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <Input
        label="Rok čez (dni, prazno = brez roka)"
        type="number"
        min={0}
        max={365}
        value={draft.dueInDays}
        onChange={(e) => setDraft({ ...draft, dueInDays: e.target.value })}
      />
      <label className="block space-y-1">
        <span className="text-sm font-medium text-foreground">Privzeto dodeli</span>
        <select
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
          value={draft.assigneeRole}
          onChange={(e) => setDraft({ ...draft, assigneeRole: e.target.value })}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
        <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
        Aktivna (prikazana pri hitrem izboru)
      </label>
      <div className="flex gap-2 md:col-span-2">
        <Button type="button" onClick={() => void saveDraft()} disabled={busy}>
          {busy ? 'Shranjujem …' : 'Shrani predlogo'}
        </Button>
        <Button type="button" variant="ghost" onClick={cancelEdit} disabled={busy}>
          Prekliči
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {status && (
        <div
          className={`rounded-md border px-4 py-2 text-sm ${
            status.variant === 'success' ? 'border-success text-success' : 'border-destructive text-destructive'
          }`}
        >
          {status.text}
        </div>
      )}

      <Card title="Predloge opravil">
        <p className="mb-4 text-sm text-muted-foreground">
          Definiraj tipična opravila svojih procesov. Pri dodajanju novega opravila jih izbereš s klikom —
          polja se predizpolnijo, a jih lahko še vedno spremeniš.
        </p>
        <div className="space-y-2">
          {templates.map((template) =>
            editingId === template._id ? (
              <div key={template._id}>{renderDraftForm()}</div>
            ) : (
              <div
                key={template._id}
                className={`flex flex-wrap items-center gap-3 rounded-md border border-border px-4 py-3 ${
                  template.isActive ? '' : 'opacity-50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{template.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {PRIORITY_OPTIONS.find((option) => option.value === template.priority)?.label}
                    {template.dueInDays !== null && template.dueInDays !== undefined
                      ? ` · rok čez ${template.dueInDays} dni`
                      : ' · brez roka'}
                    {` · ${roleLabel(template.assigneeRole)}`}
                    {template.description ? ` — ${template.description}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="ghost" onClick={() => startEdit(template)} disabled={busy}>
                    Uredi
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void toggleActive(template)} disabled={busy}>
                    {template.isActive ? 'Izklopi' : 'Vklopi'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void removeTemplate(template)} disabled={busy}>
                    Izbriši
                  </Button>
                </div>
              </div>
            ),
          )}
          {adding ? renderDraftForm() : (
            <Button type="button" onClick={startAdd} disabled={busy}>
              + Dodaj predlogo
            </Button>
          )}
        </div>
      </Card>

      <Card title="Avtomatska opravila (kolo)">
        <p className="mb-4 text-sm text-muted-foreground">
          Sistem lahko opravila ustvarja sam, ko se v prodaji ali izvedbi kaj zgodi. Vsako pravilo vklopiš
          posebej — priporočeno postopoma, ko proces preizkusiš.
        </p>
        {wheelForbidden ? (
          <p className="text-sm text-muted-foreground">Avtomatska pravila lahko ureja samo administrator.</p>
        ) : !wheel ? (
          <p className="text-sm text-muted-foreground">Nalagam pravila …</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {WHEEL_RULES.map((rule) => {
                const enabled = wheel.rules[rule.key]?.enabled === true;
                return (
                  <div key={rule.key} className="flex items-start justify-between gap-4 rounded-md border border-border px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{rule.label}</div>
                      <div className="text-xs text-muted-foreground">{rule.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRule(rule.key)}
                      disabled={busy}
                      className={`shrink-0 rounded-md border px-4 py-1.5 text-sm font-medium transition ${
                        enabled
                          ? 'border-success bg-success/10 text-success'
                          : 'border-border text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {enabled ? 'Vklopljeno' : 'Izklopljeno'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {PARAM_FIELDS.map((field) => (
                <Input
                  key={field.key}
                  label={field.label}
                  type="number"
                  min={0}
                  max={30}
                  value={String(wheel.params[field.key] ?? '')}
                  onChange={(e) =>
                    setWheel((prev) =>
                      prev ? { ...prev, params: { ...prev.params, [field.key]: Number(e.target.value) } } : prev,
                    )
                  }
                />
              ))}
            </div>
            <Button type="button" onClick={() => void saveWheel(wheel)} disabled={busy}>
              {busy ? 'Shranjujem …' : 'Shrani parametre'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
