import cors from 'cors';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { getWebInquiryOptions, processWebInquiry, validateWebInquiryPayload, WebInquiryError } from './web-inquiry.service';
import { WebInquiryModel } from './web-inquiry.model';

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
        ? { offerNumber: result.offerNumber, totalWithVat: result.offerTotalWithVat, currency: 'EUR', emailSent: result.emailSent }
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

export default router;
