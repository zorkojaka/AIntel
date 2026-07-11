import crypto from 'crypto';
import mongoose from 'mongoose';

// ECO-29: dokumenti stranke (ponudbe/računi) prek KRATKOŽIVIH PODPISANIH URL.
// PDF-ji se generirajo na zahtevo; do njih vodi HMAC-podpisan žeton, ki veže
// stranko + tip + dokument + veljavnost. Interni seznam (/clients/documents) izda
// žetone; javni prenos (/documents/download) žeton preveri in vrne PDF.

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 min

export type ClientDocumentType = 'offer' | 'invoice';

interface DocTokenPayload {
  c: string; // clientId
  t: ClientDocumentType;
  p: string; // projectId (človeški, npr. PRJ-123)
  d: string; // docId (offerVersionId ali invoiceVersionId)
  e: number; // expiry (epoch ms)
}

function signingSecret(): string {
  return process.env.AINTEL_DOC_URL_SECRET || process.env.AINTEL_INTERNAL_API_KEY || 'dev-doc-secret';
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hmac(data: string): string {
  return b64url(crypto.createHmac('sha256', signingSecret()).update(data).digest());
}

export function signDocToken(payload: Omit<DocTokenPayload, 'e'>, ttlMs = TOKEN_TTL_MS): string {
  const full: DocTokenPayload = { ...payload, e: Date.now() + ttlMs };
  const body = b64url(JSON.stringify(full));
  return `${body}.${hmac(body)}`;
}

export function verifyDocToken(token: string): DocTokenPayload | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  // Časovno konstantna primerjava podpisa.
  const expected = hmac(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let payload: DocTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.e !== 'number' || payload.e < Date.now()) return null;
  if (payload.t !== 'offer' && payload.t !== 'invoice') return null;
  return payload;
}

async function resolveClient(input: { clientId: string | null; email: string | null }) {
  const { CrmClientModel } = await import('../crm/schemas/client');
  if (input.clientId) return CrmClientModel.findOne({ _id: input.clientId, isActive: true }).lean();
  if (input.email) return CrmClientModel.findOne({ email: input.email, isActive: true }).lean();
  return null;
}

const dateFmt = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

export interface ClientDocumentEntry {
  type: ClientDocumentType;
  id: string;
  projectId: string;
  projectTitle: string;
  number: string | null;
  date: string | null;
  token: string;
}

// Seznam dokumentov stranke: oddane/sprejete ponudbe (z dokumentno številko) +
// izdani računi. Vsak zapis dobi svoj kratkoživ podpisan žeton.
export async function listClientDocuments(input: { clientId: string | null; email: string | null }): Promise<{
  clientId: string | null;
  documents: ClientDocumentEntry[];
}> {
  const client = await resolveClient(input);
  if (!client) return { clientId: null, documents: [] };
  const clientId = String(client._id);

  const { ProjectModel } = await import('../projects/schemas/project');
  const { OfferVersionModel } = await import('../projects/schemas/offer-version');

  const projects = await ProjectModel.find({
    $or: [{ clientId: client._id }, { clientId: null, 'customer.name': client.name }],
  })
    .select({ id: 1, title: 1, invoiceVersions: 1 })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const projectIds = projects.map((p) => p.id);
  const projectTitleById = new Map(projects.map((p) => [p.id, p.title as string]));
  const documents: ClientDocumentEntry[] = [];

  // Ponudbe (samo poslane/sprejete, z dokumentno številko).
  if (projectIds.length) {
    const offers = await OfferVersionModel.find({
      projectId: { $in: projectIds },
      status: { $in: ['offered', 'accepted'] },
      documentNumber: { $ne: null },
    })
      .select({ _id: 1, projectId: 1, documentNumber: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .lean();
    for (const offer of offers) {
      documents.push({
        type: 'offer',
        id: String(offer._id),
        projectId: offer.projectId,
        projectTitle: projectTitleById.get(offer.projectId) ?? offer.projectId,
        number: offer.documentNumber ?? null,
        date: dateFmt(offer.createdAt),
        token: signDocToken({ c: clientId, t: 'offer', p: offer.projectId, d: String(offer._id) }),
      });
    }
  }

  // Računi (izdani; osnutki in stornirani se ne prikažejo).
  for (const project of projects) {
    for (const inv of (project.invoiceVersions ?? []) as any[]) {
      if (inv?.status !== 'issued') continue;
      documents.push({
        type: 'invoice',
        id: String(inv._id),
        projectId: project.id,
        projectTitle: (project.title as string) ?? project.id,
        number: inv.invoiceNumber ?? null,
        date: dateFmt(inv.issuedAt ?? inv.createdAt),
        token: signDocToken({ c: clientId, t: 'invoice', p: project.id, d: String(inv._id) }),
      });
    }
  }

  documents.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return { clientId, documents };
}

// Preveri žeton, potrdi lastništvo dokumenta in vrne generiran PDF + ime datoteke.
export async function generateClientDocument(
  token: string,
): Promise<{ buffer: Buffer; filename: string } | { error: 'INVALID' | 'NOT_FOUND' }> {
  const payload = verifyDocToken(token);
  if (!payload) return { error: 'INVALID' };

  const { ProjectModel } = await import('../projects/schemas/project');

  if (payload.t === 'offer') {
    const { OfferVersionModel } = await import('../projects/schemas/offer-version');
    if (!mongoose.isValidObjectId(payload.d)) return { error: 'NOT_FOUND' };
    const offer = await OfferVersionModel.findById(payload.d).select({ projectId: 1, documentNumber: 1 }).lean();
    if (!offer || offer.projectId !== payload.p) return { error: 'NOT_FOUND' };
    // Lastništvo: projekt ponudbe mora pripadati stranki iz žetona.
    const project = await ProjectModel.findOne({ id: offer.projectId }).select({ clientId: 1, 'customer.name': 1 }).lean();
    if (!project || !(await projectBelongsToClient(project, payload.c))) return { error: 'NOT_FOUND' };
    const { generateOfferDocumentPdf } = await import('../projects/services/offer-pdf-preview.service');
    const buffer = await generateOfferDocumentPdf(payload.d, 'OFFER');
    return { buffer, filename: `ponudba-${offer.documentNumber ?? payload.d}.pdf` };
  }

  // invoice
  const project = await ProjectModel.findOne({ id: payload.p }).select({ clientId: 1, 'customer.name': 1, invoiceVersions: 1 }).lean();
  if (!project || !(await projectBelongsToClient(project, payload.c))) return { error: 'NOT_FOUND' };
  const inv = ((project.invoiceVersions ?? []) as any[]).find((v) => String(v._id) === payload.d && v.status === 'issued');
  if (!inv) return { error: 'NOT_FOUND' };
  const { generateInvoicePdf } = await import('../projects/services/invoice-pdf.service');
  const buffer = await generateInvoicePdf(payload.p, payload.d, { docType: 'INVOICE' });
  return { buffer, filename: `racun-${inv.invoiceNumber ?? payload.d}.pdf` };
}

async function projectBelongsToClient(project: any, clientId: string): Promise<boolean> {
  if (project.clientId && String(project.clientId) === clientId) return true;
  // Fallback (starejši projekti brez clientId): ujemanje po imenu stranke.
  if (!project.clientId && project.customer?.name) {
    const { CrmClientModel } = await import('../crm/schemas/client');
    const client = await CrmClientModel.findOne({ _id: clientId, isActive: true }).select({ name: 1 }).lean();
    return Boolean(client && client.name === project.customer.name);
  }
  return false;
}
