import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from 'recharts';
import './FinancePage.css';

type Role = 'ADMIN' | 'FINANCE' | 'EXECUTION' | 'SALES' | 'ORGANIZER';
type TabKey = 'projekti' | 'zaposleni' | 'podjetje';

interface MePayload {
  employeeId?: string | null;
  roles?: string[];
  employee?: {
    id?: string;
    roles?: string[];
  } | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

interface FinanceSnapshotItem {
  productId: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPriceSale: number;
  unitPricePurchase: number;
  totalSale: number;
  totalPurchase: number;
  margin: number;
}

interface SnapshotEmployeeEarning {
  employeeId: string;
  earnings: number;
  isPaid: boolean;
}

interface FinanceSnapshot {
  _id: string;
  projectId: string;
  invoiceNumber: string;
  issuedAt: string;
  customer: { name: string };
  summary: {
    totalSaleWithVat: number;
    totalSaleWithoutVat: number;
    totalPurchase: number;
    totalMargin: number;
  };
  items: FinanceSnapshotItem[];
  employeeEarnings: SnapshotEmployeeEarning[];
}

interface SnapshotListEnvelope {
  items: FinanceSnapshot[];
}

interface EmployeeSummary {
  employeeId: string;
  employeeName: string;
  totalEarned: number;
  totalPaid: number;
  totalUnpaid: number;
}

interface MonthlySummary {
  month: number;
  totalSaleWithVat: number;
  totalSaleWithoutVat: number;
  totalPurchase: number;
  totalMargin: number;
}

interface ProductFrequency {
  productId: string | null;
  name: string;
  totalQuantity: number;
  totalRevenue: number;
  totalMargin: number;
}

interface PipelineSummary {
  statuses: Array<{ status: string; count: number; totalGross: number }>;
  winRate: number;
}
interface ProjectListItem { id: string; title: string; customer?: { name?: string }; status?: string; offerAmount?: number; quotedTotalWithVat?: number; updatedAt?: string; createdAt?: string }

interface ProductCooccurrenceRow { productA: { id: string; name: string }; productB: { id: string; name: string }; count: number; totalRevenue: number }
interface ProductBundleRow { product: { id: string; name: string }; companions: Array<{ id: string; name: string; count: number; share: number }> }

interface EmployeeProjectBreakdown {
  projectId: string;
  invoiceNumber: string;
  customerName: string;
  issuedAt: string;
  earnings: number;
  isPaid: boolean;
}

interface ExecutionProjectEarningRow {
  snapshotId: string;
  projectId: string;
  issuedAt: string;
  servicesDone: string;
  earnedAmount: number;
  isPaid: boolean;
}

const currency = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? `Napaka API (${response.status})`);
  }
  return payload.data;
}

function toIsoDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return date.toISOString().slice(0, 10);
}

function statusLabel(isPaid: boolean) {
  return isPaid ? 'Plačano' : 'Čaka na plačilo';
}

function marginClass(marginPercent: number) {
  if (marginPercent > 40) return 'is-high';
  if (marginPercent >= 20) return 'is-medium';
  return 'is-low';
}

function formatMonthLabel(month: number) {
  return new Date(Date.UTC(new Date().getFullYear(), month - 1, 1)).toLocaleString('sl-SI', { month: 'long' });
}

class FinanceErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[FinancePage] Crashed:', error);
    console.error('[FinancePage] Component stack:', info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, fontFamily: 'monospace', background: '#fee', border: '2px solid red' }}>
          <h2 style={{ color: 'red' }}>Finance page crashed</h2>
          <h3>Error: {this.state.error.message}</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.error.stack}</pre>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }

    return this.props.children;
  }
}

export const FinancePage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('projekti');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const [snapshots, setSnapshots] = useState<FinanceSnapshot[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [products, setProducts] = useState<ProductFrequency[]>([]);
  const [pipeline, setPipeline] = useState<PipelineSummary | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [pairRows, setPairRows] = useState<ProductCooccurrenceRow[]>([]);
  const [bundleRows, setBundleRows] = useState<ProductBundleRow[]>([]);
  const [coView, setCoView] = useState<'pairs' | 'bundles'>('pairs');

  const [projectSearch, setProjectSearch] = useState('');
  const [projectFrom, setProjectFrom] = useState('');
  const [projectTo, setProjectTo] = useState('');
  const [employeesFrom, setEmployeesFrom] = useState('');
  const [employeesTo, setEmployeesTo] = useState('');

  const [expandedProjectRows, setExpandedProjectRows] = useState<Record<string, boolean>>({});
  const [expandedEmployeeRows, setExpandedEmployeeRows] = useState<Record<string, boolean>>({});
  const [paidByEmployee, setPaidByEmployee] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const me = await fetchApi<MePayload>('/api/auth/me');
        const mappedRoles = (me.roles ?? []) as Role[];
        const canSeeCompany = mappedRoles.includes('ADMIN') || mappedRoles.includes('FINANCE');

        const [snapshotData, employeeData, monthlyData, productData, pipelineData, projectsData, coData, bundleData] = await Promise.all([
          fetchApi<SnapshotListEnvelope>('/api/finance/snapshots?limit=300'),
          fetchApi<EmployeeSummary[]>('/api/finance/employees-summary'),
          canSeeCompany
            ? fetchApi<MonthlySummary[]>(`/api/finance/monthly-summary?year=${new Date().getFullYear()}`)
            : Promise.resolve([]),
          canSeeCompany ? fetchApi<ProductFrequency[]>('/api/finance/product-frequency?limit=10') : Promise.resolve([]),
          canSeeCompany ? fetchApi<PipelineSummary>('/api/finance/pipeline') : Promise.resolve(null),
          canSeeCompany ? fetchApi<ProjectListItem[]>(`/api/projects?year=${new Date().getFullYear()}`) : Promise.resolve([]),
          canSeeCompany ? fetchApi<ProductCooccurrenceRow[]>(`/api/finance/analytics/product-cooccurrence?year=${new Date().getFullYear()}`) : Promise.resolve([]),
          canSeeCompany ? fetchApi<ProductBundleRow[]>(`/api/finance/analytics/product-bundles?year=${new Date().getFullYear()}`) : Promise.resolve([]),
        ]);

        if (cancelled) return;

        setRoles(mappedRoles);
        setEmployeeId(me.employeeId ?? null);
        setSnapshots(snapshotData.items ?? []);
        setEmployees(employeeData);
        setMonthly(monthlyData);
        setProducts(productData);
        setPipeline(pipelineData);
        setProjects(projectsData ?? []);
        setPairRows(coData ?? []);
        setBundleRows(bundleData ?? []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju podatkov.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAdminOrFinance) return;
    Promise.all([
      fetchApi<MonthlySummary[]>(`/api/finance/monthly-summary?year=${selectedYear}`),
      fetchApi<ProductFrequency[]>(`/api/finance/product-frequency?limit=10&dateFrom=${selectedYear}-01-01&dateTo=${selectedYear}-12-31`),
      fetchApi<ProjectListItem[]>(`/api/projects?year=${selectedYear}`),
      fetchApi<ProductCooccurrenceRow[]>(`/api/finance/analytics/product-cooccurrence?year=${selectedYear}`),
      fetchApi<ProductBundleRow[]>(`/api/finance/analytics/product-bundles?year=${selectedYear}`),
    ]).then(([m,p,pr,co,b])=>{ setMonthly(m); setProducts(p); setProjects(pr ?? []); setPairRows(co ?? []); setBundleRows(b ?? []); });
  }, [selectedYear, isAdminOrFinance]);

  const isExecutionOnly = useMemo(() => {
    const roleSet = new Set(roles);
    return roleSet.has('EXECUTION') && !roleSet.has('ADMIN') && !roleSet.has('FINANCE');
  }, [roles]);
  const isAdminOrFinance = useMemo(() => roles.includes('ADMIN') || roles.includes('FINANCE'), [roles]);

  const filteredSnapshots = useMemo(() => {
    const term = projectSearch.trim().toLowerCase();
    return snapshots.filter((snapshot) => {
      const day = toIsoDay(snapshot.issuedAt);
      if (projectFrom && day < projectFrom) return false;
      if (projectTo && day > projectTo) return false;
      if (!term) return true;
      return (
        snapshot.projectId.toLowerCase().includes(term) ||
        snapshot.customer?.name?.toLowerCase().includes(term) ||
        snapshot.invoiceNumber.toLowerCase().includes(term)
      );
    });
  }, [projectFrom, projectSearch, projectTo, snapshots]);

  const projectSummary = useMemo(() => {
    const totalRevenue = filteredSnapshots.reduce((sum, row) => sum + row.summary.totalSaleWithoutVat, 0);
    const totalMargin = filteredSnapshots.reduce((sum, row) => sum + row.summary.totalMargin, 0);
    const avgMarginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
    return {
      totalRevenue,
      totalMargin,
      avgMarginPercent,
      projectCount: filteredSnapshots.length,
    };
  }, [filteredSnapshots]);

  const employeeBreakdownMap = useMemo(() => {
    const map = new Map<string, EmployeeProjectBreakdown[]>();

    snapshots.forEach((snapshot) => {
      const issuedDay = toIsoDay(snapshot.issuedAt);
      if (employeesFrom && issuedDay < employeesFrom) return;
      if (employeesTo && issuedDay > employeesTo) return;

      snapshot.employeeEarnings.forEach((earning) => {
        const resolvedPaid = paidByEmployee[earning.employeeId] ?? earning.isPaid;
        const entry: EmployeeProjectBreakdown = {
          projectId: snapshot.projectId,
          invoiceNumber: snapshot.invoiceNumber,
          customerName: snapshot.customer?.name ?? '-',
          issuedAt: snapshot.issuedAt,
          earnings: earning.earnings,
          isPaid: resolvedPaid,
        };
        const list = map.get(earning.employeeId) ?? [];
        list.push(entry);
        map.set(earning.employeeId, list);
      });
    });

    return map;
  }, [employeesFrom, employeesTo, paidByEmployee, snapshots]);

  const employeeRows = useMemo(() => {
    return employees
      .map((employee) => {
        const projects = employeeBreakdownMap.get(employee.employeeId) ?? [];
        const totalEarned = projects.reduce((sum, project) => sum + project.earnings, 0);
        const totalPaid = projects.filter((project) => project.isPaid).reduce((sum, project) => sum + project.earnings, 0);
        return {
          employeeId: employee.employeeId,
          employeeName: employee.employeeName,
          projectCount: new Set(projects.map((project) => project.projectId)).size,
          totalEarned,
          totalPaid,
          totalUnpaid: totalEarned - totalPaid,
          projects,
        };
      })
      .filter((row) => (!isExecutionOnly ? true : row.employeeId === employeeId));
  }, [employeeBreakdownMap, employeeId, employees, isExecutionOnly]);

  const employeeSummary = useMemo(() => {
    const totalEarned = employeeRows.reduce((sum, row) => sum + row.totalEarned, 0);
    const totalPaid = employeeRows.reduce((sum, row) => sum + row.totalPaid, 0);
    return {
      totalEarned,
      totalPaid,
      totalUnpaid: totalEarned - totalPaid,
    };
  }, [employeeRows]);

  const executionProjects = useMemo(() => {
    if (!isExecutionOnly || !employeeId) return [];
    return snapshots
      .map((snapshot) => {
        const employeeEarning = snapshot.employeeEarnings.find((entry) => entry.employeeId === employeeId);
        if (!employeeEarning) return null;
        const isPaid = paidByEmployee[employeeId] ?? employeeEarning.isPaid;
        return {
          id: snapshot._id,
          projectId: snapshot.projectId,
          invoiceNumber: snapshot.invoiceNumber,
          customerName: snapshot.customer?.name ?? '-',
          issuedAt: snapshot.issuedAt,
          earnings: employeeEarning.earnings,
          isPaid,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }, [employeeId, isExecutionOnly, paidByEmployee, snapshots]);

  const monthlyMax = useMemo(() => monthly.reduce((max, row) => Math.max(max, row.totalSaleWithVat), 0), [monthly]);

  const pipelineByStatus = useMemo(() => {
    const map = new Map<string, { count: number; totalGross: number }>();
    (pipeline?.statuses ?? []).forEach((status) => {
      map.set(status.status, status);
    });
    return map;
  }, [pipeline]);

  const totalOpenOfferValue = useMemo(() => {
    const draft = pipelineByStatus.get('draft')?.totalGross ?? 0;
    const offered = pipelineByStatus.get('offered')?.totalGross ?? 0;
    return draft + offered;
  }, [pipelineByStatus]);

  const toggleProjectRow = (id: string) => {
    setExpandedProjectRows((current) => ({ ...current, [id]: !current[id] }));
  };

  const toggleEmployeeRow = (id: string) => {
    setExpandedEmployeeRows((current) => ({ ...current, [id]: !current[id] }));
  };

  const markEmployeePaid = (id: string) => {
    if (!isAdminOrFinance) return;
    setPaidByEmployee((current) => ({ ...current, [id]: true }));
  };

  if (loading) {
    return (
      <div className="finance-page">
        <div className="finance-skeleton" />
        <div className="finance-skeleton" />
        <div className="finance-skeleton" />
      </div>
    );
  }

  if (error) {
    return <div className="finance-page"><div className="finance-state finance-state--error">{error}</div></div>;
  }

  return (
    <div className="finance-page">
      <header className="finance-header-card">
        <div>
          <h1 className="finance-page__title">Finance</h1>
          <p className="finance-page__subtitle">Pregled prihodkov, marž, zaslužkov ekip in prodajnega pipeline-a.</p>
        </div>
        <div className="finance-tabs" role="tablist" aria-label="Finance tabs">
          <button className={tab === 'projekti' ? 'is-active' : ''} onClick={() => setTab('projekti')}>Projekti</button>
          <button className={tab === 'zaposleni' ? 'is-active' : ''} onClick={() => setTab('zaposleni')}>Zaposleni</button>
          {!isExecutionOnly && (
            <button className={tab === 'podjetje' ? 'is-active' : ''} onClick={() => setTab('podjetje')}>Podjetje</button>
          )}
        </div>
      </header>

      {tab === 'projekti' && (
        <>
          <section className="finance-cards-grid">
            <article className="finance-card"><span>Skupaj prihodki</span><strong>{currency.format(projectSummary.totalRevenue)}</strong></article>
            <article className="finance-card"><span>Skupaj marža</span><strong>{currency.format(projectSummary.totalMargin)}</strong></article>
            <article className="finance-card"><span>Povp. marža %</span><strong>{projectSummary.avgMarginPercent.toFixed(2)}%</strong></article>
            <article className="finance-card"><span>Število projektov</span><strong>{projectSummary.projectCount}</strong></article>
          </section>

          <section className="finance-panel">
            <div className="finance-filter-bar">
              <input type="date" value={projectFrom} onChange={(event) => setProjectFrom(event.target.value)} aria-label="Datum od" />
              <input type="date" value={projectTo} onChange={(event) => setProjectTo(event.target.value)} aria-label="Datum do" />
              <input
                type="search"
                placeholder="Išči po stranki/projektu/računu"
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
              />
            </div>

            {filteredSnapshots.length === 0 ? (
              <div className="finance-state">Še ni izdanih računov za izbrane filtre.</div>
            ) : (
              <div className="finance-table-wrap">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>Račun</th><th>Projekt</th><th>Stranka</th><th>Datum</th><th>Prodaja (brez DDV)</th><th>Nabavna vrednost</th><th>Marža €</th><th>Marža %</th><th>Status plačila</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSnapshots.map((snapshot) => {
                      const marginPercent = snapshot.summary.totalSaleWithoutVat > 0
                        ? (snapshot.summary.totalMargin / snapshot.summary.totalSaleWithoutVat) * 100
                        : 0;
                      const isPaid = snapshot.employeeEarnings.length > 0
                        ? snapshot.employeeEarnings.every((earning) => paidByEmployee[earning.employeeId] ?? earning.isPaid)
                        : false;
                      return (
                        <React.Fragment key={snapshot._id}>
                          <tr className="is-clickable" onClick={() => toggleProjectRow(snapshot._id)}>
                            <td>{snapshot.invoiceNumber}</td>
                            <td>{snapshot.projectId}</td>
                            <td>{snapshot.customer?.name ?? '-'}</td>
                            <td>{new Date(snapshot.issuedAt).toLocaleDateString('sl-SI')}</td>
                            <td>{currency.format(snapshot.summary.totalSaleWithoutVat)}</td>
                            <td>{currency.format(snapshot.summary.totalPurchase)}</td>
                            <td>{currency.format(snapshot.summary.totalMargin)}</td>
                            <td><span className={`margin-badge ${marginClass(marginPercent)}`}>{marginPercent.toFixed(2)}%</span></td>
                            <td><span className={`status-badge ${isPaid ? 'is-paid' : 'is-pending'}`}>{statusLabel(isPaid)}</span></td>
                          </tr>
                          {expandedProjectRows[snapshot._id] && (
                            <tr className="expanded-row">
                              <td colSpan={9}>
                                <table className="inner-table">
                                  <thead>
                                    <tr>
                                      <th>Artikel</th><th>Količina</th><th>Prodajna cena</th><th>Nabavna cena</th><th>Marža</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {snapshot.items.map((item, index) => (
                                      <tr key={`${snapshot._id}-${item.productId ?? 'x'}-${index}`}>
                                        <td>{item.name}</td>
                                        <td>{item.quantity} {item.unit}</td>
                                        <td>{currency.format(item.totalSale)}</td>
                                        <td>{currency.format(item.totalPurchase)}</td>
                                        <td>{currency.format(item.margin)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'zaposleni' && !isExecutionOnly && (
        <>
          <section className="finance-cards-grid">
            <article className="finance-card"><span>Skupaj zaslužki</span><strong>{currency.format(employeeSummary.totalEarned)}</strong></article>
            <article className="finance-card"><span>Plačano</span><strong>{currency.format(employeeSummary.totalPaid)}</strong></article>
            <article className="finance-card"><span>Neplačano</span><strong>{currency.format(employeeSummary.totalUnpaid)}</strong></article>
          </section>

          <section className="finance-panel">
            <div className="finance-filter-bar">
              <input type="date" value={employeesFrom} onChange={(event) => setEmployeesFrom(event.target.value)} aria-label="Datum od" />
              <input type="date" value={employeesTo} onChange={(event) => setEmployeesTo(event.target.value)} aria-label="Datum do" />
            </div>

            {employeeRows.length === 0 ? (
              <div className="finance-state">Ni zaslužkov za izbran datum.</div>
            ) : (
              <div className="finance-table-wrap">
                <table className="finance-table">
                  <thead>
                    <tr><th>Ime</th><th>Št. projektov</th><th>Skupaj</th><th>Plačano</th><th>Neplačano</th><th>Akcija</th></tr>
                  </thead>
                  <tbody>
                    {employeeRows.map((row) => (
                      <React.Fragment key={row.employeeId}>
                        <tr className="is-clickable" onClick={() => toggleEmployeeRow(row.employeeId)}>
                          <td>{row.employeeName}</td>
                          <td>{row.projectCount}</td>
                          <td>{currency.format(row.totalEarned)}</td>
                          <td>{currency.format(row.totalPaid)}</td>
                          <td>{currency.format(row.totalUnpaid)}</td>
                          <td>
                            <button type="button" className="finance-btn" onClick={(event) => { event.stopPropagation(); markEmployeePaid(row.employeeId); }}>
                              Označi kot plačano
                            </button>
                          </td>
                        </tr>
                        {expandedEmployeeRows[row.employeeId] && (
                          <tr className="expanded-row">
                            <td colSpan={6}>
                              <table className="inner-table">
                                <thead>
                                  <tr><th>Projekt</th><th>Račun</th><th>Stranka</th><th>Datum</th><th>Zaslužek</th><th>Status</th></tr>
                                </thead>
                                <tbody>
                                  {row.projects.map((project) => (
                                    <tr key={`${row.employeeId}-${project.invoiceNumber}-${project.projectId}`}>
                                      <td>{project.projectId}</td>
                                      <td>{project.invoiceNumber}</td>
                                      <td>{project.customerName}</td>
                                      <td>{new Date(project.issuedAt).toLocaleDateString('sl-SI')}</td>
                                      <td>{currency.format(project.earnings)}</td>
                                      <td><span className={`status-badge ${project.isPaid ? 'is-paid' : 'is-pending'}`}>{statusLabel(project.isPaid)}</span></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'zaposleni' && isExecutionOnly && (
        <>
          <section className="finance-cards-grid">
            <article className="finance-card"><span>Skupaj zasluženo</span><strong>{currency.format(employeeSummary.totalEarned)}</strong></article>
            <article className="finance-card"><span>Plačano</span><strong>{currency.format(employeeSummary.totalPaid)}</strong></article>
            <article className="finance-card"><span>Čaka na plačilo</span><strong>{currency.format(employeeSummary.totalUnpaid)}</strong></article>
          </section>
          <section className="finance-panel">
            {executionProjects.length === 0 ? (
              <div className="finance-state">Trenutno nimaš zabeleženih zaslužkov.</div>
            ) : (
              <ul className="execution-project-list">
                {executionProjects.map((project) => (
                  <li key={project.id}>
                    <div>
                      <h3>{project.projectId}</h3>
                      <p>{project.customerName} · {new Date(project.issuedAt).toLocaleDateString('sl-SI')}</p>
                    </div>
                    <div>
                      <strong>{currency.format(project.earnings)}</strong>
                      <span className={`status-badge ${project.isPaid ? 'is-paid' : 'is-pending'}`}>{statusLabel(project.isPaid)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === 'podjetje' && !isExecutionOnly && (() => {
        const statusMap = new Map((pipeline?.statuses ?? []).map((s) => [s.status, s]));
        const draftCount = (statusMap.get('draft')?.count ?? 0) + (statusMap.get('new')?.count ?? 0);
        const sentCount = (statusMap.get('offer_sent')?.count ?? 0) + (statusMap.get('offered')?.count ?? 0);
        const confirmedCount = (statusMap.get('confirmed')?.count ?? 0) + (statusMap.get('accepted')?.count ?? 0);
        const rejectedCount = statusMap.get('rejected')?.count ?? 0;
        const winRate = confirmedCount + rejectedCount > 0 ? (confirmedCount / (confirmedCount + rejectedCount)) * 100 : 0;
        const yearSnapshots = snapshots.filter((s) => new Date(s.issuedAt).getFullYear() === selectedYear);
        const revenueSum = yearSnapshots.reduce((a,b)=>a+b.summary.totalSaleWithoutVat,0);
        const marginSum = yearSnapshots.reduce((a,b)=>a+b.summary.totalMargin,0);
        const invoiceCount = yearSnapshots.length;
        const projectRows = [...(projects ?? [])].filter((p)=>{const d=new Date(p?.updatedAt ?? p?.createdAt ?? '').getFullYear(); return d===selectedYear;}).sort((a,b)=>new Date(b?.updatedAt ?? b?.createdAt ?? '').valueOf()-new Date(a?.updatedAt ?? a?.createdAt ?? '').valueOf());
        const offerRows = projectRows.filter((p)=>sentCount>=0 && ['offer_sent','offered','confirmed','accepted','rejected'].includes(String(p.status ?? '')));
        const offersValue = offerRows.reduce((a,b)=>a+Number(b.quotedTotalWithVat ?? b.offerAmount ?? 0),0);
        const acceptedOffers = offerRows.filter((p)=>['confirmed','accepted'].includes(String(p.status ?? ''))).length;
        const productRows = [...(products ?? [])].sort((a,b)=>(b?.totalRevenue ?? 0)-(a?.totalRevenue ?? 0)).slice(0,10);
        const monthlyChart = (monthly ?? []).map((m)=>({ ...m, marginPct: (m?.totalSaleWithoutVat ?? 0)>0 ? ((m?.totalMargin ?? 0)/(m?.totalSaleWithoutVat ?? 0))*100 : 0, name: formatMonthLabel(m?.month ?? 1)}));
        return (<section className="space-y-4">
          <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Pregled podjetja</h2><select className="border rounded px-3 py-2" value={selectedYear} onChange={(e)=>setSelectedYear(Number(e.target.value))}>{[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}</select></div>
          <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <article className="finance-card"><span>Skupni prihodki leta</span><strong>{currency.format(revenueSum)}</strong></article>
            <article className="finance-card"><span>Skupna marža %</span><strong>{revenueSum>0?((marginSum/revenueSum)*100).toFixed(2):'0.00'}%</strong></article>
            <article className="finance-card"><span>Število projektov</span><strong>{projectRows.length}</strong></article>
            <article className="finance-card"><span>Število izdanih računov</span><strong>{invoiceCount}</strong></article>
          </section>
          <article className="finance-panel"><h2>Mesečni prihodki</h2>{monthlyChart.length===0?<div className="finance-state">Ni podatkov za izbrano leto.</div>:<div className="h-72"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyChart}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis yAxisId="left"/><YAxis yAxisId="right" orientation="right"/><Tooltip/><Bar yAxisId="left" dataKey="totalSaleWithoutVat" name="Prodajna cena" fill="#2563eb"/><Bar yAxisId="left" dataKey="totalPurchase" name="Nabavna cena" fill="#f97316"/><Line yAxisId="right" type="monotone" dataKey="marginPct" name="Marža %" stroke="#16a34a"/></ComposedChart></ResponsiveContainer></div>}</article>
          <article className="finance-panel"><h2>Top 10 produktov</h2>{productRows?.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Naziv</th><th>Količina</th><th>Prihodek</th><th>Marža</th></tr></thead><tbody>{productRows?.map((p)=><tr key={`${p?.productId ?? 'x'}-${p?.name ?? 'izdelek'}`}><td>{p?.name ?? '-'}</td><td>{p?.totalQuantity ?? 0}</td><td>{currency.format(p?.totalRevenue ?? 0)}</td><td>{currency.format(p?.totalMargin ?? 0)}</td></tr>) ?? []}</tbody></table></div> : <div className="finance-state">Ni produktnih podatkov.</div>}</article>
          <article className="finance-panel"><h2>Pipeline funnel</h2><div className="pipeline-cards"><div className="pipeline-card"><span>Osnutki</span><strong>{draftCount}</strong></div><div className="pipeline-card"><span>Poslane ponudbe</span><strong>{sentCount}</strong></div><div className="pipeline-card"><span>Sprejeto</span><strong>{confirmedCount}</strong></div><div className="pipeline-card"><span>Zavrnjeno</span><strong>{rejectedCount}</strong></div></div><div className="pipeline-highlight">Win rate: {winRate.toFixed(2)}%</div></article>
          <article className="finance-panel"><h2>Pregled projektov</h2>{projectRows?.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Projekt</th><th>Stranka</th><th>Status</th><th>Vrednost ponudbe</th><th>Datum</th></tr></thead><tbody>{projectRows?.map((r)=><tr key={r?.id ?? `${r?.title ?? 'projekt'}-${r?.updatedAt ?? ''}`} className="is-clickable" onClick={()=> r?.id && (window.location.href=`/projects/${r.id}`)}><td>{r?.title ?? '-'}</td><td>{r?.customer?.name ?? '-'}</td><td>{r?.status ?? '-'}</td><td>{currency.format(Number(r?.quotedTotalWithVat ?? r?.offerAmount ?? 0))}</td><td>{new Date(r?.updatedAt ?? r?.createdAt ?? '').toLocaleDateString('sl-SI')}</td></tr>) ?? []}</tbody></table></div> : <div className="finance-state">Ni projektov za izbrano leto.</div>}</article>
          <article className="finance-panel"><h2>Pogosto kupljeni skupaj</h2><div className="flex gap-2 mb-3"><button className={`finance-btn ${coView==='pairs' ? 'is-active' : ''}`} onClick={()=>setCoView('pairs')}>Pari produktov</button><button className={`finance-btn ${coView==='bundles' ? 'is-active' : ''}`} onClick={()=>setCoView('bundles')}>Bundli (3+)</button></div>{coView==='pairs' ? (pairRows?.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Produkt A</th><th>Produkt B</th><th>Skupaj prodano</th><th>Skupna vrednost</th></tr></thead><tbody>{pairRows?.map((r)=> <tr key={`${r?.productA?.id ?? 'a'}-${r?.productB?.id ?? 'b'}`}><td>{r?.productA?.name ?? '-'}</td><td>{r?.productB?.name ?? '-'}</td><td>{r?.count ?? 0}×</td><td>{currency.format(r?.totalRevenue ?? 0)}</td></tr>) ?? []}</tbody></table></div> : <div className="finance-state">Ni parov produktov.</div>) : (bundleRows?.length ? <div className="space-y-3">{bundleRows?.map((row)=><div key={row?.product?.id ?? row?.product?.name ?? 'bundle'}><p>Ko nekdo kupi <strong>{row?.product?.name ?? '-'}</strong>, pogosto kupi tudi:</p><ul>{row?.companions?.map((c)=><li key={`${row?.product?.id ?? 'x'}-${c?.id ?? 'y'}`}>- {c?.name ?? '-'} ({c?.count ?? 0}× / {(c?.share ?? 0).toFixed(0)}%)</li>) ?? []}</ul></div>) ?? []}</div> : <div className="finance-state">Ni bundle podatkov.</div>)}</article>
          <article className="finance-panel"><h2>Izdane ponudbe</h2><div className="pipeline-sub">Skupna vrednost: <strong>{currency.format(offersValue)}</strong> · % sprejetih: <strong>{offerRows.length>0?((acceptedOffers/offerRows.length)*100).toFixed(2):'0.00'}%</strong></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Projekt</th><th>Stranka</th><th>Vrednost</th><th>Status</th><th>Datum</th></tr></thead><tbody>{offerRows.map((r)=><tr key={`offer-${r.id}`}><td>{r.title}</td><td>{r.customer?.name ?? '-'}</td><td>{currency.format(Number(r.quotedTotalWithVat ?? r.offerAmount ?? 0))}</td><td>{['confirmed','accepted'].includes(String(r.status))?'sprejeto':String(r.status)==='rejected'?'zavrnjeno':'čakanje'}</td><td>{new Date(r.updatedAt ?? r.createdAt ?? '').toLocaleDateString('sl-SI')}</td></tr>)}</tbody></table></div></article>
        </section>);
      })()}
    </div>
  );
};


const FinancePageWithBoundary: React.FC = () => (
  <FinanceErrorBoundary>
    <FinancePage />
  </FinanceErrorBoundary>
);

export default FinancePageWithBoundary;
