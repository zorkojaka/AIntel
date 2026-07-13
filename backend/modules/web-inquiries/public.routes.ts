import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import mongoose from 'mongoose';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { fireRule, onServiceTicketReported, onWebInquiryNextStep, onWebInquiryProcessed } from '../scheduler/rules';
import { createServiceTicket, listServiceTickets, type ActorContext } from '../service/service-ticket.service';
import { listClientDocuments, generateClientDocument } from '../documents/client-documents.service';
import {
  assertInquiryQuota,
  buildWebOfferValuePayload,
  getWebInquiryOptions,
  getWebIzdelki,
  getWebKatalog,
  PILLAR_LABELS,
  processWebInquiry,
  validateWebInquiryPayload,
  WebInquiryError,
} from './web-inquiry.service';
import { WebInquiryModel } from './web-inquiry.model';
import { getReviewByToken, listApprovedReviews, submitReview } from '../reviews/review.service';
import { OfferVersionModel } from '../projects/schemas/offer-version';

const UPLOAD_BASE_DIR = '/var/www/aintel/uploads/web-inquiries';
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const inquiryId = String(req.params.id ?? '');
      if (!mongoose.isValidObjectId(inquiryId)) return cb(new Error('Neveljaven ID povpraševanja.'), '');
      const dir = path.join(UPLOAD_BASE_DIR, inquiryId);
      try {
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (error) {
        cb(error as Error, dir);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
      cb(null, `foto-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!PHOTO_MIME_TYPES.includes(file.mimetype)) return cb(new Error('Dovoljene so samo slike (JPG, PNG, WebP).'));
    cb(null, true);
  },
});

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const requestLog = new Map<string, number[]>();

// ECO-18/S10: nginx (proxy_add_x_forwarded_for) doda resnični IP odjemalca na
// KONEC X-Forwarded-For — prve vnose lahko podtakne odjemalec sam. Zato beremo
// zadnji vnos, ne prvega (prej je bil limit izogibljiv s poljubnim XFF).
function clientIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const deli = forwarded.split(',');
    return deli[deli.length - 1].trim();
  }
  return req.ip ?? 'unknown';
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const entries = (requestLog.get(ip) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (entries.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, entries);
    return true;
  }
  entries.push(now);
  requestLog.set(ip, entries);
  if (requestLog.size > 5000) {
    requestLog.clear();
  }
  return false;
}

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = process.env.AINTEL_WEB_INQUIRY_API_KEY?.trim();
  if (!configuredKey) {
    return res.status(503).json({ ok: false, code: 'NOT_CONFIGURED', message: 'Spletna povpraševanja niso omogočena (manjka AINTEL_WEB_INQUIRY_API_KEY).' });
  }
  const providedKey = (req.headers['x-api-key'] as string | undefined)?.trim();
  if (providedKey !== configuredKey) {
    return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Neveljaven API ključ.' });
  }
  return next();
}

// AIN-P0-01: server-to-server routes (/clients/*) live behind a separate key that is
// never shipped to a browser.
function requireServerApiKey(req: Request, res: Response, next: NextFunction) {
  const internalKey = process.env.AINTEL_INTERNAL_API_KEY?.trim();
  if (!internalKey) {
    return res.status(503).json({ ok: false, code: 'NOT_CONFIGURED', message: 'Interni API ni omogočen (manjka AINTEL_INTERNAL_API_KEY).' });
  }
  const providedKey = (req.headers['x-api-key'] as string | undefined)?.trim();
  if (providedKey !== internalKey) {
    return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Neveljaven API ključ.' });
  }
  return next();
}

const internalRouter = Router();
internalRouter.use(cors({ origin: false }));
internalRouter.use(requireServerApiKey);

const router = Router();
// Mounted before the browser-wide CORS + key guard so /clients/* never falls through
// to the permissive browser configuration.
router.use('/clients', internalRouter);

// The website widget calls these endpoints directly from the browser, so they
// need their own permissive CORS (the global allowlist covers only aintel origins).
router.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-API-Key'] }));
router.use(requireApiKey);

router.get('/options', async (_req: Request, res: Response) => {
  try {
    const options = await getWebInquiryOptions();
    return res.json({ ok: true, ...options });
  } catch (error) {
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: error instanceof Error ? error.message : 'Napaka strežnika.' });
  }
});

const izdelkiCache: { data: unknown; cas: number } = { data: null, cas: 0 };
router.get('/products', async (_req: Request, res: Response) => {
  try {
    if (!izdelkiCache.data || Date.now() - izdelkiCache.cas > 10 * 60 * 1000) {
      izdelkiCache.data = await getWebIzdelki();
      izdelkiCache.cas = Date.now();
    }
    return res.json({ ok: true, groups: izdelkiCache.data });
  } catch (error) {
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: error instanceof Error ? error.message : 'Napaka strežnika.' });
  }
});

// ECO-34: full catalogue for the static website build (same auth as /products).
const katalogCache: { data: unknown; cas: number; limit: number } = { data: null, cas: 0, limit: 0 };
router.get('/catalog', async (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query?.limit) || 100));
    if (!katalogCache.data || katalogCache.limit !== limit || Date.now() - katalogCache.cas > 10 * 60 * 1000) {
      katalogCache.data = await getWebKatalog(limit);
      katalogCache.cas = Date.now();
      katalogCache.limit = limit;
    }
    return res.json({ ok: true, groups: katalogCache.data });
  } catch (error) {
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: error instanceof Error ? error.message : 'Napaka strežnika.' });
  }
});

router.post('/inquiries', async (req: Request, res: Response) => {
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, code: 'RATE_LIMITED', message: 'Preveč zahtevkov. Poskusite znova čez nekaj minut.' });
  }

  try {
    const payload = validateWebInquiryPayload(req.body);

    const duplicate = await WebInquiryModel.findOne({
      'contact.email': payload.contact.email,
      pillar: payload.pillar,
      createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    }).sort({ createdAt: -1 });
    if (duplicate) {
      const duplicateOffer = duplicate.offerId ? await OfferVersionModel.findById(duplicate.offerId).lean() : null;
      return res.json({
        ok: true,
        inquiryId: String(duplicate._id),
        message:
          duplicate.status === 'ponudba_poslana'
            ? 'Povpraševanje smo že prejeli – informativna ponudba je bila poslana na vaš e-naslov.'
            : 'Povpraševanje smo že prejeli in ga obdelujemo.',
        offerSummary: duplicate.offerNumber
          ? {
              offerNumber: duplicate.offerNumber,
              totalWithVat: duplicate.offerTotalWithVat,
              currency: 'EUR',
              value: await buildWebOfferValuePayload(duplicateOffer, payload),
            }
          : undefined,
        duplicate: true,
      });
    }

    // ECO-18/S10: trajne kvote (baza) — namerno ZA duplicate preverbo, da ponovna
    // oddaja iste stranke vrne obstoječo ponudbo in ne 429.
    await assertInquiryQuota(payload.contact.email);

    const result = await processWebInquiry(payload);
    // AIN-P1-11: kolo — prvi kontakt (opravilo za prodajo). Fire-and-forget.
    fireRule(
      onWebInquiryProcessed(result.inquiry, Boolean(result.offerNumber) && result.emailSent),
      'inquiry.first_contact',
    );
    return res.status(201).json({
      ok: true,
      inquiryId: String(result.inquiry._id),
      message: result.message,
      offerSummary: result.offerNumber
        ? {
            offerNumber: result.offerNumber,
            totalWithVat: result.offerTotalWithVat,
            currency: 'EUR',
            emailSent: result.emailSent,
            discountPercent: Number((result.inquiry as any).meta?.discountPercent) || 0,
            value: result.offerValuePayload ?? null,
          }
        : undefined,
    });
  } catch (error) {
    if (error instanceof WebInquiryError) {
      return res.status(error.statusCode).json({ ok: false, code: error.code, message: error.message });
    }
    (req as any).log?.error({ err: error }, '[web-inquiries] Nepričakovana napaka');
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Napaka strežnika. Poskusite znova ali nas pokličite.' });
  }
});

router.post('/inquiries/:id/photos', (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(String(req.params.id))) {
    return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'Neveljaven ID povpraševanja.' });
  }
  photoUpload.array('photos', 6)(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Nalaganje slik ni uspelo.';
      return res.status(400).json({ ok: false, code: 'UPLOAD_ERROR', message });
    }
    try {
      const inquiry = await WebInquiryModel.findById(req.params.id);
      if (!inquiry) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Povpraševanje ni najdeno.' });
      }
      const files = (req.files as Express.Multer.File[]) ?? [];
      if ((inquiry.photos?.length ?? 0) + files.length > 12) {
        return res.status(400).json({ ok: false, code: 'UPLOAD_ERROR', message: 'Preveč slik za eno povpraševanje.' });
      }
      const now = new Date();
      const records = files.map((file) => ({
        filename: file.filename,
        url: `/uploads/web-inquiries/${req.params.id}/${file.filename}`,
        uploadedAt: now,
      }));
      inquiry.photos = [...(inquiry.photos ?? []), ...records];
      await inquiry.save();
      return res.json({ ok: true, uploaded: records.length, totalPhotos: inquiry.photos.length });
    } catch (error) {
      (req as any).log?.error({ err: error }, '[web-inquiries] Napaka pri shranjevanju slik');
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Slik ni bilo mogoče shraniti.' });
    }
  });
});

// Oprema stranke (za portal "Moja oprema") - samo branje, server-to-server.
// Stranko naslavljamo po clientId (stabilno; ECO-27), z e-mailom kot fallbackom za
// prvi obisk - portal si clientId iz odgovora shrani in ga uporablja naprej.
function resolveClientQuery(req: Request): { clientId: string | null; email: string | null; error?: string } {
  const clientId = String(req.query.clientId ?? '').trim();
  const email = String(req.query.email ?? '').trim().toLowerCase();
  if (clientId) {
    if (!mongoose.isValidObjectId(clientId)) return { clientId: null, email: null, error: 'Neveljaven clientId.' };
    return { clientId, email: null };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { clientId: null, email: null, error: 'Neveljaven e-naslov.' };
  return { clientId: null, email };
}

internalRouter.get('/equipment', async (req: Request, res: Response) => {
  try {
    const naslov = resolveClientQuery(req);
    if (naslov.error) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: naslov.error });
    }
    const { CrmClientModel } = await import('../crm/schemas/client');
    const { ProjectModel } = await import('../projects/schemas/project');
    const { OfferVersionModel } = await import('../projects/schemas/offer-version');

    const client = naslov.clientId
      ? await CrmClientModel.findOne({ _id: naslov.clientId, isActive: true }).lean()
      : await CrmClientModel.findOne({ email: naslov.email, isActive: true }).lean();
    if (!client) return res.json({ ok: true, clientId: null, projects: [] });

    const projects = await ProjectModel.find({
      $or: [{ clientId: client._id }, { clientId: null, 'customer.name': client.name }],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const rezultat = [];
    for (const project of projects) {
      if (!project.confirmedOfferVersionId) continue;
      const offer = await OfferVersionModel.findOne({ _id: project.confirmedOfferVersionId, projectId: project.id }).lean();
      if (!offer) continue;
      rezultat.push({
        projectId: project.id,
        title: project.title,
        status: project.status,
        date: project.createdAt,
        categories: project.categories ?? [],
        items: (offer.items ?? [])
          .filter((item: any) => item.unit !== 'storitev')
          .map((item: any) => ({ name: item.name, quantity: item.quantity })),
      });
    }
    return res.json({ ok: true, clientId: String(client._id), projects: rezultat });
  } catch (error) {
    (req as any).log?.error({ err: error }, '[web-inquiries] equipment');
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Opreme ni mogoče prebrati.' });
  }
});

// Povpraševanja in ponudbe stranke (za portal "Moje ponudbe") - samo branje,
// server-to-server. Povzetek brez postavk in brez internih opomb (defaultsApplied).
internalRouter.get('/inquiries', async (req: Request, res: Response) => {
  try {
    const naslov = resolveClientQuery(req);
    if (naslov.error) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: naslov.error });
    }
    let clientId = naslov.clientId;
    if (!clientId) {
      const { CrmClientModel } = await import('../crm/schemas/client');
      const client = await CrmClientModel.findOne({ email: naslov.email, isActive: true }).lean();
      clientId = client ? String(client._id) : null;
    }
    const inquiries = await WebInquiryModel.find(
      naslov.clientId ? { clientId: naslov.clientId } : { 'contact.email': naslov.email }
    )
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return res.json({
      ok: true,
      clientId,
      inquiries: inquiries.map((inquiry) => ({
        id: String(inquiry._id),
        createdAt: inquiry.createdAt,
        pillar: inquiry.pillar,
        pillarLabel: PILLAR_LABELS[inquiry.pillar] ?? inquiry.pillar,
        status: inquiry.status,
        offerNumber: inquiry.offerNumber ?? null,
        offerTotalWithVat: inquiry.offerTotalWithVat ?? null,
        nextStep: inquiry.nextStep ? { choice: inquiry.nextStep.choice, chosenAt: inquiry.nextStep.chosenAt } : null,
        projectId: inquiry.projectId ?? null,
      })),
    });
  } catch (error) {
    (req as any).log?.error({ err: error }, '[web-inquiries] inquiries');
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Povpraševanj ni mogoče prebrati.' });
  }
});

// AIN-P2-08 rez 3: portalni servisni zahtevki (ECO-28). Interni (server-to-server)
// klic iz portala z internim ključem; klient je določen s clientId/email.
const SYSTEM_CTX: ActorContext = { tenantId: 'inteligent', actorUserId: '', actorEmployeeId: null, roles: [] };

async function resolveClientId(naslov: { clientId: string | null; email: string | null }): Promise<string | null> {
  if (naslov.clientId) return naslov.clientId;
  const { CrmClientModel } = await import('../crm/schemas/client');
  const client = await CrmClientModel.findOne({ email: naslov.email, isActive: true }).lean();
  return client ? String(client._id) : null;
}

// Bralni pregled zahtevkov stranke (portal: seznam + statusi).
internalRouter.get('/service-tickets', async (req: Request, res: Response) => {
  try {
    const naslov = resolveClientQuery(req);
    if (naslov.error) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: naslov.error });
    const clientId = await resolveClientId(naslov);
    // Portal: praviloma je klient v CRM (clientId), a zahtevke brez CRM povezave
    // beremo prek kontaktnega e-naslova (fallback).
    const tickets = await listServiceTickets(SYSTEM_CTX, clientId ? { clientId } : { email: naslov.email });
    return res.json({
      ok: true,
      clientId,
      tickets: tickets.map((t) => ({
        id: String(t._id),
        createdAt: t.createdAt,
        status: t.status,
        subject: t.subject,
        description: t.description,
        priority: t.priority,
        source: t.source,
        scheduledAt: t.scheduledAt ?? null,
        resolvedAt: t.resolvedAt ?? null,
        projectId: t.projectId ?? null,
      })),
    });
  } catch (error) {
    (req as any).log?.error({ err: error }, '[web-inquiries] service-tickets read');
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Servisnih zahtevkov ni mogoče prebrati.' });
  }
});

// Oddaja servisnega zahtevka iz portala (intake). Klient iz clientId/email +
// kontakt/predmet/opis. Sproži kolo pravilo service.ticket_intake (privzeto OFF).
internalRouter.post('/service-tickets', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const naslov = resolveClientQuery({ query: { clientId: body.clientId, email: body.email } } as any);
    if (naslov.error) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: naslov.error });
    const subject = String(body.subject ?? '').trim();
    if (!subject) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'Predmet zahtevka je obvezen.' });

    const clientId = await resolveClientId(naslov);
    const ticket = await createServiceTicket(SYSTEM_CTX, {
      subject,
      description: body.description,
      source: 'portal',
      priority: body.priority,
      client: { id: clientId ?? undefined, name: body.clientName },
      projectId: body.projectId,
      contact: { name: body.contactName, email: naslov.email ?? body.email, phone: body.phone },
      dedupeKey: body.dedupeKey ? `portal:${String(body.dedupeKey).slice(0, 180)}` : undefined,
      createdByKind: 'portal',
    });
    // Kolo: triaža zahtevka (fire-and-forget).
    fireRule(
      onServiceTicketReported({
        _id: ticket._id as mongoose.Types.ObjectId,
        subject: ticket.subject,
        description: ticket.description,
        priority: ticket.priority,
        source: ticket.source,
        client: { id: ticket.client?.id, name: ticket.client?.name },
        contact: { phone: ticket.contact?.phone, email: ticket.contact?.email },
      }),
      'service.ticket_intake',
    );
    return res.status(201).json({ ok: true, ticketId: String(ticket._id), status: ticket.status });
  } catch (error) {
    if (error instanceof WebInquiryError) {
      return res.status(error.statusCode).json({ ok: false, code: error.code, message: error.message });
    }
    if ((error as any)?.statusCode) {
      return res.status((error as any).statusCode).json({ ok: false, code: 'VALIDATION_ERROR', message: (error as any).message });
    }
    (req as any).log?.error({ err: error }, '[web-inquiries] service-tickets intake');
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Servisnega zahtevka ni bilo mogoče oddati.' });
  }
});

// ECO-29: seznam dokumentov stranke (ponudbe/računi) s podpisanimi žetoni (interni).
internalRouter.get('/documents', async (req: Request, res: Response) => {
  try {
    const naslov = resolveClientQuery(req);
    if (naslov.error) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: naslov.error });
    const { clientId, documents } = await listClientDocuments(naslov);
    return res.json({ ok: true, clientId, documents });
  } catch (error) {
    (req as any).log?.error({ err: error }, '[web-inquiries] documents list');
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Dokumentov ni mogoče prebrati.' });
  }
});

// ECO-29: prenos dokumenta prek PODPISANEGA žetona (server-to-server iz portala z
// internim ključem; brskalnik govori samo s portalom). Žeton je kratkoživ in vezan
// na stranko+dokument. PDF se generira na zahtevo.
internalRouter.get('/documents/download', async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token ?? '');
    const result = await generateClientDocument(token);
    if ('error' in result) {
      const status = result.error === 'INVALID' ? 403 : 404;
      const message = result.error === 'INVALID' ? 'Povezava ni veljavna ali je potekla.' : 'Dokument ni na voljo.';
      return res.status(status).json({ ok: false, code: result.error, message });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.end(result.buffer);
  } catch (error) {
    (req as any).log?.error({ err: error }, '[web-inquiries] document download');
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Dokumenta ni mogoče pripraviti.' });
  }
});

router.get('/reviews', async (_req: Request, res: Response) => {
  try {
    return res.json({ ok: true, ...(await listApprovedReviews()) });
  } catch (error) {
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Ocen ni mogoče naložiti.' });
  }
});

router.get('/reviews/by-token/:token', async (req: Request, res: Response) => {
  const review = await getReviewByToken(String(req.params.token));
  if (!review) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Povezava ni veljavna.' });
  return res.json({ ok: true, name: review.name, submitted: Boolean(review.submittedAt) });
});

router.post('/reviews/by-token/:token', async (req: Request, res: Response) => {
  try {
    const result = await submitReview(String(req.params.token), Number(req.body?.rating), String(req.body?.comment ?? ''));
    if (!result.ok) {
      const sporocila: Record<string, string> = {
        NOT_FOUND: 'Povezava ni veljavna.',
        ALREADY_SUBMITTED: 'Ocena je bila že oddana. Hvala!',
        VALIDATION_ERROR: 'Izberite oceno od 1 do 5 zvezdic.',
      };
      return res.status(400).json({ ok: false, code: result.code, message: sporocila[result.code] });
    }
    return res.json({ ok: true, rating: result.rating, googleReviewUrl: result.googleReviewUrl });
  } catch (error) {
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Ocene ni bilo mogoče shraniti.' });
  }
});

const NEXT_STEP_MESSAGES: Record<string, string> = {
  avans: 'Hvala za potrditev. Kontaktirali vas bomo s podatki za plačilo avansa in dogovorom o terminu montaže.',
  posvet: 'Zabeleženo - poklicali vas bomo za kratek telefonski posvet.',
  ogled: 'Zabeleženo - kontaktirali vas bomo za termin strokovnega ogleda (50 € z DDV + potni stroški; ob izvedbi se 50 € prizna kot popust).',
  shrani: 'Ponudba je shranjena. Na e-naslovu jo imate na voljo, kadarkoli se lahko oglasite.',
};

router.post('/inquiries/:id/next-step', async (req: Request, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(String(req.params.id))) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'Neveljaven ID povpraševanja.' });
    }
    const choice = String(req.body?.choice ?? '').trim();
    if (!Object.keys(NEXT_STEP_MESSAGES).includes(choice)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'Neveljavna izbira (avans | posvet | ogled | shrani).' });
    }
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
    const inquiry = await WebInquiryModel.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Povpraševanje ni najdeno.' });
    }
    inquiry.nextStep = { choice: choice as any, note, chosenAt: new Date() };
    // AIN-P1-11: kolo — stranka je izbrala naslednji korak (posvet/ogled/avans).
    fireRule(onWebInquiryNextStep(inquiry, choice), 'inquiry.next_step');
    await inquiry.save();
    return res.json({ ok: true, message: NEXT_STEP_MESSAGES[choice] });
  } catch (error) {
    (req as any).log?.error({ err: error }, '[web-inquiries] Napaka pri naslednjem koraku');
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Izbire ni bilo mogoče shraniti.' });
  }
});

export default router;
