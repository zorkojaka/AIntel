import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, RefreshCw } from 'lucide-react';

import {
  createTask,
  fetchTasksBySubject,
  type TaskItem,
  type TaskPriority,
  type TaskSubjectKind,
} from './api';
import './styles.css';

type TaskSubjectStripProps = {
  subjectKind: Exclude<TaskSubjectKind, 'none'>;
  subjectId?: string | null;
  subjectLabel?: string | null;
  title?: string;
  compact?: boolean;
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'nizka',
  normal: 'običajna',
  high: 'visoka',
  urgent: 'nujna',
};

const STATUS_LABELS: Record<TaskItem['status'], string> = {
  open: 'odprto',
  in_progress: 'v delu',
  blocked: 'blokirano',
  done: 'zaključeno',
  cancelled: 'preklicano',
};

const dateFmt = new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function isOpen(task: TaskItem) {
  return task.status === 'open' || task.status === 'in_progress' || task.status === 'blocked';
}

function isOverdue(task: TaskItem) {
  return Boolean(task.dueAt && ['open', 'in_progress'].includes(task.status) && new Date(task.dueAt).getTime() < Date.now());
}

function formatDue(value?: string | null) {
  return value ? dateFmt.format(new Date(value)) : null;
}

export function TaskSubjectStrip({ subjectKind, subjectId, subjectLabel, title = 'Opravila', compact = false }: TaskSubjectStripProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', priority: 'normal' as TaskPriority, dueAt: '' });

  const canLoad = Boolean(subjectId?.trim());
  const openTasks = useMemo(() => tasks.filter(isOpen), [tasks]);

  const load = useCallback(async () => {
    if (!subjectId?.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setTasks(await fetchTasksBySubject(subjectKind, subjectId.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opravil ni mogoče naložiti.');
    } finally {
      setLoading(false);
    }
  }, [subjectId, subjectKind]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canLoad) {
    return null;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || !subjectId?.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createTask({
        title: draft.title.trim(),
        priority: draft.priority,
        dueAt: draft.dueAt || undefined,
        subject: {
          kind: subjectKind,
          id: subjectId.trim(),
          label: subjectLabel?.trim() || undefined,
        },
      });
      setDraft({ title: '', priority: 'normal', dueAt: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opravila ni bilo mogoče ustvariti.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className={`opravila-strip ${compact ? 'opravila-strip--compact' : ''}`}>
      <div className="opravila-strip__header">
        <div>
          <h3>{title}</h3>
          <p>{loading ? 'Nalagam ...' : `${openTasks.length} odprtih od ${tasks.length}`}</p>
        </div>
        <div className="opravila-strip__actions">
          <button type="button" onClick={() => void load()} disabled={loading} title="Osveži opravila">
            {loading ? <Loader2 size={14} className="vrti" /> : <RefreshCw size={14} />}
          </button>
          <button type="button" onClick={() => setShowForm((value) => !value)} title="Dodaj opravilo">
            <Plus size={14} />
          </button>
        </div>
      </div>

      {error ? <div className="opravila-strip__error">{error}</div> : null}

      {showForm ? (
        <form className="opravila-strip__form" onSubmit={submit}>
          <input
            type="text"
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Novo opravilo ..."
            required
          />
          <select value={draft.priority} onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value as TaskPriority }))}>
            <option value="low">nizka</option>
            <option value="normal">običajna</option>
            <option value="high">visoka</option>
            <option value="urgent">nujna</option>
          </select>
          <input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft((prev) => ({ ...prev, dueAt: event.target.value }))} />
          <button type="submit" disabled={creating}>
            {creating ? <Loader2 size={14} className="vrti" /> : <Plus size={14} />} Dodaj
          </button>
        </form>
      ) : null}

      <div className="opravila-strip__list">
        {openTasks.length === 0 ? (
          <p className="opravila-strip__empty">Ni odprtih opravil.</p>
        ) : (
          openTasks.slice(0, 5).map((task) => {
            const overdue = isOverdue(task);
            return (
              <div key={task._id} className={`opravila-strip__item ${overdue ? 'opravila-strip__item--overdue' : ''}`}>
                <span className={`opravilo__prioriteta opravilo__prioriteta--${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
                <span className="opravila-strip__title">{task.title}</span>
                <span className="opravila-strip__status">{STATUS_LABELS[task.status]}</span>
                {task.dueAt ? (
                  <span className="opravila-strip__due">
                    {overdue ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                    {formatDue(task.dueAt)}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
