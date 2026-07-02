import { Router, type Request, type Response } from 'express';
import { ProductModel } from '../cenik/product.model';
import { getWebInquirySettings, WebInquirySettingsModel } from './web-inquiry-settings.model';
import { WebInquiryModel } from './web-inquiry.model';

const router = Router();

async function serializeSettings() {
  const settings = await getWebInquirySettings();
  const video = settings.videonadzor;
  const productIds = [video.wifiCameraProductId, video.wiredCameraProductId].filter(Boolean);
  const products = productIds.length > 0 ? await ProductModel.find({ _id: { $in: productIds } }).lean() : [];
  const productById = new Map<string, any>(products.map((product) => [String(product._id), product]));

  function productInfo(productId: unknown) {
    if (!productId) return null;
    const product = productById.get(String(productId));
    return product ? { id: String(product._id), name: product.ime, price: product.prodajnaCena } : null;
  }

  return {
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
      }))
    );
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Napaka pri branju povpraševanj.', 500);
  }
});

export default router;
