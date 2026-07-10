import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import mongoose from 'mongoose';

import { CommunicationMessageModel } from '../communication/schemas/message';
import { CrmClientModel } from '../crm/schemas/client';
import { OfferVersionModel } from '../projects/schemas/offer-version';
import { ProjectModel } from '../projects/schemas/project';
import { ensureRuleTask } from '../scheduler/rules';
import { getRuleMode } from '../scheduler/wheel-config';
import { TaskModel } from '../tasks/task.model';
import { EmailIngestStateModel, EmailMessageModel, type EmailMessageDocument } from './email-message.model';

// AIN-P1-14 F1–F4: branje namenskega nabiralnika (prodaja@) prek IMAP.
// Samo beremo — nabiralnika nikoli ne spreminjamo (read-only mailbox open),
// napredek beleži email_ingest_state (lastUid). Nikoli ne odgovarjamo sami.

const FOLDER = 'INBOX';
const MAX_TEXT_LENGTH = 20000;
const MAX_PER_RUN = 50;

export function readImapEnv() {
  const host = process.env.AINTEL_IMAP_HOST?.trim() || '';
  const rawPort = process.env.AINTEL_IMAP_PORT?.trim() || '';
  const parsedPort = rawPort ? Number(rawPort) : 993;
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 993;
  const secure = (process.env.AINTEL_IMAP_SECURE?.trim() || 'true').toLowerCase() !== 'false';
  const user = process.env.AINTEL_IMAP_USER?.trim() || '';
  const pass = process.env.AINTEL_IMAP_PASS ?? '';
  return { host, port, secure, user, pass, configured: Boolean(host && user && pass) };
}

export function getEmailIngestDiagnostics() {
  const env = readImapEnv();
  return {
    configured: env.configured,
    host: env.host || null,
    user: env.user || null,
  };
}

function normalizeMessageIdList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : value.split(/\s+/);
  return raw.map((entry) => entry.trim()).filter(Boolean);
}

function extractAddresses(parsed: ParsedMail, field: 'from' | 'to'): Array<{ address: string; name: string }> {
  const source = parsed[field];
  const list = Array.isArray(source) ? source : source ? [source] : [];
  const out: Array<{ address: string; name: string }> = [];
  for (const entry of list) {
    for (const value of entry.value ?? []) {
      if (value.address) out.push({ address: value.address.toLowerCase(), name: value.name ?? '' });
    }
  }
  return out;
}

const DOCUMENT_NUMBER_REGEX = /\b(PONUDBA-\d{4}-\d+|PRJ-\d+)\b/i;

type MatchResult = NonNullable<EmailMessageDocument['match']> | null;

/** F2: odgovor na naš mail → CRM stranka → številka dokumenta. */
export async function matchInboundEmail(doc: Pick<EmailMessageDocument, 'inReplyTo' | 'references' | 'fromAddress' | 'subject' | 'text'>): Promise<MatchResult> {
  // (a) In-Reply-To / References ↔ providerMessageId poslanih sporočil
  const replyIds = [doc.inReplyTo, ...(doc.references ?? [])].filter(Boolean) as string[];
  if (replyIds.length > 0) {
    const sent = await CommunicationMessageModel.findOne({ providerMessageId: { $in: replyIds } })
      .sort({ createdAt: -1 })
      .lean();
    if (sent) {
      return {
        projectId: sent.projectId,
        offerId: sent.offerId ?? undefined,
        communicationMessageId: sent._id as mongoose.Types.ObjectId,
        matchedBy: 'reply',
      };
    }
  }

  // (b) PON-/PRJ- številka v zadevi ali telesu (pred e-naslovom, ker je bolj specifična)
  const numberMatch = `${doc.subject}\n${doc.text}`.match(DOCUMENT_NUMBER_REGEX);
  if (numberMatch) {
    const token = numberMatch[1].toUpperCase();
    if (token.startsWith('PRJ-')) {
      const project = await ProjectModel.findOne({ id: token }).select({ id: 1, clientId: 1 }).lean();
      if (project) {
        return {
          projectId: project.id,
          clientId: (project.clientId as mongoose.Types.ObjectId) ?? undefined,
          matchedBy: 'document-number',
        };
      }
    } else {
      const offer = await OfferVersionModel.findOne({ documentNumber: token }).select({ _id: 1, projectId: 1 }).lean();
      if (offer) {
        return { projectId: offer.projectId, offerId: String(offer._id), matchedBy: 'document-number' };
      }
    }
  }

  // (c) pošiljateljev e-naslov ↔ CRM stranka ↔ najnovejši aktivni projekt
  const client = await CrmClientModel.findOne({ email: doc.fromAddress, isActive: { $ne: false } }).lean();
  if (client) {
    const project = await ProjectModel.findOne({
      clientId: client._id,
      status: { $in: ['draft', 'offered', 'ordered', 'in-progress'] },
    })
      .sort({ createdAt: -1 })
      .select({ id: 1 })
      .lean();
    return {
      projectId: project?.id,
      clientId: client._id as mongoose.Types.ObjectId,
      matchedBy: 'client-email',
    };
  }

  return null;
}

/** F3+F4: sled na projektu, samodejno zapiranje follow-upa, opravilo za branje. */
async function applyMatchActions(email: EmailMessageDocument) {
  const match = email.match;
  const senderLabel = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;

  if (match?.projectId) {
    await ProjectModel.updateOne(
      { id: match.projectId },
      {
        $push: {
          timeline: {
            type: 'edit',
            title: 'Prejet e-mail',
            description: `${senderLabel}: ${email.subject || '(brez zadeve)'}`,
            timestamp: new Date().toLocaleString('sl-SI'),
            user: 'Pošta',
            metadata: { emailMessageId: String(email._id) },
          },
        },
      },
    );
  }

  // F4: odgovor stranke zapre odprti offer.follow_up za to ponudbo …
  if (match?.offerId && mongoose.isValidObjectId(match.offerId)) {
    const openFollowUps = await TaskModel.find({
      type: 'offer.follow_up',
      'subject.id': new mongoose.Types.ObjectId(match.offerId),
      status: { $in: ['open', 'in_progress', 'blocked'] },
    });
    for (const task of openFollowUps) {
      task.status = 'done';
      task.resolution = {
        outcome: 'stranka odgovorila po e-pošti',
        note: `E-mail: ${email.subject || '(brez zadeve)'}`,
        resolvedByRule: 'email.ingest',
        resolvedAt: new Date(),
      };
      task.history.push({ at: new Date(), action: 'completed', note: 'email.ingest: odgovor stranke' });
      await task.save();
    }
  }

  // … in ustvari opravilo »preberi odgovor« oz. za nepovezane »preberi in poveži«.
  const label = match?.projectId ? `${email.subject || 'e-mail'} — ${match.projectId}` : email.subject || 'e-mail';
  await ensureRuleTask({
    ruleKey: 'email.ingest',
    dedupeKey: `email.inbound:${email._id}`,
    type: match?.projectId ? 'email.reply' : 'email.unmatched',
    title: match?.projectId ? `Preberi odgovor stranke (${match.projectId})` : `Poveži e-mail: ${senderLabel}`,
    description: `${senderLabel}\nZadeva: ${email.subject || '(brez zadeve)'}\n\n${email.text.slice(0, 500)}`,
    subject: { kind: 'none', label },
    assigneeRole: 'SALES',
    priority: 'normal',
    dueAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
  });
}

/** F1: prek IMAP preberi nova sporočila (od zadnjega UID naprej) in jih shrani. */
export async function ingestInboundEmail() {
  if ((await getRuleMode('email.ingest')) === 'off') return { skipped: 1 };
  const env = readImapEnv();
  if (!env.configured) return { skipped: 1, reason: 'imap-not-configured' };

  const state = (await EmailIngestStateModel.findById(FOLDER)) ?? new EmailIngestStateModel({ _id: FOLDER, lastUid: 0 });

  const client = new ImapFlow({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: { user: env.user, pass: env.pass },
    logger: false,
  });

  let stored = 0;
  let matched = 0;
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(FOLDER, { readOnly: true });

    const uidValidity = String(mailbox.uidValidity ?? '');
    if (state.uidValidity && state.uidValidity !== uidValidity) {
      // UID-ji niso več primerljivi — začnemo od trenutnega konca, brez
      // ponovnega uvoza celega nabiralnika (podvajanje prepreči unique indeks).
      state.lastUid = Math.max(0, (mailbox.uidNext ?? 1) - 1);
    }
    state.uidValidity = uidValidity;

    const startUid = state.lastUid + 1;
    if ((mailbox.uidNext ?? 1) > startUid) {
      let processed = 0;
      for await (const message of client.fetch(
        `${startUid}:*`,
        { uid: true, source: true },
        { uid: true },
      )) {
        if (processed >= MAX_PER_RUN) break;
        processed += 1;
        if (!message.source) continue;

        const parsed = await simpleParser(message.source);
        const from = extractAddresses(parsed, 'from')[0];
        if (!from?.address) {
          state.lastUid = Math.max(state.lastUid, message.uid);
          continue;
        }
        // Lastna poslana pošta (kopije v INBOX) ne gre v resolve center.
        if (from.address === env.user.toLowerCase()) {
          state.lastUid = Math.max(state.lastUid, message.uid);
          continue;
        }

        const doc = new EmailMessageModel({
          tenantId: 'inteligent',
          messageId: parsed.messageId ?? undefined,
          inReplyTo: parsed.inReplyTo ?? undefined,
          references: normalizeMessageIdList(parsed.references),
          fromAddress: from.address,
          fromName: from.name,
          to: extractAddresses(parsed, 'to').map((entry) => entry.address),
          subject: parsed.subject ?? '',
          date: parsed.date ?? new Date(),
          text: (parsed.text ?? '').slice(0, MAX_TEXT_LENGTH),
          attachmentsMeta: (parsed.attachments ?? []).map((attachment) => ({
            filename: attachment.filename ?? '',
            size: attachment.size ?? 0,
            contentType: attachment.contentType ?? '',
          })),
          folder: FOLDER,
          uid: message.uid,
        });

        const match = await matchInboundEmail(doc);
        if (match) {
          doc.match = match;
          doc.status = match.projectId ? 'matched' : 'unmatched';
        } else {
          doc.status = 'unmatched';
        }

        try {
          await doc.save();
          stored += 1;
          if (doc.status === 'matched') matched += 1;
          await applyMatchActions(doc);
        } catch (error: any) {
          if (error?.code !== 11000) throw error; // duplikat (folder+uid) → preskoči
        }
        state.lastUid = Math.max(state.lastUid, message.uid);
      }
    }

    state.lastRunAt = new Date();
    state.lastError = undefined;
    await state.save();
    return { stored, matched, lastUid: state.lastUid };
  } catch (error) {
    state.lastRunAt = new Date();
    state.lastError = error instanceof Error ? error.message : String(error);
    await state.save().catch(() => {});
    throw error;
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Ročna povezava iz resolve centra (status → matched + iste akcije). */
export async function linkEmailToProject(emailId: string, projectId: string) {
  if (!mongoose.isValidObjectId(emailId)) throw new Error('Neveljaven ID sporočila.');
  const email = await EmailMessageModel.findById(emailId);
  if (!email) throw new Error('Sporočilo ne obstaja.');
  const project = await ProjectModel.findOne({ id: projectId }).select({ id: 1, clientId: 1 }).lean();
  if (!project) throw new Error(`Projekt ${projectId} ni najden.`);

  email.match = {
    projectId: project.id,
    clientId: (project.clientId as mongoose.Types.ObjectId) ?? undefined,
    matchedBy: 'manual',
  };
  email.status = 'matched';
  await email.save();
  await applyMatchActions(email);
  return email.toObject();
}
