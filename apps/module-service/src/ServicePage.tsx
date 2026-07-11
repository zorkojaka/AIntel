import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, Plus, RefreshCw, Wrench, X } from 'lucide-react';
import {
  createPlanFromProject,
  createServiceTicket,
  fetchMaintenancePlans,
  fetchServiceTickets,
  updateMaintenancePlan,
  updateServiceTicket,
  type MaintenancePlan,
  type ServiceTicket,
  type ServiceTicketPriority,
} from './api';
import './styles.css';

type Tab = 'tickets' | 'plans';

const TICKET_STATUS_LABELS: Record<ServiceTicket['status'], string> = {
  reported: 'Prijavljen',
  scheduled: 'Načrtovan',
  resolved: 'Rešen',
  cancelled: 'Preklican',
};
const SOURCE_LABELS: Record<ServiceTicket['source'], string> = {
  portal: 'portal',
  phone: 'telefon',
  email: 'e-pošta',
  internal: 'interno',
};
const PRIORITY_LABELS: Record<ServiceTicketPriority, string> = { low: 'nizka', normal: 'običajna', high: 'visoka' };
const PLAN_STATUS_LABELS: Record<MaintenancePlan['status'], string> = { active: 'Aktiven', paused: 'V mirovanju', ended: 'Zaključen' };

const dateFmt = new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDate = (v?: string | null) => (v ? dateFmt.format(new Date(v)) : '—');

export function ServicePage() {
  const [tab, setTab] = useState<Tab>('tickets');
  return (
    <div className="servis-stran">
      <div className="servis-glava">
        <div>
          <h1>Servis in vzdrževanje</h1>
          <p className="servis-podnaslov">Servisni zahtevki strank in načrti preventivnega vzdrževanja.</p>
        </div>
      </div>
      <div className="servis-zavihki" role="tablist">
        <button role="tab" aria-selected={tab === 'tickets'} className={tab === 'tickets' ? 'aktiven' : ''} onClick={() => setTab('tickets')}>
          Servisni zahtevki
        </button>
        <button role="tab" aria-selected={tab === 'plans'} className={tab === 'plans' ? 'aktiven' : ''} onClick={() => setTab('plans')}>
          Načrti vzdrževanja
        </button>
      </div>
      {tab === 'tickets' ? <TicketsTab /> : <PlansTab />}
    </div>
  );
}

// ── Servisni zahtevki ──────────────────────────────────────────────────────

const TICKET_TRANSITIONS: Record<ServiceTicket['status'], ServiceTicket['status'][]> = {
  reported: ['scheduled', 'resolved', 'cancelled'],
  scheduled: ['resolved', 'cancelled', 'reported'],
  resolved: [],
  cancelled: [],
};

function TicketsTab() {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'normal' as ServiceTicketPriority, clientName: '', phone: '', email: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(await fetchServiceTickets(statusFilter ? { status: statusFilter } : {}));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri nalaganju.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const transition = async (t: ServiceTicket, status: ServiceTicket['status']) => {
    setBusyId(t._id);
    try {
      await updateServiceTicket(t._id, { status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri posodobitvi.');
    } finally {
      setBusyId(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim()) return;
    setBusyId('new');
    try {
      await createServiceTicket({
        subject: form.subject,
        description: form.description,
        priority: form.priority,
        source: 'phone',
        clientName: form.clientName,
        contact: { phone: form.phone, email: form.email },
      });
      setForm({ subject: '', description: '', priority: 'normal', clientName: '', phone: '', email: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri shranjevanju.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="servis-orodja">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter statusa">
          <option value="">Vsi statusi</option>
          {(['reported', 'scheduled', 'resolved', 'cancelled'] as const).map((s) => (
            <option key={s} value={s}>
              {TICKET_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <div className="servis-orodja__desno">
          <button className="gumb-sekundarni" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'vrti' : undefined} /> Osveži
          </button>
          <button className="gumb-primarni" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} /> Nov zahtevek
          </button>
        </div>
      </div>

      {showForm && (
        <form className="servis-forma" onSubmit={submit}>
          <input type="text" placeholder="Predmet zahtevka *" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
          <textarea placeholder="Opis" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="servis-forma__vrstica">
            <label>
              Prioriteta
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as ServiceTicketPriority })}>
                {(['low', 'normal', 'high'] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stranka
              <input type="text" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            </label>
            <label>
              Telefon
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              E-pošta
              <input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
          </div>
          <div className="servis-forma__akcije">
            <button type="button" className="gumb-sekundarni" onClick={() => setShowForm(false)}>
              <X size={15} /> Prekliči
            </button>
            <button type="submit" className="gumb-primarni" disabled={busyId === 'new'}>
              {busyId === 'new' ? <Loader2 size={15} className="vrti" /> : <Plus size={15} />} Ustvari
            </button>
          </div>
        </form>
      )}

      {error && <div className="servis-napaka">{error}</div>}
      {loading ? (
        <div className="servis-nalaganje">
          <Loader2 size={16} className="vrti" /> Nalagam …
        </div>
      ) : tickets.length === 0 ? (
        <p className="servis-prazno">Ni servisnih zahtevkov.</p>
      ) : (
        tickets.map((t) => (
          <div className="servis-kartica" key={t._id}>
            <div className="servis-kartica__glava">
              <span className="servis-kartica__naslov">{t.subject}</span>
              <span className={`servis-znacka servis-znacka--${t.status}`}>{TICKET_STATUS_LABELS[t.status]}</span>
              <span className={`servis-prioriteta servis-prioriteta--${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span>
              <span className="servis-vir">{SOURCE_LABELS[t.source]}</span>
            </div>
            {t.description && <p className="servis-kartica__opis">{t.description}</p>}
            <div className="servis-kartica__noga">
              <span className="servis-meta">
                {t.client?.name || t.contact?.email || t.contact?.phone || 'stranka'} · {fmtDate(t.createdAt)}
                {t.projectId ? ` · ${t.projectId}` : ''}
              </span>
              <div className="servis-akcije">
                {TICKET_TRANSITIONS[t.status].map((next) => (
                  <button key={next} onClick={() => void transition(t, next)} disabled={busyId === t._id}>
                    {next === 'scheduled' && <CalendarClock size={13} />}
                    {next === 'resolved' && <CheckCircle2 size={13} />}
                    {TICKET_STATUS_LABELS[next]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))
      )}
    </section>
  );
}

// ── Načrti vzdrževanja ─────────────────────────────────────────────────────

function PlansTab() {
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await fetchMaintenancePlans());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri nalaganju.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const derive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId.trim()) return;
    setBusyId('new');
    try {
      await createPlanFromProject(projectId.trim());
      setProjectId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Načrta ni bilo mogoče izpeljati.');
    } finally {
      setBusyId(null);
    }
  };

  const act = async (p: MaintenancePlan, patch: Parameters<typeof updateMaintenancePlan>[1]) => {
    setBusyId(p._id);
    try {
      await updateMaintenancePlan(p._id, patch);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Napaka pri posodobitvi.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <form className="servis-forma servis-forma--vrstica" onSubmit={derive}>
        <input type="text" placeholder="ID projekta (PRJ-…) za izpeljavo načrta" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
        <button type="submit" className="gumb-primarni" disabled={busyId === 'new'}>
          {busyId === 'new' ? <Loader2 size={15} className="vrti" /> : <Wrench size={15} />} Izpelji iz projekta
        </button>
        <button type="button" className="gumb-sekundarni" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'vrti' : undefined} /> Osveži
        </button>
      </form>

      {error && <div className="servis-napaka">{error}</div>}
      {loading ? (
        <div className="servis-nalaganje">
          <Loader2 size={16} className="vrti" /> Nalagam …
        </div>
      ) : plans.length === 0 ? (
        <p className="servis-prazno">Ni načrtov vzdrževanja. Izpelji enega iz potrjenega projekta zgoraj.</p>
      ) : (
        plans.map((p) => (
          <div className="servis-kartica" key={p._id}>
            <div className="servis-kartica__glava">
              <span className="servis-kartica__naslov">{p.client?.name || 'stranka'}</span>
              <span className={`servis-znacka servis-znacka--${p.status}`}>{PLAN_STATUS_LABELS[p.status]}</span>
              {p.projectId && <span className="servis-vir">{p.projectId}</span>}
              <span className="servis-meta">na vsakih {p.intervalMonths} mes.</span>
            </div>
            <p className="servis-kartica__opis">
              {p.equipment.map((e) => `${e.name}${e.quantity ? ` ×${e.quantity}` : ''}`).join(', ')}
            </p>
            {p.upsellChecklist.length > 0 && (
              <ul className="servis-checklist">
                {p.upsellChecklist.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
            <div className="servis-kartica__noga">
              <span className="servis-meta">
                Naslednji pregled: <b>{fmtDate(p.nextDueAt)}</b>
                {p.warrantyUntil ? ` · garancija do ${fmtDate(p.warrantyUntil)}` : ''}
                {p.lastVisitAt ? ` · zadnji ${fmtDate(p.lastVisitAt)}` : ''}
              </span>
              <div className="servis-akcije">
                <button onClick={() => void act(p, { recordVisit: true })} disabled={busyId === p._id || p.status === 'ended'}>
                  <CheckCircle2 size={13} /> Zabeleži pregled
                </button>
                {p.status === 'active' ? (
                  <button onClick={() => void act(p, { status: 'paused' })} disabled={busyId === p._id}>
                    V mirovanje
                  </button>
                ) : p.status === 'paused' ? (
                  <button onClick={() => void act(p, { status: 'active' })} disabled={busyId === p._id}>
                    Ponovno aktiviraj
                  </button>
                ) : null}
                {p.status !== 'ended' && (
                  <button onClick={() => void act(p, { status: 'ended' })} disabled={busyId === p._id}>
                    Zaključi
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
