import React, { useEffect, useMemo, useState } from 'react';
import './FinancePage.css';

type Role = 'ADMIN' | 'FINANCE' | 'EXECUTION' | 'SALES' | 'ORGANIZER';
type TabKey = 'projekti' | 'zaposleni' | 'podjetje';

interface MePayload {
  employeeId?: string | null;
  roles?: string[];
}

interface SnapshotListEnvelope {
  total: number;
  page: number;
  limit: number;
  items: FinanceSnapshot[];
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
    totalMargin: number;
  };
  items: Array<{
    productId: string | null;
    name: string;
    quantity: number;
    isService?: boolean;
  }>;
  employeeEarnings: Array<{
    employeeId: string;
    earnings: number;
    isPaid: boolean;
  }>;
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
  totalRevenue: number;
}

interface PipelineSummary {
  statuses: Array<{ status: string; count: number; totalGross: number }>;
  winRate: number;
  averageDaysToDecision: number;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
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

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api/finance${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? `Napaka (${response.status})`);
  }
  return payload.data;
}

export const FinancePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('projekti');
  const [snapshots, setSnapshots] = useState<FinanceSnapshot[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [products, setProducts] = useState<ProductFrequency[]>([]);
  const [pipeline, setPipeline] = useState<PipelineSummary | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paidOverrides, setPaidOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const meResponse = await fetch('/api/auth/me', { credentials: 'include' });
        const mePayload = (await meResponse.json()) as ApiEnvelope<MePayload>;
        if (!meResponse.ok || !mePayload.success) {
          throw new Error(mePayload.error ?? 'Ni podatkov o uporabniku.');
        }

        const resolvedRoles = (mePayload.data.roles ?? []) as Role[];
        const isExecutionOnlyRole =
          resolvedRoles.includes('EXECUTION') && !resolvedRoles.includes('FINANCE') && !resolvedRoles.includes('ADMIN');
        const canSeeCompany = resolvedRoles.includes('ADMIN') || resolvedRoles.includes('FINANCE');

        const [snapshotsData, employeeSummary, monthlySummary, productSummary, pipelineData] = await Promise.all([
          apiGet<SnapshotListEnvelope>('/snapshots?limit=200'),
          apiGet<EmployeeSummary[]>('/employees-summary'),
          canSeeCompany ? apiGet<MonthlySummary[]>(`/monthly-summary?year=${new Date().getFullYear()}`) : Promise.resolve([]),
          canSeeCompany ? apiGet<ProductFrequency[]>('/product-frequency?limit=10') : Promise.resolve([]),
          canSeeCompany ? apiGet<PipelineSummary>('/pipeline') : Promise.resolve(null),
        ]);

        if (!mounted) return;

        setRoles(resolvedRoles);
        setEmployeeId(mePayload.data.employeeId ?? null);
        setSnapshots(snapshotsData.items ?? []);
        setEmployees(employeeSummary);
        setMonthly(monthlySummary);
        setProducts(productSummary);
        setPipeline(pipelineData);
        setActiveTab(isExecutionOnlyRole ? 'zaposleni' : 'projekti');
      } catch (fetchError) {
        if (!mounted) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Napaka pri nalaganju podatkov.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const isExecutionOnly = useMemo(
    () => roles.includes('EXECUTION') && !roles.includes('FINANCE') && !roles.includes('ADMIN'),
    [roles]
  );
  const canManagePayments = useMemo(() => roles.includes('FINANCE') || roles.includes('ADMIN'), [roles]);

  const visibleEmployees = useMemo(() => {
    if (!isExecutionOnly || !employeeId) {
      return employees;
    }
    return employees.filter((row) => row.employeeId === employeeId);
  }, [employees, employeeId, isExecutionOnly]);

  const executionProjectRows = useMemo<ExecutionProjectEarningRow[]>(() => {
    if (!isExecutionOnly || !employeeId) return [];

    return snapshots
      .map((snapshot) => {
        const earning = snapshot.employeeEarnings.find((row) => row.employeeId === employeeId);
        if (!earning) return null;

        const servicesDone = (snapshot.items ?? [])
          .filter((item) => item.isService)
          .map((item) => `${item.name} (${item.quantity})`)
          .join(', ');

        return {
          snapshotId: snapshot._id,
          projectId: snapshot.projectId,
          issuedAt: snapshot.issuedAt,
          servicesDone: servicesDone || '-',
          earnedAmount: earning.earnings ?? 0,
          isPaid: Boolean(earning.isPaid),
        } satisfies ExecutionProjectEarningRow;
      })
      .filter((row): row is ExecutionProjectEarningRow => row !== null)
      .sort((a, b) => new Date(b.issuedAt).valueOf() - new Date(a.issuedAt).valueOf());
  }, [employeeId, isExecutionOnly, snapshots]);

  const executionTotals = useMemo(() => {
    return executionProjectRows.reduce(
      (acc, row) => {
        acc.totalEarned += row.earnedAmount;
        if (row.isPaid) {
          acc.totalPaid += row.earnedAmount;
        } else {
          acc.totalUnpaid += row.earnedAmount;
        }
        return acc;
      },
      { totalEarned: 0, totalPaid: 0, totalUnpaid: 0 }
    );
  }, [executionProjectRows]);

  const togglePaid = (id: string) => {
    if (!canManagePayments) return;
    setPaidOverrides((current) => ({ ...current, [id]: !current[id] }));
  };

  if (loading) {
    return <div className="finance-page">Nalagam finance podatke ...</div>;
  }

  if (error) {
    return (
      <div className="finance-page">
        <div className="finance-page__error">Napaka: {error}</div>
      </div>
    );
  }

  return (
    <div className="finance-page">
      <header className="finance-page__header">
        <h1 className="finance-page__title">Finance</h1>
        <div className="finance-page__filters">
          {!isExecutionOnly && (
            <button className="finance-page__select" onClick={() => setActiveTab('projekti')}>
              Projekti
            </button>
          )}
          <button className="finance-page__select" onClick={() => setActiveTab('zaposleni')}>
            Zaposleni
          </button>
          {!isExecutionOnly && (
            <button className="finance-page__select" onClick={() => setActiveTab('podjetje')}>
              Podjetje
            </button>
          )}
        </div>
      </header>

      {activeTab === 'projekti' && !isExecutionOnly && (
        <section className="finance-table">
          <h2 className="chart-card__title">Projekti</h2>
          <table>
            <thead>
              <tr>
                <th>Račun</th>
                <th>Projekt</th>
                <th>Stranka</th>
                <th>Datum</th>
                <th>Prodaja</th>
                <th>Marža</th>
                <th>Marža %</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((row) => {
                const marginPercent =
                  row.summary.totalSaleWithoutVat > 0
                    ? (row.summary.totalMargin / row.summary.totalSaleWithoutVat) * 100
                    : 0;
                return (
                  <tr key={row._id}>
                    <td>{row.invoiceNumber}</td>
                    <td>{row.projectId}</td>
                    <td>{row.customer?.name ?? '-'}</td>
                    <td>{new Date(row.issuedAt).toLocaleDateString('sl-SI')}</td>
                    <td>{currency.format(row.summary.totalSaleWithVat)}</td>
                    <td>{currency.format(row.summary.totalMargin)}</td>
                    <td>{marginPercent.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === 'zaposleni' && (
        <section className="finance-table">
          {isExecutionOnly ? (
            <>
              <h2 className="chart-card__title">Moji zaslužki po projektih</h2>
              <div className="finance-page__cards finance-page__cards--compact">
                <article className="finance-card">
                  <span className="finance-card__label">Skupaj zasluženo</span>
                  <strong className="finance-card__value">{currency.format(executionTotals.totalEarned)}</strong>
                </article>
                <article className="finance-card">
                  <span className="finance-card__label">Plačano</span>
                  <strong className="finance-card__value">{currency.format(executionTotals.totalPaid)}</strong>
                </article>
                <article className="finance-card">
                  <span className="finance-card__label">Neplačano</span>
                  <strong className="finance-card__value">{currency.format(executionTotals.totalUnpaid)}</strong>
                </article>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Projekt</th>
                    <th>Datum</th>
                    <th>Opravljene storitve</th>
                    <th>Zaslužek</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {executionProjectRows.map((row) => (
                    <tr key={row.snapshotId}>
                      <td>{row.projectId}</td>
                      <td>{new Date(row.issuedAt).toLocaleDateString('sl-SI')}</td>
                      <td>{row.servicesDone}</td>
                      <td>{currency.format(row.earnedAmount)}</td>
                      <td>{row.isPaid ? 'Plačano' : 'Neplačano'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <h2 className="chart-card__title">Zaslužki zaposlenih</h2>
              <table>
                <thead>
                  <tr>
                    <th>Zaposleni</th>
                    <th>Skupaj</th>
                    <th>Plačano</th>
                    <th>Neplačano</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEmployees.map((row) => {
                    const toggled = paidOverrides[row.employeeId] ?? false;
                    const paidValue = toggled ? row.totalEarned : row.totalPaid;
                    const unpaidValue = row.totalEarned - paidValue;
                    return (
                      <tr key={row.employeeId}>
                        <td>{row.employeeName}</td>
                        <td>{currency.format(row.totalEarned)}</td>
                        <td>{currency.format(paidValue)}</td>
                        <td>{currency.format(unpaidValue)}</td>
                        <td>
                          <button
                            className="finance-page__select"
                            disabled={!canManagePayments}
                            onClick={() => togglePaid(row.employeeId)}
                          >
                            {toggled ? 'Označeno kot plačano' : 'Neplačano'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {activeTab === 'podjetje' && !isExecutionOnly && (
        <section className="finance-page__grid">
          <div className="chart-card">
            <h2 className="chart-card__title">Top produkti</h2>
            {products.map((item) => (
              <div key={`${item.productId}-${item.name}`} className="chart-bar">
                <span>{item.name}</span>
                <span>{currency.format(item.totalRevenue)}</span>
              </div>
            ))}
          </div>
          <div className="chart-card">
            <h2 className="chart-card__title">Mesečni prihodki</h2>
            {monthly.map((item) => (
              <div key={item.month} className="chart-bar">
                <span>Mesec {item.month}</span>
                <span>{currency.format(item.totalSaleWithVat)}</span>
              </div>
            ))}
          </div>
          <div className="chart-card">
            <h2 className="chart-card__title">Pipeline</h2>
            {pipeline?.statuses.map((status) => (
              <div key={status.status} className="chart-bar">
                <span>{status.status}</span>
                <span>
                  {status.count} / {currency.format(status.totalGross)}
                </span>
              </div>
            ))}
            <p>Win rate: {pipeline?.winRate.toFixed(2)}%</p>
            <p>Povp. dni do odločitve: {pipeline?.averageDaysToDecision.toFixed(2)}</p>
          </div>
        </section>
      )}
    </div>
  );
};
