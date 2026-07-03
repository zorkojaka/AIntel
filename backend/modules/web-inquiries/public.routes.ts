import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import mongoose from 'mongoose';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { getWebInquiryOptions, getWebIzdelki, processWebInquiry, validateWebInquiryPayload, WebInquiryError } from './web-inquiry.service';
import { WebInquiryModel } from './web-inquiry.model';
import { getReviewByToken, listApprovedReviews, submitReview } from '../reviews/review.service';

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

function clientIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
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

const router = Router();

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
      return res.json({
        ok: true,
        inquiryId: String(duplicate._id),
        message:
          duplicate.status === 'ponudba_poslana'
            ? 'Povpraševanje smo že prejeli – informativna ponudba je bila poslana na vaš e-naslov.'
            : 'Povpraševanje smo že prejeli in ga obdelujemo.',
        offerSummary: duplicate.offerNumber
          ? { offerNumber: duplicate.offerNumber, totalWithVat: duplicate.offerTotalWithVat, currency: 'EUR' }
          : undefined,
        duplicate: true,
      });
    }

    const result = await processWebInquiry(payload);
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
          }
        : undefined,
    });
  } catch (error) {
    if (error instanceof WebInquiryError) {
      return res.status(error.statusCode).json({ ok: false, code: error.code, message: error.message });
    }
    console.error('[web-inquiries] Nepričakovana napaka', error);
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
      console.error('[web-inquiries] Napaka pri shranjevanju slik', error);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Slik ni bilo mogoče shraniti.' });
    }
  });
});

// Oprema stranke (za portal "Moja oprema") - samo branje, server-to-server.
router.get('/clients/equipment', async (req: Request, res: Response) => {
  try {
    const email = String(req.query.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'Neveljaven e-naslov.' });
    }
    const { CrmClientModel } = await import('../crm/schemas/client');
    const { ProjectModel } = await import('../projects/schemas/project');
    const { OfferVersionModel } = await import('../projects/schemas/offer-version');

    const client = await CrmClientModel.findOne({ email, isActive: true }).lean();
    if (!client) return res.json({ ok: true, projects: [] });

    const projects = await ProjectModel.find({ 'customer.name': client.name })
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
    return res.json({ ok: true, projects: rezultat });
  } catch (error) {
    console.error('[web-inquiries] equipment', error);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Opreme ni mogoče prebrati.' });
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
    await inquiry.save();
    return res.json({ ok: true, message: NEXT_STEP_MESSAGES[choice] });
  } catch (error) {
    console.error('[web-inquiries] Napaka pri naslednjem koraku', error);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Izbire ni bilo mogoče shraniti.' });
  }
});

export default router;
