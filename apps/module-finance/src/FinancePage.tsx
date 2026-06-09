import React, { useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './FinancePage.css';

type Role = 'ADMIN' | 'FINANCE' | 'EXECUTION' | 'SALES' | 'ORGANIZER';
type TabKey = 'projekti' | 'zaposleni' | 'podjetje';
type PeriodMode = 'monthly' | 'yearly';

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
  isService?: boolean;
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
interface ProjectListItem { id: string; title: string; customer?: string | { name?: string }; status?: string; offerAmount?: number; quotedTotalWithVat?: number; updatedAt?: string; createdAt?: string }

interface ProductCooccurrenceRow { productA: { id: string; name: string }; productB: { id: string; name: string }; count: number; totalRevenue: number }
interface ProductBundleRow { product: { id: string; name: string }; companions: Array<{ id: string; name: string; count: number; share: number }> }

interface EmployeeProjectBreakdown {
  snapshotId: string;
  projectId: string;
  invoiceNumber: string;
  customerName: string;
  issuedAt: string;
  earnings: number;
  isPaid: boolean;
}

interface EmployeeProjectEarningDetailItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface EmployeeProjectEarningDetail {
  snapshotId: string;
  projectId: string;
  invoiceNumber: string;
  totalEarnings: number;
  itemTotal: number;
  items: EmployeeProjectEarningDetailItem[];
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

async function fetchAllSnapshots(): Promise<FinanceSnapshot[]> {
  const limit = 200;
  const firstPage = await fetchApi<SnapshotListEnvelope>(`/api/finance/snapshots?limit=${limit}&page=1`);
  const items = [...(firstPage.items ?? [])];
  let page = 2;
  while ((items.length % limit) === 0 && items.length > 0) {
    const nextPage = await fetchApi<SnapshotListEnvelope>(`/api/finance/snapshots?limit=${limit}&page=${page}`);
    const nextItems = nextPage.items ?? [];
    if (nextItems.length === 0) break;
    items.push(...nextItems);
    if (nextItems.length < limit) break;
    page += 1;
  }
  return items;
}

function toIsoDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return date.toISOString().slice(0, 10);
}

function toYear(value: string | undefined | null) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.getFullYear() : null;
}

function toMonthKey(value: string | undefined | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthKeyLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('sl-SI', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getProjectDate(project: ProjectListItem) {
  return project.updatedAt ?? project.createdAt ?? null;
}

function getProjectCustomerName(project: ProjectListItem) {
  return typeof project.customer === 'string' ? project.customer : project.customer?.name ?? '-';
}

function statusLabel(isPaid: boolean) {
  return isPaid ? 'Plačano' : 'Čaka na plačilo';
}

function marginClass(marginPercent: number) {
  if (marginPercent > 40) return 'is-high';
  if (marginPercent >= 20) return 'is-medium';
  return 'is-low';
}

function getSnapshotMaterialPurchase(snapshot: FinanceSnapshot) {
  return snapshot.items
    .filter((item) => item.isService !== true)
    .reduce((sum, item) => sum + (Number(item.totalPurchase) || 0), 0);
}

function getSnapshotLaborCost(snapshot: FinanceSnapshot) {
  return snapshot.employeeEarnings.reduce((sum, earning) => sum + (Number(earning.earnings) || 0), 0);
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
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [coView, setCoView] = useState<'pairs' | 'bundles'>('pairs');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('yearly');
  const [selectedYears, setSelectedYears] = useState<number[]>([new Date().getFullYear()]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([toMonthKey(new Date().toISOString()) ?? '']);

  const [projectSearch, setProjectSearch] = useState('');

  const [expandedProjectRows, setExpandedProjectRows] = useState<Record<string, boolean>>({});
  const [expandedEmployeeRows, setExpandedEmployeeRows] = useState<Record<string, boolean>>({});
  const [expandedEmployeeProjectRows, setExpandedEmployeeProjectRows] = useState<Record<string, boolean>>({});
  const [employeeProjectDetails, setEmployeeProjectDetails] = useState<Record<string, EmployeeProjectEarningDetail>>({});
  const [employeeProjectDetailsLoading, setEmployeeProjectDetailsLoading] = useState<Record<string, boolean>>({});
  const [employeeProjectDetailsError, setEmployeeProjectDetailsError] = useState<Record<string, string>>({});
  const [paidByEmployee, setPaidByEmployee] = useState<Record<string, boolean>>({});

  const isExecutionOnly = useMemo(() => {
    const roleSet = new Set(roles);
    return roleSet.has('EXECUTION') && !roleSet.has('ADMIN') && !roleSet.has('FINANCE');
  }, [roles]);
  const isAdminOrFinance = useMemo(() => roles.includes('ADMIN') || roles.includes('FINANCE'), [roles]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const me = await fetchApi<MePayload>('/api/auth/me');
        const mappedRoles = (me.roles ?? []) as Role[];
        const canSeeCompany = mappedRoles.includes('ADMIN') || mappedRoles.includes('FINANCE');

        const [snapshotData, employeeData, projectsData] = await Promise.all([
          fetchAllSnapshots(),
          fetchApi<EmployeeSummary[]>('/api/finance/employees-summary'),
          canSeeCompany ? fetchApi<ProjectListItem[]>('/api/projects?view=all') : Promise.resolve([]),
        ]);

        if (cancelled) return;

        setRoles(mappedRoles);
        setEmployeeId(me.employeeId ?? null);
        setSnapshots(snapshotData);
        setEmployees(employeeData);
        setProjects(projectsData ?? []);
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

  const yearOptions = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear(), ...selectedYears]);
    snapshots.forEach((snapshot) => {
      const year = toYear(snapshot.issuedAt);
      if (year) years.add(year);
    });
    projects.forEach((project) => {
      const year = toYear(getProjectDate(project));
      if (year) years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [projects, selectedYears, snapshots]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>(selectedMonths.filter(Boolean));
    const currentMonth = toMonthKey(new Date().toISOString());
    if (currentMonth) months.add(currentMonth);
    snapshots.forEach((snapshot) => {
      const monthKey = toMonthKey(snapshot.issuedAt);
      if (monthKey) months.add(monthKey);
    });
    projects.forEach((project) => {
      const monthKey = toMonthKey(getProjectDate(project));
      if (monthKey) months.add(monthKey);
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [projects, selectedMonths, snapshots]);

  const matchesSelectedPeriod = (value: string | undefined | null) => {
    if (periodMode === 'monthly') {
      if (selectedMonths.length === 0) return true;
      const monthKey = toMonthKey(value);
      return Boolean(monthKey && selectedMonths.includes(monthKey));
    }
    if (selectedYears.length === 0) return true;
    const year = toYear(value);
    return Boolean(year && selectedYears.includes(year));
  };

  const periodSnapshots = useMemo(
    () => snapshots.filter((snapshot) => matchesSelectedPeriod(snapshot.issuedAt)),
    [periodMode, selectedMonths, selectedYears, snapshots],
  );

  const periodProjects = useMemo(
    () => projects.filter((project) => matchesSelectedPeriod(getProjectDate(project))),
    [periodMode, projects, selectedMonths, selectedYears],
  );

  const periodLabel = useMemo(() => {
    if (periodMode === 'monthly') {
      return selectedMonths.length
        ? selectedMonths.map(formatMonthKeyLabel).join(', ')
        : 'Vsi meseci';
    }
    return selectedYears.length ? selectedYears.join(', ') : 'Vsa leta';
  }, [periodMode, selectedMonths, selectedYears]);

  const toggleSelectedYear = (year: number) => {
    setSelectedYears((current) => {
      const next = current.includes(year) ? current.filter((entry) => entry !== year) : [...current, year];
      return next.sort((a, b) => b - a);
    });
  };

  const toggleSelectedMonth = (monthKey: string) => {
    setSelectedMonths((current) => {
      const next = current.includes(monthKey) ? current.filter((entry) => entry !== monthKey) : [...current, monthKey];
      return next.sort((a, b) => b.localeCompare(a));
    });
  };

  const filteredSnapshots = useMemo(() => {
    const term = projectSearch.trim().toLowerCase();
    return periodSnapshots.filter((snapshot) => {
      if (!term) return true;
      return (
        snapshot.projectId.toLowerCase().includes(term) ||
        snapshot.customer?.name?.toLowerCase().includes(term) ||
        snapshot.invoiceNumber.toLowerCase().includes(term)
      );
    });
  }, [periodSnapshots, projectSearch]);

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

    periodSnapshots.forEach((snapshot) => {
      snapshot.employeeEarnings.forEach((earning) => {
        const resolvedPaid = paidByEmployee[earning.employeeId] ?? earning.isPaid;
        const entry: EmployeeProjectBreakdown = {
          snapshotId: snapshot._id,
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
  }, [paidByEmployee, periodSnapshots]);

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
    return periodSnapshots
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
  }, [employeeId, isExecutionOnly, paidByEmployee, periodSnapshots]);

  const toggleProjectRow = (id: string) => {
    setExpandedProjectRows((current) => ({ ...current, [id]: !current[id] }));
  };

  const toggleEmployeeRow = (id: string) => {
    setExpandedEmployeeRows((current) => ({ ...current, [id]: !current[id] }));
  };

  const detailKey = (employeeIdValue: string, snapshotId: string) => `${employeeIdValue}:${snapshotId}`;

  const toggleEmployeeProjectRow = async (employeeIdValue: string, project: EmployeeProjectBreakdown) => {
    const key = detailKey(employeeIdValue, project.snapshotId);
    const nextExpanded = !expandedEmployeeProjectRows[key];
    setExpandedEmployeeProjectRows((current) => ({ ...current, [key]: nextExpanded }));
    if (!nextExpanded || employeeProjectDetailsLoading[key]) return;

    setEmployeeProjectDetailsLoading((current) => ({ ...current, [key]: true }));
    setEmployeeProjectDetailsError((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      const detail = await fetchApi<EmployeeProjectEarningDetail>(
        `/api/finance/employees/${encodeURIComponent(employeeIdValue)}/snapshots/${encodeURIComponent(project.snapshotId)}/earnings`,
      );
      setEmployeeProjectDetails((current) => ({ ...current, [key]: detail }));
    } catch (detailError) {
      setEmployeeProjectDetailsError((current) => ({
        ...current,
        [key]: detailError instanceof Error ? detailError.message : 'Razčlembe ni mogoče naložiti.',
      }));
    } finally {
      setEmployeeProjectDetailsLoading((current) => ({ ...current, [key]: false }));
    }
  };

  const markEmployeePaid = (id: string) => {
    if (!isAdminOrFinance) return;
    setPaidByEmployee((current) => ({ ...current, [id]: true }));
  };

  const productRows = useMemo<ProductFrequency[]>(() => {
    const byProduct = new Map<string, ProductFrequency>();
    periodSnapshots.forEach((snapshot) => {
      snapshot.items.forEach((item) => {
        const key = item.productId ?? item.name;
        const current = byProduct.get(key) ?? {
          productId: item.productId,
          name: item.name,
          totalQuantity: 0,
          totalRevenue: 0,
          totalMargin: 0,
        };
        current.totalQuantity += Number(item.quantity) || 0;
        current.totalRevenue += Number(item.totalSale) || 0;
        current.totalMargin += Number(item.margin) || 0;
        byProduct.set(key, current);
      });
    });
    return Array.from(byProduct.values()).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10);
  }, [periodSnapshots]);

  const periodChartRows = useMemo(() => {
    const rows = new Map<string, MonthlySummary & { name: string; marginPct: number; projectIds: Set<string> }>();
    periodSnapshots.forEach((snapshot) => {
      const key = periodMode === 'monthly' ? toMonthKey(snapshot.issuedAt) : String(toYear(snapshot.issuedAt) ?? '');
      if (!key) return;
      const current = rows.get(key) ?? {
        month: periodMode === 'monthly' ? Number(key.slice(5, 7)) : 1,
        name: periodMode === 'monthly' ? formatMonthKeyLabel(key) : key,
        totalSaleWithVat: 0,
        totalSaleWithoutVat: 0,
        totalPurchase: 0,
        totalMargin: 0,
        marginPct: 0,
        projectIds: new Set<string>(),
      };
      current.totalSaleWithVat += snapshot.summary.totalSaleWithVat;
      current.totalSaleWithoutVat += snapshot.summary.totalSaleWithoutVat;
      current.totalPurchase += snapshot.summary.totalPurchase;
      current.totalMargin += snapshot.summary.totalMargin;
      current.projectIds.add(snapshot.projectId);
      rows.set(key, current);
    });
    return Array.from(rows.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => ({
        ...row,
        marginPct: row.totalSaleWithoutVat > 0 ? (row.totalMargin / row.totalSaleWithoutVat) * 100 : 0,
        projectCount: row.projectIds.size,
      }));
  }, [periodMode, periodSnapshots]);

  const pairRows = useMemo<ProductCooccurrenceRow[]>(() => {
    const pairMap = new Map<string, ProductCooccurrenceRow>();
    periodSnapshots.forEach((snapshot) => {
      const productsInSnapshot = new Map<string, { id: string; name: string; revenue: number }>();
      snapshot.items.forEach((item) => {
        if (!item.productId) return;
        const id = String(item.productId);
        const current = productsInSnapshot.get(id) ?? { id, name: item.name, revenue: 0 };
        current.revenue += item.totalSale;
        productsInSnapshot.set(id, current);
      });
      const list = Array.from(productsInSnapshot.values()).sort((a, b) => a.id.localeCompare(b.id));
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const productA = list[i];
          const productB = list[j];
          const key = `${productA.id}:${productB.id}`;
          const current = pairMap.get(key) ?? {
            productA: { id: productA.id, name: productA.name },
            productB: { id: productB.id, name: productB.name },
            count: 0,
            totalRevenue: 0,
          };
          current.count += 1;
          current.totalRevenue += productA.revenue + productB.revenue;
          pairMap.set(key, current);
        }
      }
    });
    return Array.from(pairMap.values()).sort((a, b) => b.count - a.count).slice(0, 20);
  }, [periodSnapshots]);

  const bundleRows = useMemo<ProductBundleRow[]>(() => {
    const totalByProduct = new Map<string, number>();
    const bundleMap = new Map<string, ProductBundleRow>();
    pairRows.forEach((pair) => {
      totalByProduct.set(pair.productA.id, (totalByProduct.get(pair.productA.id) ?? 0) + pair.count);
      totalByProduct.set(pair.productB.id, (totalByProduct.get(pair.productB.id) ?? 0) + pair.count);
    });
    pairRows.forEach((pair) => {
      [
        [pair.productA, pair.productB],
        [pair.productB, pair.productA],
      ].forEach(([product, companion]) => {
        const current = bundleMap.get(product.id) ?? { product, companions: [] };
        const total = totalByProduct.get(product.id) || 1;
        current.companions.push({
          id: companion.id,
          name: companion.name,
          count: pair.count,
          share: (pair.count / total) * 100,
        });
        bundleMap.set(product.id, current);
      });
    });
    return Array.from(bundleMap.values())
      .map((row) => ({ ...row, companions: row.companions.sort((a, b) => b.count - a.count).slice(0, 3) }))
      .slice(0, 20);
  }, [pairRows]);

  const pipeline = useMemo<PipelineSummary>(() => {
    const statusMap = new Map<string, { status: string; count: number; totalGross: number }>();
    periodProjects.forEach((project) => {
      const status = String(project.status ?? 'draft');
      const current = statusMap.get(status) ?? { status, count: 0, totalGross: 0 };
      current.count += 1;
      current.totalGross += Number(project.quotedTotalWithVat ?? project.offerAmount ?? 0);
      statusMap.set(status, current);
    });
    const accepted = (statusMap.get('accepted')?.count ?? 0) + (statusMap.get('confirmed')?.count ?? 0);
    const rejected = statusMap.get('rejected')?.count ?? 0;
    return {
      statuses: Array.from(statusMap.values()),
      winRate: accepted + rejected > 0 ? (accepted / (accepted + rejected)) * 100 : 0,
    };
  }, [periodProjects]);

  const monthly = periodChartRows;
  const products = productRows;

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

      <section className="finance-panel finance-period-panel">
        <div className="finance-period-header">
          <div>
            <h2>Obdobje prikaza</h2>
            <p>{periodLabel}</p>
          </div>
          <div className="finance-tabs" role="tablist" aria-label="Način obdobja">
            <button className={periodMode === 'monthly' ? 'is-active' : ''} type="button" onClick={() => setPeriodMode('monthly')}>Mesečni</button>
            <button className={periodMode === 'yearly' ? 'is-active' : ''} type="button" onClick={() => setPeriodMode('yearly')}>Letni</button>
          </div>
        </div>
        <div className="finance-period-options">
          {periodMode === 'monthly'
            ? monthOptions.map((monthKey) => (
                <button
                  key={monthKey}
                  type="button"
                  className={`finance-period-card ${selectedMonths.includes(monthKey) ? 'is-selected' : ''}`}
                  aria-pressed={selectedMonths.includes(monthKey)}
                  onClick={() => toggleSelectedMonth(monthKey)}
                >
                  <span>{formatMonthKeyLabel(monthKey)}</span>
                </button>
              ))
            : yearOptions.map((year) => (
                <button
                  key={year}
                  type="button"
                  className={`finance-period-card ${selectedYears.includes(year) ? 'is-selected' : ''}`}
                  aria-pressed={selectedYears.includes(year)}
                  onClick={() => toggleSelectedYear(year)}
                >
                  <span>{year}</span>
                </button>
              ))}
        </div>
      </section>

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
                      <th>Račun</th><th>Projekt</th><th>Stranka</th><th>Datum</th><th>Prodajna brez DDV</th><th>Material - nabavna cena materiala</th><th>Delo - plačilo monterjem</th><th>Zaslužek</th><th>Marža %</th><th>Status plačila</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSnapshots.map((snapshot) => {
                      const marginPercent = snapshot.summary.totalSaleWithoutVat > 0
                        ? (snapshot.summary.totalMargin / snapshot.summary.totalSaleWithoutVat) * 100
                        : 0;
                      const materialPurchase = getSnapshotMaterialPurchase(snapshot);
                      const laborCost = getSnapshotLaborCost(snapshot);
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
                            <td>{currency.format(materialPurchase)}</td>
                            <td>{currency.format(laborCost)}</td>
                            <td>{currency.format(snapshot.summary.totalMargin)}</td>
                            <td><span className={`margin-badge ${marginClass(marginPercent)}`}>{marginPercent.toFixed(2)}%</span></td>
                            <td><span className={`status-badge ${isPaid ? 'is-paid' : 'is-pending'}`}>{statusLabel(isPaid)}</span></td>
                          </tr>
                          {expandedProjectRows[snapshot._id] && (
                            <tr className="expanded-row">
                              <td colSpan={10}>
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
                                  {row.projects.map((project) => {
                                    const key = detailKey(row.employeeId, project.snapshotId);
                                    const detail = employeeProjectDetails[key];
                                    const isExpanded = !!expandedEmployeeProjectRows[key];
                                    const isLoadingDetail = !!employeeProjectDetailsLoading[key];
                                    const detailError = employeeProjectDetailsError[key];
                                    return (
                                      <React.Fragment key={`${row.employeeId}-${project.snapshotId}`}>
                                        <tr
                                          className="is-clickable"
                                          onClick={() => {
                                            void toggleEmployeeProjectRow(row.employeeId, project);
                                          }}
                                        >
                                          <td>{project.projectId}</td>
                                          <td>{project.invoiceNumber}</td>
                                          <td>{project.customerName}</td>
                                          <td>{new Date(project.issuedAt).toLocaleDateString('sl-SI')}</td>
                                          <td>{currency.format(project.earnings)}</td>
                                          <td><span className={`status-badge ${project.isPaid ? 'is-paid' : 'is-pending'}`}>{statusLabel(project.isPaid)}</span></td>
                                        </tr>
                                        {isExpanded && (
                                          <tr className="expanded-row">
                                            <td colSpan={6}>
                                              {isLoadingDetail ? (
                                                <div className="finance-state">Nalagam razčlembo...</div>
                                              ) : detailError ? (
                                                <div className="finance-state finance-state--error">{detailError}</div>
                                              ) : detail ? (
                                                <div className="employee-project-detail">
                                                  <div className="employee-project-detail__header">
                                                    <strong>Kaj je naredil</strong>
                                                    <span>
                                                      Skupaj: {currency.format(detail.totalEarnings)}
                                                      {Math.abs(detail.itemTotal - detail.totalEarnings) > 0.01
                                                        ? ` · postavke: ${currency.format(detail.itemTotal)}`
                                                        : ''}
                                                    </span>
                                                  </div>
                                                  <div className="finance-row-actions">
                                                    <button type="button" className="finance-btn" onClick={() => { window.location.href = `/projects/${project.projectId}`; }}>
                                                      Odpri projekt
                                                    </button>
                                                  </div>
                                                  {detail.items.length === 0 ? (
                                                    <div className="finance-state">Ni razčlenjenih postavk za ta zaslužek.</div>
                                                  ) : (
                                                    <table className="inner-table">
                                                      <thead>
                                                        <tr><th>Postavka</th><th>Količina</th><th>Enota</th><th>Cena za zaposlenega</th><th>Skupaj</th></tr>
                                                      </thead>
                                                      <tbody>
                                                        {detail.items.map((item) => (
                                                          <tr key={`${key}-${item.name}-${item.unit}-${item.quantity}`}>
                                                            <td>{item.name}</td>
                                                            <td>{item.quantity.toLocaleString('sl-SI')}</td>
                                                            <td>{item.unit}</td>
                                                            <td>{currency.format(item.unitPrice)}</td>
                                                            <td>{currency.format(item.total)}</td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                    </table>
                                                  )}
                                                </div>
                                              ) : null}
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
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
        const yearSnapshots = periodSnapshots;
        const revenueSum = yearSnapshots.reduce((a,b)=>a+b.summary.totalSaleWithoutVat,0);
        const marginSum = yearSnapshots.reduce((a,b)=>a+b.summary.totalMargin,0);
        const invoiceCount = yearSnapshots.length;
        const projectRows = [...(periodProjects ?? [])].sort((a,b)=>new Date(b?.updatedAt ?? b?.createdAt ?? '').valueOf()-new Date(a?.updatedAt ?? a?.createdAt ?? '').valueOf());
        const offerRows = projectRows.filter((p)=>sentCount>=0 && ['offer_sent','offered','confirmed','accepted','rejected'].includes(String(p.status ?? '')));
        const offersValue = offerRows.reduce((a,b)=>a+Number(b.quotedTotalWithVat ?? b.offerAmount ?? 0),0);
        const acceptedOffers = offerRows.filter((p)=>['confirmed','accepted'].includes(String(p.status ?? ''))).length;
        const productRows = [...(products ?? [])].sort((a,b)=>(b?.totalRevenue ?? 0)-(a?.totalRevenue ?? 0)).slice(0,10);
        const monthlyChart = (monthly ?? []).map((m: any)=>({ ...m, marginPct: (m?.totalSaleWithoutVat ?? 0)>0 ? ((m?.totalMargin ?? 0)/(m?.totalSaleWithoutVat ?? 0))*100 : 0, name: m?.name ?? formatMonthLabel(m?.month ?? 1)}));
        return (<section className="space-y-4">
          <div className="finance-section-title"><h2>Pregled podjetja</h2><span>{periodLabel}</span></div>
          <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <article className="finance-card"><span>Skupni prihodki leta</span><strong>{currency.format(revenueSum)}</strong></article>
            <article className="finance-card"><span>Skupna marža %</span><strong>{revenueSum>0?((marginSum/revenueSum)*100).toFixed(2):'0.00'}%</strong></article>
            <article className="finance-card"><span>Število projektov</span><strong>{projectRows.length}</strong></article>
            <article className="finance-card"><span>Število izdanih računov</span><strong>{invoiceCount}</strong></article>
          </section>
          <article className="finance-panel"><h2>Mesečni prihodki</h2>{monthlyChart.length===0?<div className="finance-state">Ni podatkov za izbrano leto.</div>:<div className="h-72"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyChart}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis yAxisId="left"/><YAxis yAxisId="right" orientation="right"/><Tooltip/><Bar yAxisId="left" dataKey="totalSaleWithoutVat" name="Prodajna cena" fill="#2563eb"/><Bar yAxisId="left" dataKey="totalPurchase" name="Nabavna cena" fill="#f97316"/><Line yAxisId="right" type="monotone" dataKey="marginPct" name="Marža %" stroke="#16a34a"/></ComposedChart></ResponsiveContainer></div>}</article>
          <article className="finance-panel"><h2>Top 10 produktov</h2>{productRows?.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Naziv</th><th>Količina</th><th>Prihodek</th><th>Marža</th></tr></thead><tbody>{productRows?.map((p)=><tr key={`${p?.productId ?? 'x'}-${p?.name ?? 'izdelek'}`}><td>{p?.name ?? '-'}</td><td>{p?.totalQuantity ?? 0}</td><td>{currency.format(p?.totalRevenue ?? 0)}</td><td>{currency.format(p?.totalMargin ?? 0)}</td></tr>) ?? []}</tbody></table></div> : <div className="finance-state">Ni produktnih podatkov.</div>}</article>
          <article className="finance-panel"><h2>Pipeline funnel</h2><div className="pipeline-cards"><div className="pipeline-card"><span>Osnutki</span><strong>{draftCount}</strong></div><div className="pipeline-card"><span>Poslane ponudbe</span><strong>{sentCount}</strong></div><div className="pipeline-card"><span>Sprejeto</span><strong>{confirmedCount}</strong></div><div className="pipeline-card"><span>Zavrnjeno</span><strong>{rejectedCount}</strong></div></div><div className="pipeline-highlight">Win rate: {winRate.toFixed(2)}%</div></article>
          <article className="finance-panel"><h2>Pregled projektov</h2>{projectRows?.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Projekt</th><th>Stranka</th><th>Status</th><th>Vrednost ponudbe</th><th>Datum</th></tr></thead><tbody>{projectRows?.map((r)=><tr key={r?.id ?? `${r?.title ?? 'projekt'}-${r?.updatedAt ?? ''}`} className="is-clickable" onClick={()=> r?.id && (window.location.href=`/projects/${r.id}`)}><td>{r?.title ?? '-'}</td><td>{getProjectCustomerName(r)}</td><td>{r?.status ?? '-'}</td><td>{currency.format(Number(r?.quotedTotalWithVat ?? r?.offerAmount ?? 0))}</td><td>{new Date(r?.updatedAt ?? r?.createdAt ?? '').toLocaleDateString('sl-SI')}</td></tr>) ?? []}</tbody></table></div> : <div className="finance-state">Ni projektov za izbrano obdobje.</div>}</article>
          <article className="finance-panel"><h2>Pogosto kupljeni skupaj</h2><div className="flex gap-2 mb-3"><button className={`finance-btn ${coView==='pairs' ? 'is-active' : ''}`} onClick={()=>setCoView('pairs')}>Pari produktov</button><button className={`finance-btn ${coView==='bundles' ? 'is-active' : ''}`} onClick={()=>setCoView('bundles')}>Bundli (3+)</button></div>{coView==='pairs' ? (pairRows?.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Produkt A</th><th>Produkt B</th><th>Skupaj prodano</th><th>Skupna vrednost</th></tr></thead><tbody>{pairRows?.map((r)=> <tr key={`${r?.productA?.id ?? 'a'}-${r?.productB?.id ?? 'b'}`}><td>{r?.productA?.name ?? '-'}</td><td>{r?.productB?.name ?? '-'}</td><td>{r?.count ?? 0}×</td><td>{currency.format(r?.totalRevenue ?? 0)}</td></tr>) ?? []}</tbody></table></div> : <div className="finance-state">Ni parov produktov.</div>) : (bundleRows?.length ? <div className="space-y-3">{bundleRows?.map((row)=><div key={row?.product?.id ?? row?.product?.name ?? 'bundle'}><p>Ko nekdo kupi <strong>{row?.product?.name ?? '-'}</strong>, pogosto kupi tudi:</p><ul>{row?.companions?.map((c)=><li key={`${row?.product?.id ?? 'x'}-${c?.id ?? 'y'}`}>- {c?.name ?? '-'} ({c?.count ?? 0}× / {(c?.share ?? 0).toFixed(0)}%)</li>) ?? []}</ul></div>) ?? []}</div> : <div className="finance-state">Ni bundle podatkov.</div>)}</article>
          <article className="finance-panel"><h2>Izdane ponudbe</h2><div className="pipeline-sub">Skupna vrednost: <strong>{currency.format(offersValue)}</strong> · % sprejetih: <strong>{offerRows.length>0?((acceptedOffers/offerRows.length)*100).toFixed(2):'0.00'}%</strong></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Projekt</th><th>Stranka</th><th>Vrednost</th><th>Status</th><th>Datum</th></tr></thead><tbody>{offerRows.map((r)=><tr key={`offer-${r.id}`}><td>{r.title}</td><td>{getProjectCustomerName(r)}</td><td>{currency.format(Number(r.quotedTotalWithVat ?? r.offerAmount ?? 0))}</td><td>{['confirmed','accepted'].includes(String(r.status))?'sprejeto':String(r.status)==='rejected'?'zavrnjeno':'čakanje'}</td><td>{new Date(r.updatedAt ?? r.createdAt ?? '').toLocaleDateString('sl-SI')}</td></tr>)}</tbody></table></div></article>
        </section>);
      })()}
    </div>
  );
};


export default FinancePage;
