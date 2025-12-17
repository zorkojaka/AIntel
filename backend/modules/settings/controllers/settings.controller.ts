import { Request, Response } from 'express';
import { getSettings, updateSettings, SettingsUpdate, ensureSettingsDocument } from '../settings.service';

function pickString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function validatePayload(body: unknown): SettingsUpdate {
  if (typeof body !== 'object' || body === null) {
    return {};
  }
  const payload = body as Record<string, unknown>;
  const documentPrefix =
    typeof payload.documentPrefix === 'object' && payload.documentPrefix !== null
      ? (payload.documentPrefix as Record<string, unknown>)
      : undefined;

  const numberingRaw =
    typeof payload.documentNumbering === 'object' && payload.documentNumbering !== null
      ? (payload.documentNumbering as Record<string, unknown>)
      : undefined;
  const numberingOffer =
    numberingRaw && typeof numberingRaw.offer === 'object' && numberingRaw.offer !== null
      ? (numberingRaw.offer as Record<string, unknown>)
      : undefined;
  const resetValue = typeof numberingOffer?.reset === 'string' ? numberingOffer.reset : undefined;

  return {
    companyName: pickString(payload.companyName),
    address: pickString(payload.address),
    postalCode: pickString(payload.postalCode),
    city: pickString(payload.city),
    country: pickString(payload.country),
    email: pickString(payload.email),
    phone: pickString(payload.phone),
    website: pickString(payload.website),
    logoUrl: pickString(payload.logoUrl),
    primaryColor: pickString(payload.primaryColor),
    defaultPaymentTerms: pickString(payload.defaultPaymentTerms),
    disclaimer: pickString(payload.disclaimer),
    iban: pickString(payload.iban),
    vatId: pickString(payload.vatId),
    directorName: pickString(payload.directorName),
    notes: Array.isArray(payload.notes) ? (payload.notes as SettingsUpdate['notes']) : undefined,
    noteDefaultsByDoc:
      typeof payload.noteDefaultsByDoc === 'object' && payload.noteDefaultsByDoc !== null
        ? (payload.noteDefaultsByDoc as SettingsUpdate['noteDefaultsByDoc'])
        : undefined,
    documentPrefix: documentPrefix
      ? {
          offer: pickString(documentPrefix.offer),
          invoice: pickString(documentPrefix.invoice),
          order: pickString(documentPrefix.order),
          deliveryNote: pickString(documentPrefix.deliveryNote),
          workOrder: pickString(documentPrefix.workOrder),
        }
      : undefined,
    documentNumbering: numberingOffer
      ? {
          offer: {
            pattern: pickString(numberingOffer.pattern),
            reset: resetValue === 'never' ? 'never' : resetValue === 'yearly' ? 'yearly' : undefined,
            yearOverride: typeof numberingOffer.yearOverride === 'number' ? numberingOffer.yearOverride : undefined,
            seqOverride: typeof numberingOffer.seqOverride === 'number' ? numberingOffer.seqOverride : undefined,
          },
        }
      : undefined,
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
