import { Router, type Request, type Response } from 'express';
import {
  getShopSettings,
  isShopSyncRunning,
  startShopSyncInBackground,
  upsertShopSettings,
} from './woocommerce-sync.service';

const router = Router();

// Nastavitve trgovine (skrivnost se nikoli ne vrača v celoti).
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await getShopSettings();
    if (!settings) return res.success({ configured: false });
    return res.success({
      configured: true,
      baseUrl: settings.baseUrl,
      consumerKey: `…${settings.consumerKey.slice(-6)}`,
      lastSync: settings.lastSync ?? null,
    });
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Nastavitev ni bilo mogoče naložiti.', 500);
  }
});

router.put('/settings', async (req: Request, res: Response) => {
  try {
    await upsertShopSettings({
      baseUrl: req.body?.baseUrl,
      consumerKey: req.body?.consumerKey,
      consumerSecret: req.body?.consumerSecret,
    });
    return res.success({ ok: true });
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Nastavitev ni bilo mogoče shraniti.', 400);
  }
});

// Zažene prenos produktov v WooCommerce v ozadju (traja nekaj minut).
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    const settings = await getShopSettings();
    if (!settings) return res.fail('Trgovina ni nastavljena (manjkajo WooCommerce nastavitve).', 400);
    const result = startShopSyncInBackground();
    if (!result.started) return res.fail(result.reason ?? 'Sinhronizacija že teče.', 409);
    return res.success({ started: true });
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Sinhronizacije ni bilo mogoče zagnati.', 500);
  }
});

router.get('/sync/status', async (_req: Request, res: Response) => {
  try {
    const settings = await getShopSettings();
    return res.success({ running: isShopSyncRunning(), lastSync: settings?.lastSync ?? null });
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Stanja ni bilo mogoče prebrati.', 500);
  }
});

export default router;
