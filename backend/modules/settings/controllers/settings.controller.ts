import { Request, Response } from 'express';
import { getSettings, updateSettings, SettingsUpdate, ensureSettingsDocument } from '../settings.service';

function validatePayload(body: unknown): SettingsUpdate {
  if (typeof body !== 'object' || body === null) {
    return {};
  }
  const payload = body as Record<string, unknown>;
  const documentPrefix = typeof payload.documentPrefix === 'object' && payload.documentPrefix !== null
    ? (payload.documentPrefix as Record<string, unknown>)
    : undefined;

  return {
    companyName: typeof payload.companyName === 'string' ? payload.companyName : undefined,
    address: typeof payload.address === 'string' ? payload.address : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    phone: typeof payload.phone === 'string' ? payload.phone : undefined,
    logoUrl: typeof payload.logoUrl === 'string' ? payload.logoUrl : undefined,
    primaryColor: typeof payload.primaryColor === 'string' ? payload.primaryColor : undefined,
    defaultPaymentTerms:
      typeof payload.defaultPaymentTerms === 'string' ? payload.defaultPaymentTerms : undefined,
    disclaimer: typeof payload.disclaimer === 'string' ? payload.disclaimer : undefined,
    documentPrefix: documentPrefix
      ? {
          offer: typeof documentPrefix.offer === 'string' ? documentPrefix.offer : undefined,
          invoice: typeof documentPrefix.invoice === 'string' ? documentPrefix.invoice : undefined,
          order: typeof documentPrefix.order === 'string' ? documentPrefix.order : undefined,
          deliveryNote:
            typeof documentPrefix.deliveryNote === 'string' ? documentPrefix.deliveryNote : undefined,
          workOrder: typeof documentPrefix.workOrder === 'string' ? documentPrefix.workOrder : undefined
        }
      : undefined
  };
}

export async function getSettingsController(_req: Request, res: Response) {
  try {
    const settings = await getSettings();
    res.success(settings);
  } catch (error) {
    console.error('Napaka pri pridobivanju nastavitev:', error);
    try {
      const fallback = await ensureSettingsDocument();
      res.success(fallback);
    } catch (secondError) {
      console.error('Napaka pri inicializaciji nastavitev:', secondError);
      res.fail('Nastavitev ni mogoče naložiti.', 500);
    }
  }
}

export async function updateSettingsController(req: Request, res: Response) {
  try {
    const payload = validatePayload(req.body);
    if (!payload.companyName || !payload.address) {
      return res.fail('Naziv podjetja in naslov sta obvezna.', 400);
    }
    const updated = await updateSettings(payload);
    res.success(updated);
  } catch (error) {
    console.error('Napaka pri posodabljanju nastavitev:', error);
    res.fail('Nastavitev ni mogoče shraniti.', 500);
  }
}
