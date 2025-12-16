import { NextFunction, Request, Response } from 'express';
import {
  getCompanySettings,
  updateCompanySettings,
  getPdfDocumentSettings,
  updatePdfDocumentSettings,
} from '../services/pdf-settings.service';
import { buildOfferPdfPreviewPayload } from '../services/offer-pdf-preview.service';

function parseDocType(req: Request) {
  const docType = typeof req.query.docType === 'string' ? req.query.docType : undefined;
  return docType ?? 'OFFER';
}

export async function getPdfCompanySettingsController(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await getCompanySettings();
    res.success(settings);
  } catch (error) {
    next(error);
  }
}

export async function updatePdfCompanySettingsController(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body ?? {};
    if (!payload?.companyName || !payload?.address) {
      return res.fail('Naziv podjetja in naslov sta obvezna.', 400);
    }
    const updated = await updateCompanySettings(payload);
    res.success(updated);
  } catch (error) {
    next(error);
  }
}

export async function getPdfDocumentSettingsController(req: Request, res: Response, next: NextFunction) {
  try {
    const docType = parseDocType(req);
    const settings = await getPdfDocumentSettings(docType);
    res.success(settings);
  } catch (error) {
    next(error);
  }
}

export async function updatePdfDocumentSettingsController(req: Request, res: Response, next: NextFunction) {
  try {
    const docType = parseDocType(req);
    const updated = await updatePdfDocumentSettings(docType, req.body ?? {});
    res.success(updated);
  } catch (error) {
    next(error);
  }
}

export async function getOfferPdfPreviewController(req: Request, res: Response, next: NextFunction) {
  try {
    const { offerVersionId } = req.params;
    const docType = parseDocType(req);
    const allowDemo =
      req.query.fallback === 'demo' ||
      req.query.allowDemo === '1' ||
      req.query.allowDemo === 'true' ||
      offerVersionId === 'demo';
    const payload = await buildOfferPdfPreviewPayload(offerVersionId, { docType, allowDemo });
    res.success(payload);
  } catch (error) {
    if ((error as Error).message?.includes('Ponudba ni najdena')) {
      res.fail('Ponudba ni najdena.', 404);
      return;
    }
    next(error);
  }
}
