import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Hand, Loader2, Lock, Mail, Plus, RefreshCw, Send, Unlock, X } from 'lucide-react';
import {
  createTask,
  fetchMyTasks,
  fetchTaskTemplates,
  previewOfferFollowUpEmail,
  sendOfferFollowUpEmail,
  updateTask,
  type OfferFollowUpEmailDraft,
  type TaskItem,
  type TaskPriority,
  type TaskTemplate,
} from './api';
import './styles.css';

// AIN-P1-09 (AINTEL_WHEEL_SPEC.md §2): inbox — Moja opravila / bazen mojih
// vlog / danes zaključena. Ročna opravila; avtomatska pridejo z AIN-P1-11.

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'nizka',
  normal: 'običajna',
  high: 'visoka',
  urgent: 'nujna',
};

const dateFmt = new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function formatDue(value?: string | null) {
  if (!value) return null;
  return dateFmt.format(new Date(value));
}

function isOverdue(task: TaskItem) {
  return Boolean(task.dueAt && ['open', 'in_progress'].includes(task.status) && new Date(task.dueAt).getTime() < Date.now());
}

function openProject(projectId: string) {
  window.history.pushState({ moduleId: 'projects' }, '', `/projects/${encodeURIComponent(projectId)}`);
  window.dispatchEvent(new PopStateEvent('popstate', { state: { moduleId: 'projects' } }));
}

function handleProjectLinkClick(event: React.MouseEvent<HTMLAnchorElement>, projectId: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openProject(projectId);
}

export function OpravilaPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [doneTasks, setDoneTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [followUpDrafts, setFollowUpDrafts] = useState<OfferFollowUpEmailDraft[]>([]);
  const [followUpForms, setFollowUpForms] = useState<Record<string, { to: string; subject: string; body: string }>>({});
  const [selectedFollowUps, setSelectedFollowUps] = useState<Set<string>>(() => new Set());
  const [followUpSending, setFollowUpSending] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'normal' as TaskPriority, dueAt: '', assigneeRole: 'SALES', zame: true });
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [active, done] = await Promise.all([fetchMyTasks(), fetchMyTasks({ status: 'done' })]);
      setTasks(active.tasks);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      setDoneTasks(done.tasks.filter((t) => t.resolution && new Date(t.resolution.resolvedAt).getTime() >= todayStart.getTime()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri nalaganju.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Predloge (Nastavitve → Opravila) naložimo šele ob prvem odprtju obrazca.
  useEffect(() => {
    if (!showForm || templatesLoaded) return;
    setTemplatesLoaded(true);
    fetchTaskTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [showForm, templatesLoaded]);

  const applyTemplate = (template: TaskTemplate) => {
    let dueAt = '';
    if (template.dueInDays !== null && template.dueInDays !== undefined) {
      const due = new Date();
      due.setDate(due.getDate() + template.dueInDays);
      due.setHours(16, 0, 0, 0);
      const pad = (n: number) => String(n).padStart(2, '0');
      dueAt = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}`;
    }
    setActiveTemplateId(template._id);
    setForm({
      title: template.title,
      description: template.description ?? '',
      priority: template.priority,
      dueAt,
      assigneeRole: template.assigneeRole || 'SALES',
      zame: !template.assigneeRole,
    });
  };

  const { moja, bazen } = useMemo(() => {
    const moja = tasks.filter((t) => t.assigneeEmployeeId);
    const bazen = tasks.filter((t) => !t.assigneeEmployeeId);
    return { moja, bazen };
  }, [tasks]);

  const activeFollowUps = useMemo(
    () => tasks.filter((task) => task.type === 'offer.follow_up' && ['open', 'in_progress'].includes(task.status)),
    [tasks],
  );

  const run = async (task: TaskItem, akcija: () => Promise<unknown>) => {
    setBusyId(task._id);
    setError(null);
    try {
      await akcija();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Akcija ni uspela.');
    } finally {
      setBusyId(null);
    }
  };

  const complete = (task: TaskItem) => {
    const outcome = window.prompt('Kaj je izid opravila? (npr. poklicano, ponudba poslana)');
    if (!outcome?.trim()) return;
    void run(task, () => updateTask(task._id, { action: 'complete', resolution: { outcome: outcome.trim() } }));
  };

  const block = (task: TaskItem) => {
    const reason = window.prompt('Zakaj je opravilo blokirano? (npr. čakam material)');
    if (!reason?.trim()) return;
    void run(task, () => updateTask(task._id, { action: 'block', blockedReason: reason.trim() }));
  };

  const prepareFollowUp = async (task: TaskItem) => {
    setBusyId(task._id);
    setError(null);
    try {
      const draft = await previewOfferFollowUpEmail(task._id);
      setFollowUpDrafts([draft]);
      setFollowUpForms({
        [draft.taskId]: { to: draft.to.join(', '), subject: draft.subject, body: draft.body },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Follow-up e-maila ni mogoče pripraviti.');
    } finally {
      setBusyId(null);
    }
  };

  const prepareSelectedFollowUps = async () => {
    const selected = activeFollowUps.filter((task) => selectedFollowUps.has(task._id));
    if (!selected.length) return;
    setError(null);
    setFollowUpSending(true);
    try {
      const drafts = await Promise.all(selected.map((task) => previewOfferFollowUpEmail(task._id)));
      setFollowUpDrafts(drafts);
      setFollowUpForms(
        drafts.reduce<Record<string, { to: string; subject: string; body: string }>>((acc, draft) => {
          acc[draft.taskId] = { to: draft.to.join(', '), subject: draft.subject, body: draft.body };
          return acc;
        }, {}),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Follow-up e-mailov ni mogoče pripraviti.');
    } finally {
      setFollowUpSending(false);
    }
  };

  const sendFollowUp = async () => {
    if (!followUpDrafts.length) return;
    const payloads = followUpDrafts.map((draft) => {
      const form = followUpForms[draft.taskId];
      return {
        draft,
        to: (form?.to ?? '').split(',').map((entry) => entry.trim()).filter(Boolean),
        subject: (form?.subject ?? '').trim(),
        body: (form?.body ?? '').trim(),
      };
    });
    if (payloads.some((payload) => !payload.to.length || !payload.subject || !payload.body)) {
      setError('Prejemnik, zadeva in vsebina so obvezni pri vseh predogledih.');
      return;
    }
    setFollowUpSending(true);
    setError(null);
    try {
      for (const payload of payloads) {
        await sendOfferFollowUpEmail(payload.draft.taskId, {
          to: payload.to,
          subject: payload.subject,
          body: payload.body,
        });
      }
      setFollowUpDrafts([]);
      setFollowUpForms({});
      setSelectedFollowUps(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Follow-up e-maila ni mogoče poslati.');
    } finally {
      setFollowUpSending(false);
    }
  };

  const updateFollowUpForm = (taskId: string, patch: Partial<{ to: string; subject: string; body: string }>) => {
    setFollowUpForms((current) => ({ ...current, [taskId]: { ...current[taskId], ...patch } }));
  };

  const toggleSelectedFollowUp = (taskId: string) => {
    setSelectedFollowUps((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setError(null);
    try {
      // Brez navedbe lastnika backend opravilo dodeli meni (ustvarjalcu).
      await createTask({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        dueAt: form.dueAt || undefined,
        ...(form.zame ? {} : { assigneeRole: form.assigneeRole }),
      });
      setForm({ title: '', description: '', priority: 'normal', dueAt: '', assigneeRole: 'SALES', zame: true });
      setActiveTemplateId(null);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opravila ni bilo mogoče ustvariti.');
    }
  };

  const renderTask = (task: TaskItem, pool: boolean) => {
    const overdue = isOverdue(task);
    const busy = busyId === task._id;
    const subjectProjectId = task.subject?.kind === 'project' ? task.subject.id?.trim() : '';
    return (
      <div key={task._id} className={`opravilo ${overdue ? 'opravilo--zamuda' : ''} ${task.status === 'blocked' ? 'opravilo--blokirano' : ''}`}>
        <div className="opravilo__glava">
          <span className={`opravilo__prioriteta opravilo__prioriteta--${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
          <span className="opravilo__naslov">{task.title}</span>
          {task.subject?.label ? (
            subjectProjectId ? (
              <a
                className="opravilo__subjekt opravilo__subjekt--link"
                href={`/projects/${encodeURIComponent(subjectProjectId)}`}
                onClick={(event) => handleProjectLinkClick(event, subjectProjectId)}
                title="Odpri projekt"
              >
                {task.subject.label}
              </a>
            ) : (
              <span className="opravilo__subjekt">{task.subject.label}</span>
            )
          ) : null}
        </div>
        {task.description ? <p className="opravilo__opis">{task.description}</p> : null}
        <div className="opravilo__noga">
          <span className="opravilo__meta">
            {task.dueAt ? (
              <>
                rok: <strong className={overdue ? 'opravilo__rok-zamuda' : ''}>{formatDue(task.dueAt)}</strong>
                {overdue ? <AlertTriangle size={13} className="opravilo__rok-ikona" /> : null}
              </>
            ) : (
              'brez roka'
            )}
            {task.status === 'blocked' && task.blockedReason ? <em> · blokirano: {task.blockedReason}</em> : null}
            {pool && task.assigneeRole ? <em> · bazen {task.assigneeRole}</em> : null}
          </span>
          <span className="opravilo__akcije">
            {busy ? <Loader2 size={15} className="vrti" /> : null}
            {pool && task.status === 'open' ? (
              <button type="button" disabled={busy} onClick={() => void run(task, () => updateTask(task._id, { action: 'claim' }))} title="Prevzemi opravilo">
                <Hand size={14} /> Prevzemi
              </button>
            ) : null}
            {task.type === 'offer.follow_up' && ['open', 'in_progress'].includes(task.status) ? (
              <button type="button" disabled={busy} onClick={() => void prepareFollowUp(task)} title="Pripravi follow-up e-mail">
                <Mail size={14} /> Pripravi e-mail
              </button>
            ) : null}
            {task.status !== 'blocked' ? (
              <button type="button" disabled={busy} onClick={() => complete(task)} title="Zaključi z izidom">
                <CheckCircle2 size={14} /> Zaključi
              </button>
            ) : null}
            {task.status === 'blocked' ? (
              <button type="button" disabled={busy} onClick={() => void run(task, () => updateTask(task._id, { action: 'unblock' }))} title="Odblokiraj">
                <Unlock size={14} /> Odblokiraj
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => block(task)} title="Blokiraj z razlogom">
                <Lock size={14} /> Blokiraj
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => { if (window.confirm('Prekličem opravilo?')) void run(task, () => updateTask(task._id, { action: 'cancel' })); }} title="Prekliči">
              <CircleSlash size={14} />
            </button>
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="opravila-stran">
      <div className="opravila-glava">
        <div>
          <h1>Opravila</h1>
          <p className="opravila-podnaslov">Tvoj nabiralnik dela: osebna opravila, bazen tvojih vlog in danes zaključeno.</p>
        </div>
        <div className="opravila-glava__akcije">
          <button type="button" className="gumb-sekundarni" onClick={() => void load()}>
            <RefreshCw size={15} /> Osveži
          </button>
          <button type="button" className="gumb-primarni" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} /> Novo opravilo
          </button>
        </div>
      </div>

      {error ? <div className="opravila-napaka">{error}</div> : null}

      {followUpDrafts.length > 0 ? (
        <div className="opravila-modal" role="dialog" aria-modal="true" aria-labelledby="follow-up-title">
          <div className="opravila-modal__panel">
            <div className="opravila-modal__header">
              <div>
                <h2 id="follow-up-title">Follow-up e-mail</h2>
                <p>{followUpDrafts.length === 1 ? followUpDrafts[0].offerLabel : `${followUpDrafts.length} predogledov`}</p>
              </div>
              <button type="button" onClick={() => setFollowUpDrafts([])} title="Zapri">
                <X size={16} />
              </button>
            </div>
            <div className="follow-up-form">
              {followUpDrafts.map((draft) => {
                const formState = followUpForms[draft.taskId] ?? { to: '', subject: '', body: '' };
                return (
                  <div key={draft.taskId} className="follow-up-form__draft">
                    <h3>{draft.offerLabel}</h3>
                    <label>
                      Prejemnik
                      <input value={formState.to} onChange={(e) => updateFollowUpForm(draft.taskId, { to: e.target.value })} />
                    </label>
                    <label>
                      Zadeva
                      <input value={formState.subject} onChange={(e) => updateFollowUpForm(draft.taskId, { subject: e.target.value })} />
                    </label>
                    <label>
                      Vsebina
                      <textarea rows={9} value={formState.body} onChange={(e) => updateFollowUpForm(draft.taskId, { body: e.target.value })} />
                    </label>
                    <div className="follow-up-form__priloge">
                      Priloga: <strong>PDF ponudbe</strong>
                    </div>
                  </div>
                );
              })}
              <div className="opravila-modal__actions">
                <button type="button" className="gumb-sekundarni" onClick={() => setFollowUpDrafts([])} disabled={followUpSending}>
                  Prekliči
                </button>
                <button type="button" className="gumb-primarni" onClick={() => void sendFollowUp()} disabled={followUpSending}>
                  {followUpSending ? <Loader2 size={15} className="vrti" /> : <Send size={15} />} Pošlji
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <form className="opravilo-forma" onSubmit={submitForm}>
          {templates.length > 0 ? (
            <div className="opravilo-forma__predloge">
              <span className="opravilo-forma__predloge-naslov">Predloge:</span>
              {templates.map((template) => (
                <button
                  key={template._id}
                  type="button"
                  className={`opravilo-forma__predloga ${activeTemplateId === template._id ? 'opravilo-forma__predloga--aktivna' : ''}`}
                  title={template.description || template.title}
                  onClick={() => applyTemplate(template)}
                >
                  {template.name}
                </button>
              ))}
            </div>
          ) : null}
          <input
            type="text"
            placeholder="Kaj je treba narediti? *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <textarea
            placeholder="Podrobnosti (neobvezno)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
          <div className="opravilo-forma__vrstica">
            <label>
              Prioriteta
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
                <option value="low">nizka</option>
                <option value="normal">običajna</option>
                <option value="high">visoka</option>
                <option value="urgent">nujna</option>
              </select>
            </label>
            <label>
              Rok
              <input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
            </label>
            <label>
              Dodeli
              <select
                value={form.zame ? 'zame' : form.assigneeRole}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'zame') setForm({ ...form, zame: true });
                  else setForm({ ...form, zame: false, assigneeRole: value });
                }}
              >
                <option value="zame">meni</option>
                <option value="SALES">bazen: prodaja</option>
                <option value="EXECUTION">bazen: montaža</option>
                <option value="FINANCE">bazen: finance</option>
                <option value="ORGANIZER">bazen: organizacija</option>
                <option value="ADMIN">bazen: admin</option>
              </select>
            </label>
            <button type="submit" className="gumb-primarni">Ustvari</button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="opravila-nalaganje"><Loader2 size={18} className="vrti" /> Nalagam …</div>
      ) : (
        <>
          {activeFollowUps.length > 0 ? (
            <section className="follow-up-batch">
              <div className="follow-up-batch__header">
                <h2>Follow-up ponudbe ({activeFollowUps.length})</h2>
                <button
                  type="button"
                  className="gumb-sekundarni"
                  disabled={selectedFollowUps.size === 0 || followUpSending}
                  onClick={() => void prepareSelectedFollowUps()}
                >
                  <Mail size={15} /> Pripravi izbrane
                </button>
              </div>
              <div className="follow-up-batch__list">
                {activeFollowUps.map((task) => (
                  <label key={task._id} className="follow-up-batch__item">
                    <input
                      type="checkbox"
                      checked={selectedFollowUps.has(task._id)}
                      onChange={() => toggleSelectedFollowUp(task._id)}
                    />
                    <span>{task.subject?.label || task.title}</span>
                  </label>
                ))}
              </div>
            </section>
          ) : null}
          <section>
            <h2>Moja opravila ({moja.length})</h2>
            {moja.length === 0 ? <p className="opravila-prazno">Nič prevzetega — poglej bazen spodaj.</p> : moja.map((t) => renderTask(t, false))}
          </section>
          <section>
            <h2>Bazen mojih vlog ({bazen.length})</h2>
            {bazen.length === 0 ? <p className="opravila-prazno">Bazen je prazen.</p> : bazen.map((t) => renderTask(t, true))}
          </section>
          <section>
            <h2>Danes zaključeno ({doneTasks.length})</h2>
            {doneTasks.length === 0 ? (
              <p className="opravila-prazno">Danes še ni zaključenih opravil.</p>
            ) : (
              doneTasks.map((t) => (
                <div key={t._id} className="opravilo opravilo--koncano">
                  <div className="opravilo__glava">
                    <CheckCircle2 size={15} className="opravilo__kljukica" />
                    <span className="opravilo__naslov">{t.title}</span>
                    <span className="opravilo__subjekt">izid: {t.resolution?.outcome}</span>
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
