import { getConfig } from '../settings/config/config-store.service';
import { getSettings } from '../settings/settings.service';

// Avans po ponudbi se plača z UPN nakazilom s sklicem, izpeljanim iz številke
// ponudbe (PONUDBA-2026-167 → SI00 2026-167). Bančno obvestilo o prilivu se
// nato po istem sklicu samodejno ujame (bank-email.service).

export interface AdvancePaymentInstructions {
  recipient: string;
  iban: string;
  amount: number;
  reference: string;
  purpose: string;
  /** Odstotek ponudbe, iz katerega je izračunan avans (za prikaz stranki). */
  percent: number;
}

export function advanceReferenceForOfferNumber(offerNumber: string): string {
  const groups = offerNumber.match(/\d+/g) ?? [];
  return `SI00 ${groups.join('-')}`;
}

/** Ali se sklic (iz bančnega obvestila) ujema s številko ponudbe. */
export function referenceMatchesOfferNumber(reference: string, offerNumber: string): boolean {
  const ga = (reference.replace(/^\s*SI\d{2}\s*/i, '').match(/\d+/g) ?? []).map((g) => g.replace(/^0+(?=\d)/, ''));
  const gb = (offerNumber.match(/\d+/g) ?? []).map((g) => g.replace(/^0+(?=\d)/, ''));
  return ga.length > 0 && ga.length === gb.length && ga.every((entry, index) => entry === gb[index]);
}

/**
 * Sestavi UPN navodila za avans. Vrne null, če pogoji niso izpolnjeni
 * (ni IBAN v nastavitvah, ni številke/zneska ponudbe ali je avans izklopljen).
 */
export async function buildAdvanceInstructions(
  offerNumber: string | null | undefined,
  offerTotalWithVat: number | null | undefined,
): Promise<AdvancePaymentInstructions | null> {
  if (!offerNumber || !offerTotalWithVat || offerTotalWithVat <= 0) return null;

  const [settings, config] = await Promise.all([
    getSettings(),
    getConfig<{ percent?: number; enabled?: boolean }>('finance.advance'),
  ]);
  if (config.enabled === false) return null;
  const iban = (settings.iban ?? '').trim();
  if (!iban) return null;

  const percent = Math.min(100, Math.max(1, Number(config.percent ?? 30)));
  // Zaokrožimo na cel evro — lepše za nakazilo in dovolj natančno za avans.
  const amount = Math.max(1, Math.round((offerTotalWithVat * percent) / 100));

  return {
    recipient: settings.companyName || 'Inteligent d.o.o.',
    iban,
    amount,
    reference: advanceReferenceForOfferNumber(offerNumber),
    purpose: `Avans za ponudbo ${offerNumber}`,
    percent,
  };
}
