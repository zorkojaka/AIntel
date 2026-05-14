import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2 } from 'lucide-react';
import {
  fetchMyEarnings,
  fetchMyProjects,
  fetchMyServiceRates,
  fetchProfileOverview,
  type EarningsResponse,
  type ProfileOverview,
  type ProfileProject,
  type ServiceRate,
} from './api';
import './styles.css';

type TabKey = 'pregled' | 'projekti' | 'zasluzek' | 'cene';
type ProjectFilter = 'all' | 'upcoming' | 'completed';

const currency = new Intl.NumberFormat('sl-SI', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'pregled', label: 'Pregled' },
  { key: 'projekti', label: 'Moji projekti' },
  { key: 'zasluzek', label: 'Moj zaslužek' },
  { key: 'cene', label: 'Moje cene storitev' },
];

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '-';
  return date.toLocaleDateString('sl-SI');
}

function SpinnerState({ label = 'Nalagam podatke...' }: { label?: string }) {
  return (
    <div className="profil-state">
      <Loader2 size={18} className="profil-spin" />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="profil-state profil-state--empty">{children}</div>;
}

function StatusBadge({ paid }: { paid: boolean }) {
  return <span className={`profil-badge ${paid ? 'is-paid' : 'is-pending'}`}>{paid ? 'Plačano' : 'Čaka plačilo'}</span>;
}

function KpiCard({ title, earnings, projectCount }: { title: string; earnings?: number; projectCount: number }) {
  return (
    <article className="profil-kpi">
      <span>{title}</span>
      <strong>{earnings === undefined ? projectCount : currency.format(earnings)}</strong>
      <small>{projectCount} projektov</small>
    </article>
  );
}

export function ProfilPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('pregled');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [year, setYear] = useState(new Date().getFullYear());
  const [overview, setOverview] = useState<ProfileOverview | null>(null);
  const [projects, setProjects] = useState<ProfileProject[]>([]);
  const [earnings, setEarnings] = useState<EarningsResponse | null>(null);
  const [rates, setRates] = useState<ServiceRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchProfileOverview(),
      fetchMyProjects(projectFilter),
      fetchMyEarnings(year),
      fetchMyServiceRates(),
    ])
      .then(([overviewData, projectData, earningsData, ratesData]) => {
        if (cancelled) return;
        setOverview(overviewData);
        setProjects(projectData);
        setEarnings(earningsData);
        setRates(ratesData);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju profila.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    fetchMyProjects(projectFilter)
      .then((projectData) => {
        if (!cancelled) setProjects(projectData);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju projektov.');
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectFilter]);

  useEffect(() => {
    let cancelled = false;
    fetchMyEarnings(year)
      .then((earningsData) => {
        if (!cancelled) setEarnings(earningsData);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju zaslužka.');
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const isSales = useMemo(() => overview?.role?.toUpperCase().includes('SALES') ?? false, [overview?.role]);

  const openProject = (projectId: string) => {
    window.history.pushState({ moduleId: 'projects' }, '', `/projects/${projectId}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { moduleId: 'projects' } }));
  };

  if (loading) {
    return (
      <div className="profil-page">
        <SpinnerState />
      </div>
    );
  }

  if (error) {
    return <div className="profil-page"><div className="profil-state profil-state--error">{error}</div></div>;
  }

  return (
    <div className="profil-page">
      <header className="profil-header">
        <div>
          <h1>Moj profil</h1>
          <p>Osebni pregled projektov, zaslužka in cen storitev.</p>
        </div>
        <nav className="profil-tabs" aria-label="Profil zavihki">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" className={activeTab === tab.key ? 'is-active' : ''} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === 'pregled' && overview ? (
        <section className="profil-stack">
          <section className="profil-panel profil-identity">
            <div>
              <span>Ime</span>
              <strong>{overview.name || '-'}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{overview.email || '-'}</strong>
            </div>
            <div>
              <span>Vloga</span>
              <strong>{overview.role || '-'}</strong>
            </div>
            <div>
              <span>Datum zaposlitve</span>
              <strong>{formatDate(overview.hireDate)}</strong>
            </div>
          </section>

          <section className="profil-kpi-grid">
            <KpiCard title="Ta mesec" earnings={overview.kpis.thisMonth.earnings} projectCount={overview.kpis.thisMonth.projectCount} />
            <KpiCard title="Letos" earnings={overview.kpis.thisYear.earnings} projectCount={overview.kpis.thisYear.projectCount} />
            <KpiCard title="Zadnji teden" earnings={overview.kpis.lastWeek.earnings} projectCount={overview.kpis.lastWeek.projectCount} />
            <KpiCard title="Skupno opravljenih projektov" projectCount={overview.kpis.allTime.projectCount} />
          </section>

          <section className="profil-panel">
            <h2>Naslednji projekt</h2>
            {overview.nextProject ? (
              <button type="button" className="profil-next-project" onClick={() => openProject(overview.nextProject!.id)}>
                <strong>{formatDate(overview.nextProject.date)}</strong>
                <span>{overview.nextProject.customer}</span>
                <small>{overview.nextProject.address || '-'}</small>
              </button>
            ) : (
              <EmptyState>Trenutno nimaš prihajajočega projekta.</EmptyState>
            )}
          </section>
        </section>
      ) : null}

      {activeTab === 'projekti' ? (
        <section className="profil-panel">
          <div className="profil-panel-head">
            <h2>Moji projekti</h2>
            <div className="profil-segmented">
              <button type="button" className={projectFilter === 'all' ? 'is-active' : ''} onClick={() => setProjectFilter('all')}>Vsi</button>
              <button type="button" className={projectFilter === 'upcoming' ? 'is-active' : ''} onClick={() => setProjectFilter('upcoming')}>Prihajajoči</button>
              <button type="button" className={projectFilter === 'completed' ? 'is-active' : ''} onClick={() => setProjectFilter('completed')}>Opravljeni</button>
            </div>
          </div>
          {projectsLoading ? <SpinnerState label="Nalagam projekte..." /> : projects.length === 0 ? (
            <EmptyState>Še nisi sodeloval na nobenem projektu</EmptyState>
          ) : (
            <div className="profil-table-wrap">
              <table className="profil-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Stranka</th>
                    <th>Kategorije</th>
                    <th>Tvoj zaslužek</th>
                    <th>Status plačila</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id} className="is-clickable" onClick={() => openProject(project.id)}>
                      <td>{formatDate(project.date)}</td>
                      <td>{project.customer}</td>
                      <td>
                        <div className="profil-chip-row">
                          {(project.categories.length ? project.categories : ['Brez kategorije']).map((category) => (
                            <span key={`${project.id}-${category}`} className="profil-chip">{category}</span>
                          ))}
                        </div>
                      </td>
                      <td>{currency.format(project.earnings)}</td>
                      <td><StatusBadge paid={project.isPaid} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'zasluzek' && earnings ? (
        <section className="profil-stack">
          <div className="profil-panel-head">
            <h2>Moj zaslužek</h2>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {[year - 1, year, year + 1].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <section className="profil-kpi-grid">
            <KpiCard title="Skupno letos" earnings={earnings.summary.totalThisYear} projectCount={earnings.table.reduce((sum, row) => sum + row.projectCount, 0)} />
            <KpiCard title="Skupno čaka plačila" earnings={earnings.summary.totalPending} projectCount={0} />
            <KpiCard title="Skupno plačano" earnings={earnings.summary.totalPaid} projectCount={0} />
          </section>
          {isSales ? <div className="profil-info">Provizija: Še ni implementirano.</div> : null}
          <section className="profil-panel">
            <h2>Zadnjih 12 mesecev</h2>
            <div className="profil-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={earnings.monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(value) => `${value} €`} width={70} />
                  <Tooltip formatter={(value: number) => currency.format(value)} />
                  <Bar dataKey="amount" name="Zaslužek" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="profil-panel">
            {earnings.table.length === 0 ? <EmptyState>Ni zaslužkov za izbrano leto.</EmptyState> : (
              <div className="profil-table-wrap">
                <table className="profil-table">
                  <thead>
                    <tr><th>Mesec</th><th>Št. projektov</th><th>Zaslužek</th><th>Plačano/Čaka</th></tr>
                  </thead>
                  <tbody>
                    {earnings.table.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{row.projectCount}</td>
                        <td>{currency.format(row.earnings)}</td>
                        <td><StatusBadge paid={row.isPaid} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      ) : null}

      {activeTab === 'cene' ? (
        <section className="profil-panel">
          <div className="profil-info">Tukaj vidiš svoje cene za vsako storitev.</div>
          {rates.length === 0 ? (
            <EmptyState>Tvoje cene storitev še niso nastavljene. Kontaktiraj admina.</EmptyState>
          ) : (
            <div className="profil-table-wrap">
              <table className="profil-table">
                <thead>
                  <tr><th>Storitev</th><th>Cena storitve</th><th>Tvoja cena</th></tr>
                </thead>
                <tbody>
                  {rates.map((rate) => (
                    <tr key={rate.serviceProductId}>
                      <td>{rate.serviceName}</td>
                      <td>{currency.format(rate.servicePrice)}</td>
                      <td>{currency.format(rate.employeeEarnsAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

export default ProfilPage;
