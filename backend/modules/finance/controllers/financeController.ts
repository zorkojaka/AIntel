import { Request, Response } from 'express';
import { FinanceYearlySummary, financeEntries } from '../schemas/financeEntry';

export function addFromInvoice(_req: Request, res: Response) {
  res.setHeader('X-AIntel-Finance-Source', 'legacy-in-memory-non-authoritative');
  return res.fail('Legacy finance entry writes are disabled. Finance uses persistent invoice snapshots.', 410);
}

export function listFinanceEntries(_req: Request, res: Response) {
  res.setHeader('X-AIntel-Finance-Source', 'legacy-in-memory-non-authoritative');
  return res.success(financeEntries);
}

export function getYearlySummary(req: Request, res: Response) {
  res.setHeader('X-AIntel-Finance-Source', 'legacy-in-memory-non-authoritative');
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
  res.setHeader('X-AIntel-Finance-Source', 'legacy-in-memory-non-authoritative');
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
  res.setHeader('X-AIntel-Finance-Source', 'legacy-in-memory-non-authoritative');
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
