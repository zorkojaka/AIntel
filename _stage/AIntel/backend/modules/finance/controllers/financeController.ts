import { Request, Response } from 'express';
import {
  FinanceEntry,
  FinanceYearlySummary,
  RevenueCategory,
  financeEntries,
  nextFinanceId,
} from '../schemas/financeEntry';

interface AddFromInvoicePayload {
  id_projekta: string;
  id_racuna: string;
  datum_izdaje: string;
  znesek_skupaj?: number;
  ddv?: number;
  znesek_brez_ddv?: number;
  nabavna_vrednost?: number;
  stranka: string;
  artikli: {
    naziv: string;
    kolicina: number;
    cena_nabavna: number;
    cena_prodajna: number;
  }[];
  kategorija_prihodka: RevenueCategory;
  oznaka: FinanceEntry['oznaka'];
}

function toISODate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function calculateTotals(payload: AddFromInvoicePayload) {
  const lineTotals = payload.artikli.reduce(
    (acc, item) => {
      const revenue = item.cena_prodajna * item.kolicina;
      const cost = item.cena_nabavna * item.kolicina;
      acc.revenue += revenue;
      acc.cost += cost;
      return acc;
    },
    { revenue: 0, cost: 0 }
  );

  const znesek_skupaj = payload.znesek_skupaj ?? lineTotals.revenue;
  const nabavna_vrednost = payload.nabavna_vrednost ?? lineTotals.cost;
  const ddv = payload.ddv ?? Math.round(znesek_skupaj * 0.2);
  const znesek_brez_ddv = payload.znesek_brez_ddv ?? znesek_skupaj - ddv;
  const dobicek = znesek_brez_ddv - nabavna_vrednost;

  return {
    znesek_skupaj,
    nabavna_vrednost,
    ddv,
    znesek_brez_ddv,
    dobicek,
  };
}

export function addFromInvoice(req: Request, res: Response) {
  const payload = req.body as AddFromInvoicePayload;

  if (!payload?.id_projekta || !payload?.id_racuna || !payload?.stranka) {
    return res.fail('Manjkajo ključni podatki računa (id_projekta, id_racuna, stranka).', 400);
  }

  if (!payload.artikli || payload.artikli.length === 0) {
    return res.fail('Račun mora vsebovati vsaj en artikel.', 400);
  }

  const { znesek_skupaj, nabavna_vrednost, ddv, znesek_brez_ddv, dobicek } = calculateTotals(payload);

  const entry: FinanceEntry = {
    id: nextFinanceId(),
    id_projekta: payload.id_projekta,
    id_racuna: payload.id_racuna,
    datum_izdaje: toISODate(payload.datum_izdaje),
    znesek_skupaj,
    ddv,
    znesek_brez_ddv,
    nabavna_vrednost,
    dobicek,
    stranka: payload.stranka,
    artikli: payload.artikli,
    kategorija_prihodka: payload.kategorija_prihodka,
    oznaka: payload.oznaka,
  };

  financeEntries.push(entry);

  return res.success(entry, 201);
}

export function listFinanceEntries(_req: Request, res: Response) {
  return res.success(financeEntries);
}

export function getYearlySummary(req: Request, res: Response) {
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
  const months = new Map<string, FinanceYearlySummary['months'][number]>();

  financeEntries
    .filter((entry) => new Date(entry.datum_izdaje).getFullYear() === year)
    .forEach((entry) => {
      const monthKey = entry.datum_izdaje.slice(0, 7);
      if (!months.has(monthKey)) {
        months.set(monthKey, {
          month: monthKey,
          prihodki: 0,
          stroski: 0,
          dobicek: 0,
          kategorije: {
            storitev: 0,
            oprema: 0,
            vzdrževanje: 0,
            drugo: 0,
          },
        });
      }

      const bucket = months.get(monthKey)!;
      bucket.prihodki += entry.znesek_skupaj;
      bucket.stroski += entry.nabavna_vrednost;
      bucket.dobicek += entry.dobicek;
      bucket.kategorije[entry.kategorija_prihodka] += entry.znesek_skupaj;
    });

  const summary: FinanceYearlySummary = {
    year,
    months: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };

  return res.success(summary);
}

export function getProjectFinance(req: Request, res: Response) {
  const projectId = req.params.id;
  const projectEntries = financeEntries.filter((entry) => entry.id_projekta === projectId);

  if (projectEntries.length === 0) {
    return res.fail(`Za projekt ${projectId} ni finančnih podatkov.`, 404);
  }

  const totals = projectEntries.reduce(
    (acc, entry) => {
      acc.prihodki += entry.znesek_skupaj;
      acc.stroski += entry.nabavna_vrednost;
      acc.dobicek += entry.dobicek;
      return acc;
    },
    { prihodki: 0, stroski: 0, dobicek: 0 }
  );

  return res.success({
    projectId,
    summary: totals,
    invoices: projectEntries,
  });
}

export function getClientFinance(req: Request, res: Response) {
  const clientId = decodeURIComponent(req.params.id);
  const clientEntries = financeEntries.filter((entry) => entry.stranka === clientId);

  if (clientEntries.length === 0) {
    return res.fail(`Za stranko ${clientId} ni finančnih podatkov.`, 404);
  }

  const totals = clientEntries.reduce(
    (acc, entry) => {
      acc.prihodki += entry.znesek_skupaj;
      acc.stroski += entry.nabavna_vrednost;
      acc.dobicek += entry.dobicek;
      return acc;
    },
    { prihodki: 0, stroski: 0, dobicek: 0 }
  );

  return res.success({
    client: clientId,
    summary: totals,
    invoices: clientEntries,
  });
}
