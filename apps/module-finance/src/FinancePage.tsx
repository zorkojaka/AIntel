import React, { useEffect, useMemo, useState } from 'react';
import './FinancePage.css';

type Role = 'ADMIN' | 'FINANCE' | 'EXECUTION' | 'SALES' | 'ORGANIZER';
type TabKey = 'projekti' | 'zaposleni' | 'podjetje';
type PeriodMode = 'week' | 'month' | 'quarter' | 'year';
type ProjectStatusFilter = 'all' | 'paid' | 'pending';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

interface MePayload {
  employeeId?: string | null;
  roles?: string[];
}

interface FinanceSnapshotItem {
  name: string;
  unit: string;
  quantity: number;
  totalSale: number;
  totalPurchase: number;
  margin: number;
  isService?: boolean;
}

interface EmployeeEarning {
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
    totalSaleWithoutVat: number;
    totalPurchase: number;
    totalMargin: number;
  };
  items: FinanceSnapshotItem[];
  employeeEarnings: EmployeeEarning[];
}

interface SnapshotListEnvelope {
  items: FinanceSnapshot[];
}

interface EmployeeSummary {
  employeeId: string;
  employeeName: string;
}

interface MonthlySummary {
  month: number;
  totalSaleWithVat: number;
  totalSaleWithoutVat: number;
  totalPurchase: number;
  totalMargin: number;
  projectCount: number;
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

interface PeriodCardData {
  key: 'previous' | 'current' | 'next';
  label: string;
  name: string;
  revenue: number;
  purchase: number;
  margin: number;
  marginPercent: number;
  projects: number;
  openOffers?: number;
  pipelineDetails?: {
    accepted: number;
    draft: number;
    offered: number;
    expectedRevenue: number;
  };
}

interface EmployeeRow {
  employeeId: string;
  employeeName: string;
  projectsCount: number;
  servicesCount: number;
  totalEarned: number;
  totalPaid: number;
  totalUnpaid: number;
  breakdown: Array<{
    projectId: string;
    customer: string;
    date: string;
    servicesLabel: string;
    earnings: number;
    isPaid: boolean;
  }>;
}

const currency = new Intl.NumberFormat('sl-SI', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

async function getApi<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? `API napaka (${response.status})`);
  }
  return payload.data;
}

function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = (day + 6) % 7;
  value.setDate(value.getDate() - diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addPeriod(date: Date, mode: PeriodMode, offset: number) {
  const value = new Date(date);
  if (mode === 'week') {
    value.setDate(value.getDate() + offset * 7);
    return value;
  }
  if (mode === 'month') {
    value.setMonth(value.getMonth() + offset);
    return value;
  }
  if (mode === 'quarter') {
    value.setMonth(value.getMonth() + offset * 3);
    return value;
  }
  value.setFullYear(value.getFullYear() + offset);
  return value;
}

function periodBounds(anchor: Date, mode: PeriodMode) {
  if (mode === 'week') {
    const start = startOfWeek(anchor);
    const end = addPeriod(start, 'week', 1);
    return { start, end };
  }
  if (mode === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    return { start, end };
  }
  if (mode === 'quarter') {
    const quarterStartMonth = Math.floor(anchor.getMonth() / 3) * 3;
    const start = new Date(anchor.getFullYear(), quarterStartMonth, 1);
    const end = new Date(anchor.getFullYear(), quarterStartMonth + 3, 1);
    return { start, end };
  }
  const start = new Date(anchor.getFullYear(), 0, 1);
  const end = new Date(anchor.getFullYear() + 1, 0, 1);
  return { start, end };
}

function periodLabel(mode: PeriodMode, key: 'previous' | 'current' | 'next') {
  const map: Record<PeriodMode, Record<'previous' | 'current' | 'next', string>> = {
    week: { previous: 'Prejšnji teden', current: 'Trenutni teden', next: 'Naslednji teden' },
    month: { previous: 'Prejšnji mesec', current: 'Trenutni mesec', next: 'Naslednji mesec' },
    quarter: { previous: 'Prejšnja četrtina', current: 'Trenutna četrtina', next: 'Naslednja četrtina' },
    year: { previous: 'Prejšnje leto', current: 'Trenutno leto', next: 'Napoved' },
  };
  return map[mode][key];
}

function marginBadgeClass(value: number) {
  if (value > 40) return 'badge-green';
  if (value >= 20) return 'badge-amber';
  return 'badge-red';
}

function statusClass(isPaid: boolean) {
  return isPaid ? 'badge-green' : 'badge-amber';
}

function formatPeriodName(anchor: Date, mode: PeriodMode) {
  if (mode === 'week') {
    return `Teden ${anchor.toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit' })}`;
  }
  if (mode === 'month') {
    return anchor.toLocaleDateString('sl-SI', { month: 'short', year: 'numeric' });
  }
  if (mode === 'quarter') {
    return `Q${Math.floor(anchor.getMonth() / 3) + 1} ${anchor.getFullYear()}`;
  }
  return `${anchor.getFullYear()}`;
}

export const FinancePage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('projekti');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const [snapshots, setSnapshots] = useState<FinanceSnapshot[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [products, setProducts] = useState<ProductFrequency[]>([]);
  const [pipeline, setPipeline] = useState<PipelineSummary | null>(null);

  const [projectFrom, setProjectFrom] = useState('');
  const [projectTo, setProjectTo] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState<ProjectStatusFilter>('all');

  const [employeeFrom, setEmployeeFrom] = useState('');
  const [employeeTo, setEmployeeTo] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');

  const [expandedProject, setExpandedProject] = useState<Record<string, boolean>>({});
  const [expandedEmployee, setExpandedEmployee] = useState<Record<string, boolean>>({});
  const [paidOverride, setPaidOverride] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const me = await getApi<MePayload>('/api/auth/me');
        const resolvedRoles = (me.roles ?? []) as Role[];
        const canSeeCompany = resolvedRoles.includes('ADMIN') || resolvedRoles.includes('FINANCE');

        const [snapshotData, employeesData, monthlyData, productsData, pipelineData] = await Promise.all([
          getApi<SnapshotListEnvelope>('/api/finance/snapshots?limit=300'),
          getApi<EmployeeSummary[]>('/api/finance/employees-summary'),
          canSeeCompany ? getApi<MonthlySummary[]>(`/api/finance/monthly-summary?year=${new Date().getFullYear()}`) : Promise.resolve([]),
          canSeeCompany ? getApi<ProductFrequency[]>('/api/finance/product-frequency?limit=10') : Promise.resolve([]),
          canSeeCompany ? getApi<PipelineSummary>('/api/finance/pipeline') : Promise.resolve(null),
        ]);

        if (cancelled) return;
        setRoles(resolvedRoles);
        setEmployeeId(me.employeeId ?? null);
        setSnapshots(snapshotData.items ?? []);
        setEmployees(employeesData);
        setMonthly(monthlyData);
        setProducts(productsData);
        setPipeline(pipelineData);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Napaka pri nalaganju.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const isExecutionOnly = useMemo(() => {
    const roleSet = new Set(roles);
    return roleSet.has('EXECUTION') && !roleSet.has('ADMIN') && !roleSet.has('FINANCE');
  }, [roles]);

  const roleBadge = isExecutionOnly ? 'MONTER' : 'ADMIN';

  const snapshotsWithPayment = useMemo(() => {
    return snapshots.map((snapshot) => {
      const isPaid = snapshot.employeeEarnings.length > 0
        ? snapshot.employeeEarnings.every((row) => paidOverride[row.employeeId] ?? row.isPaid)
        : false;
      return { ...snapshot, isPaid };
    });
  }, [paidOverride, snapshots]);

  const filteredProjects = useMemo(() => {
    const term = projectSearch.trim().toLowerCase();
    return snapshotsWithPayment.filter((snapshot) => {
      const date = new Date(snapshot.issuedAt).toISOString().slice(0, 10);
      if (projectFrom && date < projectFrom) return false;
      if (projectTo && date > projectTo) return false;
      if (projectStatusFilter === 'paid' && !snapshot.isPaid) return false;
      if (projectStatusFilter === 'pending' && snapshot.isPaid) return false;
      if (!term) return true;
      return (
        snapshot.projectId.toLowerCase().includes(term)
        || snapshot.customer.name.toLowerCase().includes(term)
        || snapshot.invoiceNumber.toLowerCase().includes(term)
      );
    });
  }, [projectFrom, projectSearch, projectStatusFilter, projectTo, snapshotsWithPayment]);

  const projectKpi = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const prevYear = currentYear - 1;
    const current = filteredProjects.filter((row) => new Date(row.issuedAt).getFullYear() === currentYear);
    const previous = filteredProjects.filter((row) => new Date(row.issuedAt).getFullYear() === prevYear);

    const revenue = filteredProjects.reduce((sum, row) => sum + row.summary.totalSaleWithoutVat, 0);
    const margin = filteredProjects.reduce((sum, row) => sum + row.summary.totalMargin, 0);
    const purchase = filteredProjects.reduce((sum, row) => sum + row.summary.totalPurchase, 0);

    const currentRevenue = current.reduce((sum, row) => sum + row.summary.totalSaleWithoutVat, 0);
    const previousRevenue = previous.reduce((sum, row) => sum + row.summary.totalSaleWithoutVat, 0);

    const currentCount = current.length;
    const previousCount = previous.length;

    const revenueChange = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const invoiceChange = currentCount - previousCount;
    const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
    const purchasePercent = revenue > 0 ? (purchase / revenue) * 100 : 0;

    return { revenue, margin, purchase, invoices: filteredProjects.length, revenueChange, invoiceChange, marginPercent, purchasePercent };
  }, [filteredProjects]);

  const employeeRows = useMemo(() => {
    const mapByEmployee = new Map<string, EmployeeRow>();

    snapshotsWithPayment.forEach((snapshot) => {
      const snapshotDate = new Date(snapshot.issuedAt).toISOString().slice(0, 10);
      if (employeeFrom && snapshotDate < employeeFrom) return;
      if (employeeTo && snapshotDate > employeeTo) return;

      const services = snapshot.items.filter((item) => item.isService);
      const servicesCount = services.reduce((sum, item) => sum + item.quantity, 0);
      const serviceLabel = services.length
        ? services.map((item) => `${item.quantity}× ${item.name}`).join(', ')
        : '—';

      snapshot.employeeEarnings.forEach((earning) => {
        if (isExecutionOnly && employeeId && earning.employeeId !== employeeId) return;
        const key = earning.employeeId;

        const existing = mapByEmployee.get(key) ?? {
          employeeId: key,
          employeeName: employees.find((employee) => employee.employeeId === key)?.employeeName ?? key,
          projectsCount: 0,
          servicesCount: 0,
          totalEarned: 0,
          totalPaid: 0,
          totalUnpaid: 0,
          breakdown: [],
        };

        const paid = paidOverride[key] ?? earning.isPaid;
        existing.projectsCount += 1;
        existing.servicesCount += servicesCount;
        existing.totalEarned += earning.earnings;
        existing.totalPaid += paid ? earning.earnings : 0;
        existing.totalUnpaid += paid ? 0 : earning.earnings;
        existing.breakdown.push({
          projectId: snapshot.projectId,
          customer: snapshot.customer.name,
          date: snapshot.issuedAt,
          servicesLabel: serviceLabel,
          earnings: earning.earnings,
          isPaid: paid,
        });

        mapByEmployee.set(key, existing);
      });
    });

    const rows = Array.from(mapByEmployee.values());
    if (employeeFilter !== 'all') {
      return rows.filter((row) => row.employeeId === employeeFilter);
    }
    return rows;
  }, [employeeFilter, employeeFrom, employeeId, employeeTo, employees, isExecutionOnly, paidOverride, snapshotsWithPayment]);

  const employeeKpi = useMemo(() => {
    const totalEarned = employeeRows.reduce((sum, row) => sum + row.totalEarned, 0);
    const totalPaid = employeeRows.reduce((sum, row) => sum + row.totalPaid, 0);
    return { totalEarned, totalPaid, totalUnpaid: totalEarned - totalPaid };
  }, [employeeRows]);

  const periodCards = useMemo(() => {
    const currentDate = new Date();
    const statuses = new Map((pipeline?.statuses ?? []).map((item) => [item.status, item]));

    const buildCard = (key: 'previous' | 'current' | 'next', offset: number): PeriodCardData => {
      const anchor = addPeriod(currentDate, periodMode, offset);
      const bounds = periodBounds(anchor, periodMode);
      const periodRows = snapshotsWithPayment.filter((snapshot) => {
        const date = new Date(snapshot.issuedAt);
        return date >= bounds.start && date < bounds.end;
      });

      const revenue = periodRows.reduce((sum, row) => sum + row.summary.totalSaleWithoutVat, 0);
      const purchase = periodRows.reduce((sum, row) => sum + row.summary.totalPurchase, 0);
      const margin = periodRows.reduce((sum, row) => sum + row.summary.totalMargin, 0);
      const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;

      const base: PeriodCardData = {
        key,
        label: periodLabel(periodMode, key),
        name: formatPeriodName(anchor, periodMode),
        revenue,
        purchase,
        margin,
        marginPercent,
        projects: periodRows.length,
      };

      if (key === 'current') {
        base.openOffers = (statuses.get('draft')?.totalGross ?? 0) + (statuses.get('offered')?.totalGross ?? 0);
      }

      if (key === 'next') {
        base.pipelineDetails = {
          accepted: statuses.get('accepted')?.count ?? 0,
          draft: statuses.get('draft')?.count ?? 0,
          offered: statuses.get('offered')?.count ?? 0,
          expectedRevenue: statuses.get('offered')?.totalGross ?? 0,
        };
      }

      return base;
    };

    return [buildCard('previous', -1), buildCard('current', 0), buildCard('next', 1)];
  }, [periodMode, pipeline, snapshotsWithPayment]);

  const pipelineMap = useMemo(() => {
    return new Map((pipeline?.statuses ?? []).map((item) => [item.status, item]));
  }, [pipeline]);

  const topProducts = useMemo(() => {
    return products.map((product) => {
      const marginPercent = product.totalRevenue > 0 ? (product.totalMargin / product.totalRevenue) * 100 : 0;
      return { ...product, marginPercent };
    });
  }, [products]);

  const toggleProject = (id: string) => {
    setExpandedProject((current) => ({ ...current, [id]: !current[id] }));
  };

  const toggleEmployee = (id: string) => {
    setExpandedEmployee((current) => ({ ...current, [id]: !current[id] }));
  };

  const markPaid = (id: string) => {
    setPaidOverride((current) => ({ ...current, [id]: true }));
  };

  if (loading) {
    return (
      <div className="finance-page">
        <div className="finance-skeleton" />
        <div className="finance-skeleton" />
      </div>
    );
  }

  if (error) {
    return <div className="finance-page"><div className="finance-error">{error}</div></div>;
  }

  return (
    <div className="finance-page">
      <header className="finance-top-bar">
        <h1>Finance</h1>
        <span className="role-pill">{roleBadge}</span>
      </header>

      <nav className="finance-tabs" aria-label="Finance tabs">
        <button className={tab === 'projekti' ? 'is-active' : ''} onClick={() => setTab('projekti')}>Projekti</button>
        <button className={tab === 'zaposleni' ? 'is-active' : ''} onClick={() => setTab('zaposleni')}>Zaposleni</button>
        {!isExecutionOnly && <button className={tab === 'podjetje' ? 'is-active' : ''} onClick={() => setTab('podjetje')}>Podjetje</button>}
      </nav>

      {tab === 'projekti' && (
        <>
          <section className="kpi-grid kpi-grid--four">
            <article className="kpi-card"><span>Skupaj prihodki</span><strong>{currency.format(projectKpi.revenue)}</strong><small>{projectKpi.revenueChange.toFixed(0)}% vs lani</small></article>
            <article className="kpi-card"><span>Marža skupaj</span><strong>{currency.format(projectKpi.margin)}</strong><small>{projectKpi.marginPercent.toFixed(0)}% avg</small></article>
            <article className="kpi-card"><span>Nabavni stroški</span><strong>{currency.format(projectKpi.purchase)}</strong><small>{projectKpi.purchasePercent.toFixed(0)}% prihodkov</small></article>
            <article className="kpi-card"><span>Izdani računi</span><strong>{projectKpi.invoices}</strong><small>{projectKpi.invoiceChange >= 0 ? '+' : ''}{projectKpi.invoiceChange} vs lani</small></article>
          </section>

          <section className="finance-block">
            <div className="filter-bar">
              <input type="date" value={projectFrom} onChange={(event) => setProjectFrom(event.target.value)} />
              <input type="date" value={projectTo} onChange={(event) => setProjectTo(event.target.value)} />
              <input type="search" placeholder="Išči projekt / stranko / račun..." value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} />
              <select value={projectStatusFilter} onChange={(event) => setProjectStatusFilter(event.target.value as ProjectStatusFilter)}>
                <option value="all">Vsi statusi</option>
                <option value="paid">Plačano</option>
                <option value="pending">Čaka na plačilo</option>
              </select>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="finance-empty">Še ni izdanih računov.</div>
            ) : (
              <div className="table-wrap">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Projekt</th>
                      <th>Stranka</th>
                      <th>Račun</th>
                      <th>Datum</th>
                      <th>Prodaja</th>
                      <th>Nabava</th>
                      <th>Marža €</th>
                      <th>Marža %</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((snapshot) => {
                      const marginPercent = snapshot.summary.totalSaleWithoutVat > 0
                        ? (snapshot.summary.totalMargin / snapshot.summary.totalSaleWithoutVat) * 100
                        : 0;
                      return (
                        <React.Fragment key={snapshot._id}>
                          <tr className="main-row" onClick={() => toggleProject(snapshot._id)}>
                            <td>{expandedProject[snapshot._id] ? '▼' : '▶'}</td>
                            <td className="strong">{snapshot.projectId}</td>
                            <td>{snapshot.customer.name}</td>
                            <td className="muted">{snapshot.invoiceNumber}</td>
                            <td>{new Date(snapshot.issuedAt).toLocaleDateString('sl-SI')}</td>
                            <td>{currency.format(snapshot.summary.totalSaleWithoutVat)}</td>
                            <td>{currency.format(snapshot.summary.totalPurchase)}</td>
                            <td>{currency.format(snapshot.summary.totalMargin)}</td>
                            <td><span className={`tag ${marginBadgeClass(marginPercent)}`}>{marginPercent.toFixed(0)}%</span></td>
                            <td><span className={`tag ${statusClass(snapshot.isPaid)}`}>{snapshot.isPaid ? 'Plačano' : 'Čaka'}</span></td>
                          </tr>
                          {expandedProject[snapshot._id] && (
                            <tr>
                              <td colSpan={10} className="inner-cell">
                                <table className="inner-table">
                                  <thead>
                                    <tr><th>Artikel</th><th>Količina</th><th>Prodajna cena</th><th>Nabavna cena</th><th>Marža</th></tr>
                                  </thead>
                                  <tbody>
                                    {snapshot.items.map((item, index) => (
                                      <tr key={`${snapshot._id}-${index}`}>
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
          <section className="kpi-grid">
            <article className="kpi-card"><span>Skupaj zaslužki</span><strong>{currency.format(employeeKpi.totalEarned)}</strong></article>
            <article className="kpi-card"><span>Plačano</span><strong className="value-green">{currency.format(employeeKpi.totalPaid)}</strong></article>
            <article className="kpi-card"><span>Neplačano</span><strong className="value-amber">{currency.format(employeeKpi.totalUnpaid)}</strong></article>
          </section>

          <section className="finance-block">
            <div className="filter-bar">
              <input type="date" value={employeeFrom} onChange={(event) => setEmployeeFrom(event.target.value)} />
              <input type="date" value={employeeTo} onChange={(event) => setEmployeeTo(event.target.value)} />
              <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}>
                <option value="all">Vsi zaposleni</option>
                {employees.map((employee) => (
                  <option key={employee.employeeId} value={employee.employeeId}>{employee.employeeName}</option>
                ))}
              </select>
            </div>

            {employeeRows.length === 0 ? (
              <div className="finance-empty">Ni podatkov o zaslužkih.</div>
            ) : (
              <div className="table-wrap">
                <table className="finance-table">
                  <thead>
                    <tr><th /> <th>Monter</th><th>Projekti</th><th>Storitve opravljene</th><th>Skupaj zasluženo</th><th>Plačano</th><th>Neplačano</th><th>Akcija</th></tr>
                  </thead>
                  <tbody>
                    {employeeRows.map((row) => (
                      <React.Fragment key={row.employeeId}>
                        <tr className="main-row" onClick={() => toggleEmployee(row.employeeId)}>
                          <td>{expandedEmployee[row.employeeId] ? '▼' : '▶'}</td>
                          <td className="strong">{row.employeeName}</td>
                          <td>{row.projectsCount}</td>
                          <td>{row.servicesCount} stor.</td>
                          <td>{currency.format(row.totalEarned)}</td>
                          <td className="value-green">{currency.format(row.totalPaid)}</td>
                          <td className="value-amber">{currency.format(row.totalUnpaid)}</td>
                          <td>
                            <button className="action-btn" onClick={(event) => { event.stopPropagation(); markPaid(row.employeeId); }}>
                              {row.totalUnpaid > 0 ? 'Označi plačano' : 'Plačano ✓'}
                            </button>
                          </td>
                        </tr>
                        {expandedEmployee[row.employeeId] && (
                          <tr>
                            <td colSpan={8} className="inner-cell">
                              <table className="inner-table">
                                <thead><tr><th>Projekt</th><th>Stranka</th><th>Datum</th><th>Storitve</th><th>Zaslužek</th><th>Status</th></tr></thead>
                                <tbody>
                                  {row.breakdown.map((item, index) => (
                                    <tr key={`${row.employeeId}-${index}`}>
                                      <td className="strong">{item.projectId}</td>
                                      <td>{item.customer}</td>
                                      <td>{new Date(item.date).toLocaleDateString('sl-SI')}</td>
                                      <td>{item.servicesLabel}</td>
                                      <td>{currency.format(item.earnings)}</td>
                                      <td><span className={`tag ${statusClass(item.isPaid)}`}>{item.isPaid ? 'Plačano' : 'Čaka'}</span></td>
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
          <section className="kpi-grid">
            <article className="kpi-card"><span>Skupaj zasluženo</span><strong>{currency.format(employeeKpi.totalEarned)}</strong></article>
            <article className="kpi-card"><span>Plačano</span><strong className="value-green">{currency.format(employeeKpi.totalPaid)}</strong></article>
            <article className="kpi-card"><span>Čaka na plačilo</span><strong className="value-amber">{currency.format(employeeKpi.totalUnpaid)}</strong></article>
          </section>

          <section className="execution-list">
            {employeeRows.flatMap((row) => row.breakdown).map((item, index) => (
              <article key={`${item.projectId}-${index}`} className="execution-card">
                <div>
                  <h3>{item.projectId}</h3>
                  <p>{item.customer} · {new Date(item.date).toLocaleDateString('sl-SI')} · {item.servicesLabel}</p>
                </div>
                <div className="execution-right">
                  <strong>{currency.format(item.earnings)}</strong>
                  <span className={`tag ${statusClass(item.isPaid)}`}>{item.isPaid ? 'Plačano' : 'Čaka'}</span>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {tab === 'podjetje' && !isExecutionOnly && (
        <>
          <section className="period-header">
            <span>Pregled poslovanja</span>
            <div className="period-selector">
              <button className={periodMode === 'week' ? 'is-active' : ''} onClick={() => setPeriodMode('week')}>Teden</button>
              <button className={periodMode === 'month' ? 'is-active' : ''} onClick={() => setPeriodMode('month')}>Mesec</button>
              <button className={periodMode === 'quarter' ? 'is-active' : ''} onClick={() => setPeriodMode('quarter')}>Četrtina</button>
              <button className={periodMode === 'year' ? 'is-active' : ''} onClick={() => setPeriodMode('year')}>Leto</button>
            </div>
          </section>

          <section className="period-cards">
            {periodCards.map((card) => (
              <article key={card.key} className={`period-card ${card.key === 'current' ? 'is-current' : ''}`}>
                <header>
                  <span>{card.label}</span>
                  <strong>{card.name}</strong>
                </header>
                <div className="period-main">{currency.format(card.revenue)}</div>
                <ul>
                  <li><span>Nabava</span><strong>{currency.format(card.purchase)}</strong></li>
                  <li><span>Marža</span><strong>{currency.format(card.margin)}</strong></li>
                  <li><span>Marža %</span><strong>{card.marginPercent.toFixed(0)}%</strong></li>
                  <li><span>Projekti</span><strong>{card.projects}</strong></li>
                  {card.key === 'current' && <li><span>Odprte ponudbe</span><strong>{currency.format(card.openOffers ?? 0)}</strong></li>}
                  {card.key === 'next' && card.pipelineDetails && (
                    <>
                      <li><span>Sprejete ponudbe</span><strong>{card.pipelineDetails.accepted}</strong></li>
                      <li><span>V pripravi</span><strong>{card.pipelineDetails.draft}</strong></li>
                      <li><span>Poslane</span><strong>{card.pipelineDetails.offered}</strong></li>
                      <li><span>Pričakovani prihodki</span><strong>{currency.format(card.pipelineDetails.expectedRevenue)}</strong></li>
                    </>
                  )}
                </ul>
                <div className="mini-bars">
                  <div><span>P</span><i style={{ width: '70%', background: '#2463D3' }} /><b>{currency.format(card.revenue)}</b></div>
                  <div><span>N</span><i style={{ width: '45%', background: '#D94747' }} /><b>{currency.format(card.purchase)}</b></div>
                  <div><span>M</span><i style={{ width: '60%', background: '#4E8B0D' }} /><b>{currency.format(card.margin)}</b></div>
                </div>
              </article>
            ))}
          </section>

          <section className="company-bottom-grid">
            <article className="finance-block">
              <h3>Top 10 produktov</h3>
              <div className="table-wrap">
                <table className="finance-table">
                  <thead><tr><th>Naziv</th><th>Količina</th><th>Prihodek</th><th>Marža %</th></tr></thead>
                  <tbody>
                    {topProducts.map((product) => (
                      <tr key={`${product.productId ?? 'custom'}-${product.name}`}>
                        <td>{product.name}</td>
                        <td>{product.totalQuantity}</td>
                        <td>{currency.format(product.totalRevenue)}</td>
                        <td><span className={`tag ${marginBadgeClass(product.marginPercent)}`}>{product.marginPercent.toFixed(0)}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="finance-block">
              <h3>Pipeline funnel</h3>
              <div className="funnel-cards">
                <div className="funnel-card"><span>Osnutki</span><strong>{pipelineMap.get('draft')?.count ?? 0}</strong><small>{currency.format(pipelineMap.get('draft')?.totalGross ?? 0)}</small></div>
                <div className="funnel-card"><span>Poslane</span><strong>{pipelineMap.get('offered')?.count ?? 0}</strong><small>{currency.format(pipelineMap.get('offered')?.totalGross ?? 0)}</small></div>
                <div className="funnel-card is-green"><span>Sprejeto</span><strong>{pipelineMap.get('accepted')?.count ?? 0}</strong><small>{currency.format(pipelineMap.get('accepted')?.totalGross ?? 0)}</small></div>
                <div className="funnel-card is-red"><span>Zavrnjeno</span><strong>{pipelineMap.get('rejected')?.count ?? 0}</strong><small>{currency.format(pipelineMap.get('rejected')?.totalGross ?? 0)}</small></div>
              </div>
              <div className="win-rate-box">Win rate: {(pipeline?.winRate ?? 0).toFixed(0)}%</div>
              <p>Open offers: {currency.format((pipelineMap.get('draft')?.totalGross ?? 0) + (pipelineMap.get('offered')?.totalGross ?? 0))}</p>
            </article>
          </section>
        </>
      )}
    </div>
  );
};
