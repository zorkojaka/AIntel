import { getConfig } from '../settings/config/config-store.service';
import { getRuleMode } from '../scheduler/wheel-config';
import { ensureRuleTask } from '../scheduler/rules';
import { ProjectModel } from '../projects/schemas/project';
import type { EmailMessageDocument } from '../email/email-message.model';
import { InvoicePaymentModel, type InvoicePaymentDocument } from './invoice-payment.model';
import { confirmedPaymentsByInvoiceNumber } from './payments.service';

// Bančno obvestilo o prilivu (posredovano na prodaja@) → zapis plačila in
// ujemanje z odprtim računom. Vklop prek pravila kolesa `payment.bank_email`
// (off/manual/auto) + nastavitve `finance.bank` (pošiljatelji, ključne besede).
//
// Banke pošiljajo različne formate; parser je nalašč ohlapen: znesek in sklic
// išče po ključnih besedah in splošnih vzorcih. Kar ne prepozna, pusti človeku
// (zapis "unmatched" + opravilo) — nikoli ne ugiba na silo.

const TOLERANCA_EUR = 0.01;

export interface BankIngestConfig {
  senders: string[];
  keywords: string[];
}

export async function getBankIngestConfig(): Promise<BankIngestConfig> {
  const config = await getConfig<{ senders?: string[]; keywords?: string[] }>('finance.bank');
  return {
    senders: (config.senders ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean),
    keywords: (config.keywords ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean),
  };
}

/** Ali je mail bančno obvestilo o prilivu? Pošiljatelj + vsaj ena ključna beseda. */
export function isBankPaymentEmail(
  email: Pick<EmailMessageDocument, 'fromAddress' | 'subject' | 'text'>,
  config: BankIngestConfig,
): boolean {
  if (!config.senders.length) return false;
  const from = (email.fromAddress ?? '').toLowerCase();
  if (!config.senders.some((sender) => from.includes(sender))) return false;
  if (!config.keywords.length) return true;
  const besedilo = `${email.subject ?? ''}\n${email.text ?? ''}`.toLowerCase();
  return config.keywords.some((keyword) => besedilo.includes(keyword));
}

/** "1.234,56" ali "1234.56" → 1234.56 */
function parseAmountToken(token: string): number | null {
  const trimmed = token.trim();
  let normalized: string;
  if (/,\d{1,2}$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{1,2}$/.test(trimmed)) {
    normalized = trimmed.replace(/,/g, '');
  } else {
    normalized = trimmed.replace(/[.,]/g, '');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

const AMOUNT_TOKEN = String.raw`\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?`;

export interface ParsedBankPayment {
  amount: number | null;
  reference: string | null;
  payerName: string | null;
}

/** Iz besedila obvestila izlušči znesek, sklic in plačnika (kar pač najde). */
export function parseBankPaymentEmail(subject: string, text: string): ParsedBankPayment {
  const besedilo = `${subject}\n${text}`;

  // Znesek: najprej ob ključni besedi (znesek/priliv/nakazilo/prejeli), sicer prvi "… EUR".
  let amount: number | null = null;
  const zneskovni = besedilo.match(
    new RegExp(String.raw`(?:znes[ek][ku]?|priliv|nakazil[oa]|prejeli)[^\d€]{0,40}(${AMOUNT_TOKEN})`, 'i'),
  );
  if (zneskovni) amount = parseAmountToken(zneskovni[1]);
  if (amount === null) {
    const obEur = besedilo.match(new RegExp(String.raw`(${AMOUNT_TOKEN})\s*(?:EUR|€)`, 'i'))
      ?? besedilo.match(new RegExp(String.raw`(?:EUR|€)\s*(${AMOUNT_TOKEN})`, 'i'));
    if (obEur) amount = parseAmountToken(obEur[1]);
  }

  // Sklic: "SIxx …" ali za besedo sklic/referenca.
  let reference: string | null = null;
  const sklicSi = besedilo.match(/\bSI\d{2}[ \t]?[\d\-/]{1,22}\d\b/i);
  if (sklicSi) {
    reference = sklicSi[0].replace(/\s+/g, ' ').trim();
  } else {
    const sklicBeseda = besedilo.match(/(?:sklic|referenca|reference)\s*[:\s]\s*([A-Za-z0-9\-/ ]{3,30})/i);
    if (sklicBeseda) reference = sklicBeseda[1].trim().replace(/\s{2,}/g, ' ');
  }

  // Plačnik: za besedo plačnik/nalogodajalec do konca vrstice.
  let payerName: string | null = null;
  const placnik = besedilo.match(/(?:pla[čc]nik|nalogodajalec)\s*[:\s]\s*([^\n\r]{2,80})/i);
  if (placnik) payerName = placnik[1].trim();

  return { amount, reference, payerName };
}

function digitGroups(value: string): string[] {
  return (value.match(/\d+/g) ?? []).map((group) => group.replace(/^0+(?=\d)/, ''));
}

/** Sklic brez predpone modela ("SI00 12-7-2026" → ["12","7","2026"]) proti številki računa ("12/7/2026"). */
function sameDigitGroups(reference: string, invoiceNumber: string): boolean {
  const ga = digitGroups(reference.replace(/^\s*SI\d{2}\s*/i, ''));
  const gb = digitGroups(invoiceNumber);
  return ga.length > 0 && ga.length === gb.length && ga.every((entry, index) => entry === gb[index]);
}

interface OpenInvoice {
  projectId: string;
  invoiceVersionId: string;
  invoiceNumber: string;
  totalWithVat: number;
  outstanding: number;
}

/** Izdani računi, ki še niso (v celoti) plačani. */
export async function listOpenInvoices(): Promise<OpenInvoice[]> {
  const projects = await ProjectModel.find({
    invoiceVersions: { $elemMatch: { status: 'issued' } },
  })
    .select({ id: 1, invoiceVersions: 1 })
    .lean();

  const issued: Array<Omit<OpenInvoice, 'outstanding'>> = [];
  for (const project of projects as any[]) {
    for (const version of project.invoiceVersions ?? []) {
      if (version?.status !== 'issued' || !version?.invoiceNumber) continue;
      issued.push({
        projectId: project.id,
        invoiceVersionId: String(version._id ?? ''),
        invoiceNumber: String(version.invoiceNumber),
        totalWithVat: Number(version.summary?.totalWithVat ?? 0),
      });
    }
  }

  const paidByNumber = await confirmedPaymentsByInvoiceNumber(issued.map((entry) => entry.invoiceNumber));
  return issued
    .map((entry) => ({
      ...entry,
      outstanding: Math.max(0, entry.totalWithVat - (paidByNumber.get(entry.invoiceNumber)?.paidAmount ?? 0)),
    }))
    .filter((entry) => entry.outstanding > TOLERANCA_EUR);
}

/**
 * Poišče račun za plačilo: (1) številka računa v besedilu, (2) sklic s
 * številkami računa, (3) edini odprti račun s točno tem zneskom.
 */
export function matchOpenInvoice(
  parsed: ParsedBankPayment,
  besedilo: string,
  openInvoices: OpenInvoice[],
): { invoice: OpenInvoice; strong: boolean } | null {
  const vBesedilu = openInvoices.filter((invoice) => besedilo.includes(invoice.invoiceNumber));
  if (vBesedilu.length === 1) return { invoice: vBesedilu[0], strong: true };

  if (parsed.reference) {
    const poSklicu = openInvoices.filter((invoice) => sameDigitGroups(parsed.reference as string, invoice.invoiceNumber));
    if (poSklicu.length === 1) return { invoice: poSklicu[0], strong: true };
  }

  if (parsed.amount !== null) {
    const poZnesku = openInvoices.filter((invoice) => Math.abs(invoice.outstanding - (parsed.amount as number)) <= TOLERANCA_EUR);
    if (poZnesku.length === 1) return { invoice: poZnesku[0], strong: false };
  }

  return null;
}

/**
 * Obdela bančni mail: zapiše plačilo, ga poskusi ujeti z računom in ustvari
 * opravilo za FINANCE, kjer je potrebna potrditev. Vrne null, če mail ni
 * bančno obvestilo ali je pravilo izklopljeno.
 */
export async function tryRegisterBankPayment(email: EmailMessageDocument): Promise<InvoicePaymentDocument | null> {
  const mode = await getRuleMode('payment.bank_email');
  if (mode === 'off') return null;

  const config = await getBankIngestConfig();
  if (!isBankPaymentEmail(email, config)) return null;

  // Idempotentnost: en mail = največ en zapis plačila (podprto tudi z unikatnim indeksom).
  const obstojece = await InvoicePaymentModel.findOne({ emailMessageId: String(email._id) });
  if (obstojece) return obstojece;

  const parsed = parseBankPaymentEmail(email.subject ?? '', email.text ?? '');
  const besedilo = `${email.subject ?? ''}\n${email.text ?? ''}`;
  const open = await listOpenInvoices();
  const match = parsed.amount !== null ? matchOpenInvoice(parsed, besedilo, open) : null;

  const autoConfirm = mode === 'auto' && match?.strong === true;
  let payment: InvoicePaymentDocument;
  try {
    payment = await InvoicePaymentModel.create({
      projectId: match?.invoice.projectId ?? null,
      invoiceVersionId: match?.invoice.invoiceVersionId ?? null,
      invoiceNumber: match?.invoice.invoiceNumber ?? null,
      amount: parsed.amount ?? 0.01, // brez zneska ne moremo šteti — ostane unmatched, človek popravi
      receivedAt: email.date ?? new Date(),
      payerName: parsed.payerName,
      reference: parsed.reference,
      source: 'bank_email',
      emailMessageId: String(email._id),
      status: autoConfirm ? 'confirmed' : match ? 'suggested' : 'unmatched',
      confirmedAt: autoConfirm ? new Date() : null,
      note: parsed.amount === null ? 'Zneska ni bilo mogoče prebrati iz obvestila — preveri in popravi.' : null,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return InvoicePaymentModel.findOne({ emailMessageId: String(email._id) });
    }
    throw error;
  }

  const znesek = parsed.amount !== null ? `${parsed.amount.toFixed(2)} €` : 'neznan znesek';
  if (!autoConfirm) {
    await ensureRuleTask({
      ruleKey: 'payment.bank_email',
      dedupeKey: `payment.bank_email:${email._id}`,
      type: 'payment.review',
      title: match
        ? `Potrdi plačilo ${znesek} za račun ${match.invoice.invoiceNumber}`
        : `Preveri priliv ${znesek} — račun ni najden`,
      description: [
        `Plačnik: ${parsed.payerName ?? 'neznan'}`,
        `Sklic: ${parsed.reference ?? '—'}`,
        `Zadeva: ${email.subject || '(brez zadeve)'}`,
        match ? `Predlagan račun: ${match.invoice.invoiceNumber} (odprto ${match.invoice.outstanding.toFixed(2)} €)` : 'Ujemi ročno v Finance → Računi.',
      ].join('\n'),
      subject: { kind: 'none', label: `Priliv ${znesek}` },
      assigneeRole: 'FINANCE',
      priority: match ? 'normal' : 'high',
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  return payment;
}
