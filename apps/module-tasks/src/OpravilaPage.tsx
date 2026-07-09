import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Hand, Loader2, Lock, Plus, RefreshCw, Unlock } from 'lucide-react';
import {
  createTask,
  fetchMyTasks,
  updateTask,
  type TaskItem,
  type TaskPriority,
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

export function OpravilaPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [doneTasks, setDoneTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'normal' as TaskPriority, dueAt: '', assigneeRole: 'SALES', zame: true });

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

  const { moja, bazen } = useMemo(() => {
    const moja = tasks.filter((t) => t.assigneeEmployeeId);
    const bazen = tasks.filter((t) => !t.assigneeEmployeeId);
    return { moja, bazen };
  }, [tasks]);

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
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opravila ni bilo mogoče ustvariti.');
    }
  };

  const renderTask = (task: TaskItem, pool: boolean) => {
    const overdue = isOverdue(task);
    const busy = busyId === task._id;
    return (
      <div key={task._id} className={`opravilo ${overdue ? 'opravilo--zamuda' : ''} ${task.status === 'blocked' ? 'opravilo--blokirano' : ''}`}>
        <div className="opravilo__glava">
          <span className={`opravilo__prioriteta opravilo__prioriteta--${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
          <span className="opravilo__naslov">{task.title}</span>
          {task.subject?.label ? <span className="opravilo__subjekt">{task.subject.label}</span> : null}
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

      {showForm ? (
        <form className="opravilo-forma" onSubmit={submitForm}>
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
