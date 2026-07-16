/**
 * Nitenje pogovora s stranko (RFC 5322).
 *
 * Zakaj: vsaka nova verzija ponudbe je odpirala svojo nit, ker odhodna posta ni
 * imela glav In-Reply-To/References. Odjemalci (Gmail, Outlook) niti gradijo
 * prav po njiju; zadeva je le zasilna rezerva in pri nas ni zanesljiva (rocni
 * vnos, tipkarske napake).
 *
 * Nit sestavljata dve zbirki:
 *   - communication_messages: kar smo poslali (Message-ID v providerMessageId),
 *   - email_messages:         kar je stranka odgovorila (match.projectId).
 * Zadnji clen iscemo v OBEH — sicer bi se nova ponudba pripela na nase zadnje
 * sporocilo in preskocila vmesni odgovor stranke.
 */
import { CommunicationMessageModel } from '../schemas/message';
import { EmailMessageModel } from '../../email/email-message.model';

export interface ThreadHeaders {
  inReplyTo?: string;
  references?: string[];
  /** Zadeva prvega sporocila niti — da nova verzija ne odpre nove niti po zadevi. */
  threadSubject?: string;
}

/**
 * RFC 5322 dovoljuje dolge verige, a jih strezniki lahko krajsajo. Obdrzimo
 * korenino (drzi nit skupaj) in zadnje clene (drzijo lokalni kontekst).
 */
const NAJVEC_REFERENC = 20;

export function skrajsajReference(references: string[]): string[] {
  if (references.length <= NAJVEC_REFERENC) return references;
  const korenina = references[0];
  const rep = references.slice(-(NAJVEC_REFERENC - 1));
  return [korenina, ...rep];
}

/** Message-ID mora biti v oglatih oklepajih; brez njih ga odjemalci ne povezejo. */
export function normalizirajMessageId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed : `<${trimmed.replace(/^<|>$/g, '')}>`;
}

function normalizirajSeznam(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map(normalizirajMessageId).filter((entry): entry is string => !!entry);
}

interface Clen {
  messageId: string;
  references: string[];
  cas: number;
  subject: string;
}

async function zadnjiOdhodni(projectId: string): Promise<Clen | null> {
  const doc = await CommunicationMessageModel.findOne({
    projectId,
    direction: 'outbound',
    status: 'sent',
    providerMessageId: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .select({ providerMessageId: 1, references: 1, subjectFinal: 1, sentAt: 1, createdAt: 1 })
    .lean();
  if (!doc) return null;
  const messageId = normalizirajMessageId(doc.providerMessageId);
  if (!messageId) return null;
  return {
    messageId,
    references: normalizirajSeznam(doc.references),
    cas: new Date(doc.sentAt ?? doc.createdAt).getTime(),
    subject: doc.subjectFinal ?? '',
  };
}

async function zadnjiDohodni(projectId: string): Promise<Clen | null> {
  const doc = await EmailMessageModel.findOne({
    'match.projectId': projectId,
    messageId: { $exists: true, $ne: null },
  })
    .sort({ date: -1 })
    .select({ messageId: 1, references: 1, subject: 1, date: 1 })
    .lean();
  if (!doc) return null;
  const messageId = normalizirajMessageId(doc.messageId);
  if (!messageId) return null;
  return {
    messageId,
    references: normalizirajSeznam(doc.references),
    cas: new Date(doc.date).getTime(),
    subject: doc.subject ?? '',
  };
}

/**
 * Glave, s katerimi se novo sporocilo pripne na obstojeco nit projekta.
 * Ce niti se ni (prvo sporocilo), vrne prazno — sporocilo odpre svojo nit.
 */
export async function buildThreadHeaders(projectId: string): Promise<ThreadHeaders> {
  if (!projectId) return {};

  const [odhodni, dohodni] = await Promise.all([zadnjiOdhodni(projectId), zadnjiDohodni(projectId)]);

  const kandidati = [odhodni, dohodni].filter((entry): entry is Clen => !!entry);
  if (kandidati.length === 0) return {};

  // Novejsi clen je stars: tako se nova ponudba pripne pod odgovor stranke,
  // ne pod nase prejsnje sporocilo.
  const stars = kandidati.reduce((a, b) => (b.cas > a.cas ? b : a));

  const references = skrajsajReference([...stars.references, stars.messageId]);
  // Zadevo vzamemo iz ZADNJEGA odhodnega, ne iz prvega: PRJ-217 kaze, da je bila
  // prva zadeva tipkarsko napacna ("ponubda") in popravljena sele v naslednji —
  // prva zadeva bi napako prepisovala naprej. Strankin "Re: ..." ni vir zadeve.
  const threadSubject = (odhodni?.subject ?? '').trim();

  return {
    inReplyTo: stars.messageId,
    references,
    threadSubject: threadSubject || undefined,
  };
}
