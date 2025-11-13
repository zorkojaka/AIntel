import React, { useEffect, useMemo, useState } from 'react';
import './FinancePage.css';

export type RevenueCategory = 'storitev' | 'oprema' | 'vzdrževanje' | 'drugo';
export type InvoiceStatus = 'plačano' | 'čaka na plačilo' | 'preklicano';

export interface FinanceLineItem {
  naziv: string;
  kolicina: number;
  cena_nabavna: number;
  cena_prodajna: number;
}

export interface FinanceEntry {
  id: string;
  id_projekta: string;
  id_racuna: string;
  datum_izdaje: string;
  znesek_skupaj: number;
  ddv: number;
  znesek_brez_ddv: number;
  nabavna_vrednost: number;
  dobicek: number;
  stranka: string;
  artikli: FinanceLineItem[];
  kategorija_prihodka: RevenueCategory;
  oznaka: InvoiceStatus;
}

const mockFinanceEntries: FinanceEntry[] = [
  {
    id: 'FIN-2024-001',
    id_projekta: 'PRJ-001',
    id_racuna: 'INV-2024-001',
    datum_izdaje: '2024-12-18',
    znesek_skupaj: 18450,
    ddv: 3690,
    znesek_brez_ddv: 14760,
    nabavna_vrednost: 9800,
    dobicek: 4960,
    stranka: 'Kovinarstvo Novak d.o.o.',
    artikli: [
      { naziv: 'Montaža prezračevalnega sistema', kolicina: 1, cena_nabavna: 4200, cena_prodajna: 7800 },
      { naziv: 'Prezračevalna enota VENTO', kolicina: 2, cena_nabavna: 2800, cena_prodajna: 6960 },
    ],
    kategorija_prihodka: 'oprema',
    oznaka: 'plačano',
  },
  {
    id: 'FIN-2025-002',
    id_projekta: 'PRJ-004',
    id_racuna: 'INV-2025-014',
    datum_izdaje: '2025-02-10',
    znesek_skupaj: 12600,
    ddv: 2520,
    znesek_brez_ddv: 10080,
    nabavna_vrednost: 6120,
    dobicek: 3960,
    stranka: 'Hotel Panorama',
    artikli: [
      { naziv: 'Vzdrževalni servis HVAC', kolicina: 3, cena_nabavna: 480, cena_prodajna: 1020 },
      { naziv: 'Rezervni filtri', kolicina: 15, cena_nabavna: 70, cena_prodajna: 120 },
    ],
    kategorija_prihodka: 'vzdrževanje',
    oznaka: 'plačano',
  },
  {
    id: 'FIN-2025-006',
    id_projekta: 'PRJ-002',
    id_racuna: 'INV-2025-030',
    datum_izdaje: '2025-05-28',
    znesek_skupaj: 21500,
    ddv: 4300,
    znesek_brez_ddv: 17200,
    nabavna_vrednost: 12350,
    dobicek: 4850,
    stranka: 'Mesto Ljubljana',
    artikli: [
      { naziv: 'Inženiring – faza II', kolicina: 1, cena_nabavna: 6400, cena_prodajna: 9800 },
      { naziv: 'Strojna oprema HVAC', kolicina: 1, cena_nabavna: 5950, cena_prodajna: 11700 },
    ],
    kategorija_prihodka: 'storitev',
    oznaka: 'čaka na plačilo',
  },
  {
    id: 'FIN-2025-009',
    id_projekta: 'PRJ-006',
    id_racuna: 'INV-2025-041',
    datum_izdaje: '2025-07-03',
    znesek_skupaj: 8600,
    ddv: 1720,
    znesek_brez_ddv: 6880,
    nabavna_vrednost: 4720,
    dobicek: 2160,
    stranka: 'Ekosistem Plus',
    artikli: [
      { naziv: 'Termografski pregled', kolicina: 2, cena_nabavna: 480, cena_prodajna: 860 },
      { naziv: 'Programska licenca Monitoring', kolicina: 1, cena_nabavna: 3800, cena_prodajna: 5160 },
    ],
    kategorija_prihodka: 'drugo',
    oznaka: 'plačano',
  },
  {
    id: 'FIN-2025-011',
    id_projekta: 'PRJ-002',
    id_racuna: 'INV-2025-052',
    datum_izdaje: '2025-08-19',
    znesek_skupaj: 14300,
    ddv: 2860,
    znesek_brez_ddv: 11440,
    nabavna_vrednost: 8240,
    dobicek: 3200,
    stranka: 'Mesto Ljubljana',
    artikli: [
      { naziv: 'Integracija IoT senzorjev', kolicina: 12, cena_nabavna: 320, cena_prodajna: 640 },
      { naziv: 'Konfiguracija SCADA', kolicina: 1, cena_nabavna: 1400, cena_prodajna: 3400 },
    ],
    kategorija_prihodka: 'storitev',
    oznaka: 'čaka na plačilo',
  },
];

const statusFilterOptions: Array<{ value: 'vsi' | InvoiceStatus; label: string }> = [
  { value: 'vsi', label: 'Vsi statusi' },
  { value: 'plačano', label: 'Plačano' },
  { value: 'čaka na plačilo', label: 'Čaka na plačilo' },
  { value: 'preklicano', label: 'Preklicano' },
];

const currencyFormatter = new Intl.NumberFormat('sl-SI', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const monthFormatter = new Intl.DateTimeFormat('sl-SI', {
  month: 'short',
});

function toMonthLabel(isoDate: string) {
  const date = new Date(`${isoDate}-01`);
  return `${monthFormatter.format(date)} ${date.getFullYear()}`;
}

function useFinanceEntries() {
  const [entries, setEntries] = useState<FinanceEntry[]>(mockFinanceEntries);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchEntries() {
      try {
        const response = await fetch('http://localhost:3000/finance');
        if (!response.ok) {
          throw new Error(`Napaka API: ${response.status}`);
        }
        const payload = await response.json();
        if (payload?.success && Array.isArray(payload.data) && isMounted) {
          setEntries(payload.data as FinanceEntry[]);
          setError(null);
        } else if (isMounted) {
          setError('Nepričakovan odgovor API. Prikazujemo demo podatke.');
        }
      } catch (err) {
        if (isMounted) {
          const reason = err instanceof Error ? err.message : 'Neznana napaka';
          setError(`API ni dosegljiv (${reason}). Prikazujemo demo podatke.`);
        }
      }
    }

    fetchEntries();
    return () => {
      isMounted = false;
    };
  }, []);

  return { entries, error };
}

function filterInvoices(entries: FinanceEntry[], term: string, status: 'vsi' | InvoiceStatus) {
  const normalizedTerm = term.trim().toLowerCase();
  return entries.filter((entry) => {
    const matchesTerm =
      normalizedTerm.length === 0 ||
      entry.stranka.toLowerCase().includes(normalizedTerm) ||
      entry.id_racuna.toLowerCase().includes(normalizedTerm) ||
      entry.id_projekta.toLowerCase().includes(normalizedTerm);

    const matchesStatus = status === 'vsi' || entry.oznaka === status;

    return matchesTerm && matchesStatus;
  });
}

function calculateSummary(entries: FinanceEntry[]) {
  return entries.reduce(
    (acc, entry) => {
      acc.projects.add(entry.id_projekta);
      acc.revenue += entry.znesek_skupaj;
      acc.cost += entry.nabavna_vrednost;
      acc.profit += entry.dobicek;
      return acc;
    },
    { projects: new Set<string>(), revenue: 0, cost: 0, profit: 0 }
  );
}

function buildMonthlySeries(entries: FinanceEntry[]) {
  const bucket = new Map<string, { prihodki: number; stroski: number; dobicek: number }>();
  entries.forEach((entry) => {
    const key = entry.datum_izdaje.slice(0, 7);
    if (!bucket.has(key)) {
      bucket.set(key, { prihodki: 0, stroski: 0, dobicek: 0 });
    }
    const month = bucket.get(key)!;
    month.prihodki += entry.znesek_skupaj;
    month.stroski += entry.nabavna_vrednost;
    month.dobicek += entry.dobicek;
  });

  return Array.from(bucket.entries())
    .map(([month, values]) => ({ month, ...values }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function buildProjectProfit(entries: FinanceEntry[]) {
  const bucket = new Map<string, number>();
  entries.forEach((entry) => {
    bucket.set(entry.id_projekta, (bucket.get(entry.id_projekta) ?? 0) + entry.dobicek);
  });
  return Array.from(bucket.entries())
    .map(([projectId, value]) => ({ projectId, value }))
    .sort((a, b) => b.value - a.value);
}

interface ChartRow {
  id: string;
  label: string;
  value: number;
  variant: 'income' | 'cost' | 'profit';
}

const MIN_BAR_WIDTH = 6;

function ChartBar({ label, value, max, variant }: ChartRow & { max: number }) {
  const width = max === 0 ? 0 : Math.max(MIN_BAR_WIDTH, Math.round((value / max) * 100));
  return (
    <div className="chart-bar">
      <span>{label}</span>
      <div className="chart-bar__track">
        <div className="chart-bar__fill" data-variant={variant === 'cost' ? 'cost' : variant === 'profit' ? 'profit' : undefined} style={{ width: `${width}%` }} />
      </div>
      <span>{currencyFormatter.format(value)}</span>
    </div>
  );
}

function StatusPill({ status }: { status: InvoiceStatus }) {
  return <span className="status-pill" data-status={status}>{status}</span>;
}

export const FinancePage: React.FC = () => {
  const { entries, error } = useFinanceEntries();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'vsi' | InvoiceStatus>('vsi');

  const filteredInvoices = useMemo(
    () => filterInvoices(entries, searchTerm, statusFilter),
    [entries, searchTerm, statusFilter]
  );

  const summary = useMemo(() => calculateSummary(filteredInvoices), [filteredInvoices]);

  const monthlySeries = useMemo(() => buildMonthlySeries(filteredInvoices), [filteredInvoices]);
  const monthlyChartRows: ChartRow[] = useMemo(
    () =>
      monthlySeries.flatMap<ChartRow>((item) => {
        const label = toMonthLabel(item.month);
        return [
          { id: `${item.month}-income`, label: `${label} • Prihodki`, value: item.prihodki, variant: 'income' },
          { id: `${item.month}-cost`, label: `${label} • Stroški`, value: item.stroski, variant: 'cost' },
          { id: `${item.month}-profit`, label: `${label} • Dobiček`, value: item.dobicek, variant: 'profit' },
        ];
      }),
    [monthlySeries]
  );
  const monthlyMax = useMemo(
    () => monthlyChartRows.reduce((max, row) => Math.max(max, row.value), 0),
    [monthlyChartRows]
  );

  const projectProfit = useMemo(() => buildProjectProfit(filteredInvoices), [filteredInvoices]);
  const projectMax = useMemo(
    () => projectProfit.reduce((max, item) => Math.max(max, item.value), 0),
    [projectProfit]
  );

  return (
    <div className="finance-page">
      <header className="finance-page__header">
        <h1 className="finance-page__title">Finance</h1>
        <p className="finance-page__subtitle">
          Pregled izdaje računov, stroškov in dobičkov po projektih in strankah.
        </p>
        {error && <div className="finance-page__error">{error}</div>}
        <div className="finance-page__filters">
          <input
            className="finance-page__input"
            type="search"
            placeholder="Išči po stranki, projektu ali računu..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <select
            className="finance-page__select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'vsi' | InvoiceStatus)}
          >
            {statusFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="finance-page__cards">
        <article className="finance-card">
          <span className="finance-card__label">Aktivni projekti</span>
          <span className="finance-card__value">{summary.projects.size}</span>
          <span className="finance-card__delta">+4 letos</span>
        </article>
        <article className="finance-card">
          <span className="finance-card__label">Prihodki</span>
          <span className="finance-card__value">{currencyFormatter.format(summary.revenue)}</span>
          <span className="finance-card__delta">+12% v primerjavi s 2024</span>
        </article>
        <article className="finance-card">
          <span className="finance-card__label">Stroški</span>
          <span className="finance-card__value">{currencyFormatter.format(summary.cost)}</span>
          <span className="finance-card__delta" style={{ color: '#f97316' }}>-5% optimizacija nabave</span>
        </article>
        <article className="finance-card">
          <span className="finance-card__label">Dobiček</span>
          <span className="finance-card__value">{currencyFormatter.format(summary.profit)}</span>
          <span className="finance-card__delta">+2,4% marža</span>
        </article>
      </section>

      <section className="finance-page__grid">
        <div className="finance-table">
          <h2 className="chart-card__title">Izdani računi</h2>
          {filteredInvoices.length === 0 ? (
            <div className="finance-table__empty">Ni računov za izbrane filtre.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Račun</th>
                  <th>Projekt</th>
                  <th>Stranka</th>
                  <th>Datum</th>
                  <th>Znesek</th>
                  <th>Dobiček</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.id_racuna}</td>
                    <td>{entry.id_projekta}</td>
                    <td>{entry.stranka}</td>
                    <td>{new Date(entry.datum_izdaje).toLocaleDateString('sl-SI')}</td>
                    <td>{currencyFormatter.format(entry.znesek_skupaj)}</td>
                    <td>{currencyFormatter.format(entry.dobicek)}</td>
                    <td>
                      <StatusPill status={entry.oznaka} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="chart-card">
          <h2 className="chart-card__title">Prihodki in stroški po mesecih</h2>
          <div className="chart-card__bars">
            {monthlyChartRows.map((row) => (
              <ChartBar key={row.id} {...row} max={monthlyMax} />
            ))}
          </div>
          <div className="chart-card__legend">
            <span>
              <i className="legend-income" /> Prihodki
            </span>
            <span>
              <i className="legend-cost" /> Stroški
            </span>
            <span>
              <i className="legend-profit" /> Dobiček
            </span>
          </div>
        </div>
      </section>

      <section className="chart-card">
        <h2 className="chart-card__title">Dobiček po projektih</h2>
        <div className="chart-card__bars">
          {projectProfit.length === 0 ? (
            <div className="finance-table__empty">Ni finančnih podatkov za izbrane filtre.</div>
          ) : (
            projectProfit.map((item) => (
              <ChartBar
                key={item.projectId}
                id={item.projectId}
                label={item.projectId}
                value={item.value}
                variant="profit"
                max={projectMax}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
};
