import { Router, type Request, type Response } from 'express';
import { ProductModel } from '../cenik/product.model';
import { getWebInquirySettings, WebInquirySettingsModel } from './web-inquiry-settings.model';
import { WebInquiryModel } from './web-inquiry.model';
import { ReviewModel } from '../reviews/review.model';

const router = Router();

const ALARM_POLJA = ['centralaProductId', 'centrala2ProductId', 'sensorAProductId', 'sensorBProductId', 'sensorCProductId', 'sirenaZunanjaProductId', 'sirenaNotranjaProductId', 'tipkovnicaProductId', 'pozarProductId', 'coProductId'] as const;
const DOMOFON_POLJA = ['notranjaEnotaProductId', 'zunanjaEnotaProductId'] as const;
const DOM_POLJA = ['modulLuciProductId', 'modulSencilProductId'] as const;

async function serializeSettings() {
  const settings = await getWebInquirySettings();
  const video = settings.videonadzor;
  const productIds = [
    video.wifiCameraProductId, video.wiredCameraProductId,
    ...ALARM_POLJA.map((polje) => (settings.alarm as any)[polje]),
    ...DOMOFON_POLJA.map((polje) => (settings.domofon as any)[polje]),
    ...DOM_POLJA.map((polje) => (settings.pametniDom as any)[polje]),
  ].filter(Boolean);
  const products = productIds.length > 0 ? await ProductModel.find({ _id: { $in: productIds } }).lean() : [];
  const productById = new Map<string, any>(products.map((product) => [String(product._id), product]));

  function productInfo(productId: unknown) {
    if (!productId) return null;
    const product = productById.get(String(productId));
    return product ? { id: String(product._id), name: product.ime, price: product.prodajnaCena } : null;
  }

  function sklop(source: any, polja: readonly string[]) {
    const out: Record<string, unknown> = { scenario: source.scenario };
    for (const polje of polja) {
      out[polje] = source[polje] ? String(source[polje]) : null;
      out[polje.replace('ProductId', 'Product')] = productInfo(source[polje]);
    }
    return out;
  }

  return {
    popusti: (settings as any).popusti ?? [],
    alarm: sklop(settings.alarm, ALARM_POLJA),
    domofon: sklop(settings.domofon, DOMOFON_POLJA),
    pametniDom: sklop(settings.pametniDom, DOM_POLJA),
    enabled: settings.enabled,
    autoSendEmail: settings.autoSendEmail,
    emailTemplateKey: settings.emailTemplateKey,
    videonadzor: {
      wifiCameraProductId: video.wifiCameraProductId ? String(video.wifiCameraProductId) : null,
      wifiCameraProduct: productInfo(video.wifiCameraProductId),
      wiredCameraProductId: video.wiredCameraProductId ? String(video.wiredCameraProductId) : null,
      wiredCameraProduct: productInfo(video.wiredCameraProductId),
      includeBrackets: video.includeBrackets,
      dniSnemanja: video.dniSnemanja,
      motionRecord: video.motionRecord,
      scenarioWifi: video.scenarioWifi,
      scenarioWiringReady: video.scenarioWiringReady,
      scenarioWiringNotReady: video.scenarioWiringNotReady,
      napeljavaUrPerCamera: video.napeljavaUrPerCamera,
      utpKabelMetrovPerCamera: video.utpKabelMetrovPerCamera,
      kanalMetrovPerCamera: video.kanalMetrovPerCamera,
    },
    apiKeyConfigured: Boolean(process.env.AINTEL_WEB_INQUIRY_API_KEY?.trim()),
  };
}

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    return res.success(await serializeSettings());
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Napaka pri branju nastavitev.', 500);
  }
});

router.put('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await getWebInquirySettings();
    const body = req.body ?? {};

    if (typeof body.enabled === 'boolean') settings.enabled = body.enabled;
    if (typeof body.autoSendEmail === 'boolean') settings.autoSendEmail = body.autoSendEmail;
    if (body.emailTemplateKey !== undefined) {
      settings.emailTemplateKey = typeof body.emailTemplateKey === 'string' && body.emailTemplateKey.trim()
        ? body.emailTemplateKey.trim()
        : null;
    }

    const video = body.videonadzor ?? {};
    const target = settings.videonadzor;
    if (video.wifiCameraProductId !== undefined) target.wifiCameraProductId = video.wifiCameraProductId || null;
    if (video.wiredCameraProductId !== undefined) target.wiredCameraProductId = video.wiredCameraProductId || null;
    if (typeof video.includeBrackets === 'boolean') target.includeBrackets = video.includeBrackets;
    if (typeof video.motionRecord === 'boolean') target.motionRecord = video.motionRecord;
    for (const field of ['dniSnemanja', 'napeljavaUrPerCamera', 'utpKabelMetrovPerCamera', 'kanalMetrovPerCamera'] as const) {
      const value = Number(video[field]);
      if (Number.isFinite(value) && value >= 0) target[field] = value;
    }
    for (const field of ['scenarioWifi', 'scenarioWiringReady', 'scenarioWiringNotReady'] as const) {
      if (['posiljanje', 'izvedba', 'izvedba_napeljava'].includes(video[field])) target[field] = video[field];
    }

    for (const [kljuc, polja] of [['alarm', ALARM_POLJA], ['domofon', DOMOFON_POLJA], ['pametniDom', DOM_POLJA]] as const) {
      const vhod = body[kljuc] ?? {};
      const cilj = (settings as any)[kljuc];
      for (const polje of polja) {
        if (vhod[polje] !== undefined) cilj[polje] = vhod[polje] || null;
      }
      if (['posiljanje', 'izvedba', 'izvedba_napeljava'].includes(vhod.scenario)) cilj.scenario = vhod.scenario;
    }

    if (Array.isArray(body.popusti)) {
      (settings as any).popusti = body.popusti
        .map((prag: any) => ({ nad: Number(prag?.nad) || 0, odstotek: Number(prag?.odstotek) || 0 }))
        .filter((prag: any) => prag.nad > 0 && prag.odstotek > 0 && prag.odstotek <= 50)
        .slice(0, 10);
    }

    await settings.save();
    return res.success(await serializeSettings());
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Napaka pri shranjevanju nastavitev.', 500);
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const inquiries = await WebInquiryModel.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    return res.success(
      inquiries.map((inquiry) => ({
        id: String(inquiry._id),
        createdAt: inquiry.createdAt,
        pillar: inquiry.pillar,
        status: inquiry.status,
        contact: inquiry.contact,
        payload: inquiry.payload,
        projectId: inquiry.projectId,
        offerNumber: inquiry.offerNumber,
        offerTotalWithVat: inquiry.offerTotalWithVat,
        emailSent: inquiry.emailSent,
        defaultsApplied: inquiry.defaultsApplied,
        errorMessage: inquiry.errorMessage,
        meta: inquiry.meta ?? {},
        nextStep: inquiry.nextStep ?? null,
        photos: inquiry.photos ?? [],
      }))
    );
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Napaka pri branju povpraševanj.', 500);
  }
});

router.get('/reviews', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const reviews = await ReviewModel.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    return res.success(reviews.map((review) => ({
      id: String(review._id),
      projectId: review.projectId,
      name: review.name,
      pillar: review.pillar,
      status: review.status,
      rating: review.rating,
      comment: review.comment,
      emailSentAt: review.emailSentAt,
      submittedAt: review.submittedAt,
    })));
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Napaka pri branju ocen.', 500);
  }
});

router.put('/reviews/:id/status', async (req: Request, res: Response) => {
  try {
    const status = String(req.body?.status ?? '');
    if (!['odobreno', 'skrito'].includes(status)) return res.fail('Dovoljena statusa: odobreno, skrito.', 400);
    const review = await ReviewModel.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
    if (!review) return res.fail('Ocena ni najdena.', 404);
    return res.success({ id: String(review._id), status: review.status });
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Napaka pri posodobitvi ocene.', 500);
  }
});

export default router;
