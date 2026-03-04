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

export interface FinanceYearlySummaryMonth {
  month: string;
  prihodki: number;
  stroski: number;
  dobicek: number;
  kategorije: Record<RevenueCategory, number>;
}

export interface FinanceYearlySummary {
  year: number;
  months: FinanceYearlySummaryMonth[];
}

export const financeEntries: FinanceEntry[] = [
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
      {
        naziv: 'Montaža prezračevalnega sistema',
        kolicina: 1,
        cena_nabavna: 4200,
        cena_prodajna: 7800,
      },
      {
        naziv: 'Prezračevalna enota VENTO',
        kolicina: 2,
        cena_nabavna: 2800,
        cena_prodajna: 6960,
      },
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
      {
        naziv: 'Vzdrževalni servis HVAC',
        kolicina: 3,
        cena_nabavna: 480,
        cena_prodajna: 1020,
      },
      {
        naziv: 'Rezervni filtri',
        kolicina: 15,
        cena_nabavna: 70,
        cena_prodajna: 120,
      },
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
      {
        naziv: 'Inženiring – faza II',
        kolicina: 1,
        cena_nabavna: 6400,
        cena_prodajna: 9800,
      },
      {
        naziv: 'Strojna oprema HVAC',
        kolicina: 1,
        cena_nabavna: 5950,
        cena_prodajna: 11700,
      },
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
      {
        naziv: 'Termografski pregled',
        kolicina: 2,
        cena_nabavna: 480,
        cena_prodajna: 860,
      },
      {
        naziv: 'Programska licenca Monitoring',
        kolicina: 1,
        cena_nabavna: 3800,
        cena_prodajna: 5160,
      },
    ],
    kategorija_prihodka: 'drugo',
    oznaka: 'plačano',
  },
];

export function nextFinanceId(): string {
  const sequence = financeEntries.length + 1;
  return `FIN-${new Date().getFullYear()}-${sequence.toString().padStart(3, '0')}`;
}
