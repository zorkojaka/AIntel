import React, { useEffect, useMemo, useState } from 'react';
import './FinancePage.css';

type Role = 'ADMIN' | 'FINANCE' | 'EXECUTION' | 'SALES' | 'ORGANIZER';
type TabKey = 'projekti' | 'zaposleni' | 'podjetje';

interface MePayload {
  employeeId?: string | null;
  roles?: string[];
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

interface EmployeeProjectBreakdown {
  projectId: string;
  invoiceNumber: string;
  customerName: string;
  issuedAt: string;
  earnings: number;
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
  return new Date(value).toISOString().slice(0, 10);
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

        const [snapshotData, employeeData, monthlyData, productData, pipelineData] = await Promise.all([
          fetchApi<SnapshotListEnvelope>('/api/finance/snapshots?limit=300'),
          fetchApi<EmployeeSummary[]>('/api/finance/employees-summary'),
          canSeeCompany
            ? fetchApi<MonthlySummary[]>(`/api/finance/monthly-summary?year=${new Date().getFullYear()}`)
            : Promise.resolve([]),
          canSeeCompany ? fetchApi<ProductFrequency[]>('/api/finance/product-frequency?limit=10') : Promise.resolve([]),
          canSeeCompany ? fetchApi<PipelineSummary>('/api/finance/pipeline') : Promise.resolve(null),
        ]);

        if (cancelled) return;

        setRoles(mappedRoles);
        setEmployeeId(me.employeeId ?? null);
        setSnapshots(snapshotData.items ?? []);
        setEmployees(employeeData);
        setMonthly(monthlyData);
        setProducts(productData);
        setPipeline(pipelineData);
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

      {tab === 'podjetje' && !isExecutionOnly && (
        <section className="finance-company-grid">
          <article className="finance-panel">
            <h2>Mesečni prihodki</h2>
            {monthly.length === 0 ? (
              <div className="finance-state">Ni podatkov za izbrano leto.</div>
            ) : (
              <div className="bar-chart">
                {monthly.map((row) => {
                  const width = monthlyMax > 0 ? Math.max(8, Math.round((row.totalSaleWithVat / monthlyMax) * 100)) : 0;
                  return (
                    <div key={row.month} className="bar-chart__row">
                      <span>{formatMonthLabel(row.month)}</span>
                      <div className="bar-chart__track"><div className="bar-chart__fill" style={{ width: `${width}%` }} /></div>
                      <strong>{currency.format(row.totalSaleWithVat)}</strong>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          <article className="finance-panel">
            <h2>Top 10 produktov</h2>
            {products.length === 0 ? (
              <div className="finance-state">Ni produktnih podatkov.</div>
            ) : (
              <div className="finance-table-wrap">
                <table className="finance-table">
                  <thead>
                    <tr><th>Naziv</th><th>Prodana količina</th><th>Prihodek</th><th>Marža</th></tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={`${product.productId ?? 'custom'}-${product.name}`}>
                        <td>{product.name}</td>
                        <td>{product.totalQuantity}</td>
                        <td>{currency.format(product.totalRevenue)}</td>
                        <td>{currency.format(product.totalMargin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="finance-panel">
            <h2>Pipeline funnel</h2>
            <div className="pipeline-cards">
              <div className="pipeline-card"><span>Osnutki</span><strong>{pipelineByStatus.get('draft')?.count ?? 0}</strong></div>
              <div className="pipeline-card"><span>Poslane ponudbe</span><strong>{pipelineByStatus.get('offered')?.count ?? 0}</strong></div>
              <div className="pipeline-card"><span>Sprejeto</span><strong>{pipelineByStatus.get('accepted')?.count ?? 0}</strong></div>
              <div className="pipeline-card"><span>Zavrnjeno</span><strong>{pipelineByStatus.get('rejected')?.count ?? 0}</strong></div>
            </div>
            <div className="pipeline-highlight">Win rate: {(pipeline?.winRate ?? 0).toFixed(2)}%</div>
            <div className="pipeline-sub">Skupna vrednost odprtih ponudb: <strong>{currency.format(totalOpenOfferValue)}</strong></div>
          </article>
        </section>
      )}
    </div>
  );
};
