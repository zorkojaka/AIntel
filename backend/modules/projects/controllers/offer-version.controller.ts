import { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import http from 'http';
import https from 'https';
import type { OfferLineItem, OfferStatus, OfferVersion } from '../../../../shared/types/offers';
import { OfferVersionModel } from '../schemas/offer-version';
import { ProductModel } from '../../cenik/product.model';
import { ProjectModel, type ProjectDocument } from '../schemas/project';
import { renderHtmlToPdf } from '../services/html-pdf.service';
import {
  buildOfferTemplateTokens,
  getDefaultTemplate,
  renderTemplateContent,
} from '../services/template-render.service';

function clampNumber(value: unknown, fallback = 0, min = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function normalizeText(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.normalize('NFC').trim();
  if (value === undefined || value === null) return fallback;
  return String(value).normalize('NFC').trim();
}

function sanitizeLineItem(raw: unknown): OfferLineItem | null {
  const item = raw as Record<string, unknown>;
  const name = normalizeText(item?.name);
  const quantity = clampNumber(item?.quantity, 1, 0);
  const unitPrice = clampNumber(item?.unitPrice, 0, 0);
  const vatRate = clampNumber(item?.vatRate, 22, 0);
  const unit = normalizeText(item?.unit, 'kos') || 'kos';
  const discountPercent = clampNumber(item?.discountPercent, 0, 0);

  if (!name || unitPrice <= 0) return null;

  const totalNet = Number((quantity * unitPrice).toFixed(2));
  const totalVat = Number((totalNet * (vatRate / 100)).toFixed(2));
  const totalGross = Number((totalNet + totalVat).toFixed(2));

  return {
    id: item?.id ? String(item.id) : new Types.ObjectId().toString(),
    productId: item?.productId ? String(item.productId) : null,
    name,
    quantity,
    unit,
    unitPrice,
    vatRate,
    discountPercent,
    totalNet,
    totalVat,
    totalGross,
  };
}

function calculateOfferTotals(offer: {
  items: OfferLineItem[];
  usePerItemDiscount: boolean;
  useGlobalDiscount: boolean;
  globalDiscountPercent: number;
  vatMode: number;
}) {
  const { items, usePerItemDiscount, useGlobalDiscount, globalDiscountPercent, vatMode } = offer;

  const baseWithoutVat = items.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.quantity || 0), 0);

  const perItemDiscountAmount = usePerItemDiscount
    ? items.reduce((sum, item) => {
        const pct = clampNumber(item.discountPercent, 0, 0);
        const lineNet = (item.unitPrice || 0) * (item.quantity || 0);
        return sum + (lineNet * pct) / 100;
      }, 0)
    : 0;

  const baseAfterPerItem = baseWithoutVat - perItemDiscountAmount;

  const normalizedGlobalPct = useGlobalDiscount ? Math.min(100, Math.max(0, Number(globalDiscountPercent) || 0)) : 0;
  const globalDiscountAmount = normalizedGlobalPct > 0 ? (baseAfterPerItem * normalizedGlobalPct) / 100 : 0;

  const baseAfterDiscount = baseAfterPerItem - globalDiscountAmount;

  const vatMultiplier = vatMode === 22 ? 0.22 : vatMode === 9.5 ? 0.095 : 0;
  const vatAmount = baseAfterDiscount * vatMultiplier;

  const totalNetAfterDiscount = baseAfterDiscount;
  const totalGrossAfterDiscount = totalNetAfterDiscount + vatAmount;

  const round2 = (value: number) => Number(value.toFixed(2));

  return {
    baseWithoutVat: round2(baseWithoutVat),
    perItemDiscountAmount: round2(perItemDiscountAmount),
    globalDiscountAmount: round2(globalDiscountAmount),
    baseAfterDiscount: round2(baseAfterDiscount),
    vatAmount: round2(vatAmount),
    totalNet: round2(baseAfterDiscount),
    totalVat22: vatMode === 22 ? round2(vatAmount) : 0,
    totalVat95: vatMode === 9.5 ? round2(vatAmount) : 0,
    totalVat: round2(vatAmount),
    totalGross: round2(totalGrossAfterDiscount),
    discountPercent: normalizedGlobalPct,
    discountAmount: round2(perItemDiscountAmount + globalDiscountAmount),
    totalNetAfterDiscount: round2(totalNetAfterDiscount),
    totalGrossAfterDiscount: round2(totalGrossAfterDiscount),
    totalWithVat: round2(totalGrossAfterDiscount),
    vatMode,
  };
}

function extractBaseTitle(rawTitle?: string) {
  const title = (rawTitle || 'Ponudba').trim();
  const match = title.match(/^(.*)_\d+$/);
  return (match?.[1] || title).trim() || 'Ponudba';
}

async function getNextVersionNumber(projectId: string, baseTitle: string) {
  const last = await OfferVersionModel.findOne({ projectId, baseTitle }).sort({ versionNumber: -1 }).lean();
  return last ? (last.versionNumber || 0) + 1 : 1;
}

function serializeOffer(offer: OfferVersion) {
  return {
    ...offer,
    validUntil: offer.validUntil ? new Date(offer.validUntil).toISOString() : null,
    createdAt: offer.createdAt ? new Date(offer.createdAt).toISOString() : '',
    updatedAt: offer.updatedAt ? new Date(offer.updatedAt).toISOString() : '',
    discountPercent: offer.discountPercent ?? 0,
    globalDiscountPercent: offer.globalDiscountPercent ?? offer.discountPercent ?? 0,
    discountAmount: offer.discountAmount ?? 0,
    totalNetAfterDiscount: offer.totalNetAfterDiscount ?? offer.totalNet ?? 0,
    totalGrossAfterDiscount: offer.totalGrossAfterDiscount ?? offer.totalGross ?? 0,
    useGlobalDiscount: offer.useGlobalDiscount ?? true,
    usePerItemDiscount: offer.usePerItemDiscount ?? false,
    vatMode: (offer.vatMode as number) ?? 22,
    baseWithoutVat: offer.baseWithoutVat ?? 0,
    perItemDiscountAmount: offer.perItemDiscountAmount ?? 0,
    globalDiscountAmount: offer.globalDiscountAmount ?? offer.discountAmount ?? 0,
    baseAfterDiscount: offer.baseAfterDiscount ?? offer.totalNetAfterDiscount ?? 0,
    vatAmount: offer.vatAmount ?? offer.totalVat ?? 0,
    totalWithVat: offer.totalWithVat ?? offer.totalGrossAfterDiscount ?? offer.totalGross ?? 0,
    comment: offer.comment ?? null,
  } as OfferVersion;
}

export async function saveOfferVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const body = req.body ?? {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems
      .map((raw: unknown) => sanitizeLineItem(raw))
      .filter((item: OfferLineItem | null): item is OfferLineItem => !!item);

    if (!items.length) {
      return res.fail('Ponudba mora vsebovati vsaj eno veljavno postavko.', 400);
    }

    const totals = calculateOfferTotals({
      items,
      usePerItemDiscount: body?.usePerItemDiscount ?? false,
      useGlobalDiscount: body?.useGlobalDiscount ?? true,
      globalDiscountPercent: body?.globalDiscountPercent ?? body?.discountPercent ?? 0,
      vatMode: body?.vatMode ?? 22,
    });

    const now = new Date();
    const validUntilValue = body?.validUntil;
    const validUntil =
      validUntilValue && !Number.isNaN(new Date(validUntilValue).valueOf()) ? new Date(validUntilValue) : null;

    const baseTitle = extractBaseTitle(body?.title);
    const versionNumber = await getNextVersionNumber(projectId, baseTitle);
    const title = `${baseTitle}_${versionNumber}`;

    const payload: Omit<OfferVersion, '_id'> = {
      projectId,
      baseTitle,
      versionNumber,
      title,
      validUntil: validUntil ? validUntil.toISOString() : null,
      paymentTerms: normalizeText(body?.paymentTerms) || null,
      introText: normalizeText(body?.introText) || null,
      comment: normalizeText(body?.comment) || null,
      items,
      totalNet: totals.totalNet,
      totalVat22: totals.totalVat22,
      totalVat95: totals.totalVat95,
      totalVat: totals.totalVat,
      totalGross: totals.totalGross,
      discountPercent: totals.discountPercent,
      globalDiscountPercent: totals.discountPercent,
      discountAmount: totals.discountAmount,
      totalNetAfterDiscount: totals.totalNetAfterDiscount,
      totalGrossAfterDiscount: totals.totalGrossAfterDiscount,
      useGlobalDiscount: body?.useGlobalDiscount ?? true,
      usePerItemDiscount: body?.usePerItemDiscount ?? false,
      vatMode: body?.vatMode ?? 22,
      baseWithoutVat: totals.baseWithoutVat ?? totals.totalNet ?? 0,
      perItemDiscountAmount: totals.perItemDiscountAmount ?? 0,
      globalDiscountAmount: totals.globalDiscountAmount ?? 0,
      baseAfterDiscount: totals.baseAfterDiscount ?? totals.totalNetAfterDiscount ?? 0,
      vatAmount: totals.vatAmount ?? totals.totalVat ?? 0,
      totalWithVat: totals.totalWithVat ?? totals.totalGrossAfterDiscount ?? totals.totalGross ?? 0,
      status: (body?.status as OfferStatus) || 'draft',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const created = await OfferVersionModel.create(payload);
    const plain = created.toObject();
    return res.success(serializeOffer(plain as OfferVersion));
  } catch (err) {
    next(err);
  }
}

export async function getActiveOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const offer = await OfferVersionModel.findOne({ projectId }).sort({ createdAt: -1 }).lean();
    if (!offer) {
      return res.success(null);
    }

    return res.success(serializeOffer(offer as OfferVersion));
  } catch (err) {
    next(err);
  }
}

export async function listOffersForProject(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const offers = await OfferVersionModel.find({ projectId }).sort({ versionNumber: 1 }).lean();
    const data = offers.map((o) => ({
      _id: o._id.toString(),
      baseTitle: o.baseTitle,
      versionNumber: o.versionNumber,
      title: o.title,
      status: o.status,
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '',
      totalGross: o.totalGrossAfterDiscount ?? o.totalWithVat ?? o.totalGross ?? 0,
      totalGrossAfterDiscount: o.totalGrossAfterDiscount ?? o.totalWithVat ?? o.totalGross ?? 0,
      totalWithVat: o.totalWithVat ?? o.totalGrossAfterDiscount ?? o.totalGross ?? 0,
    }));
    return res.success(data);
  } catch (err) {
    next(err);
  }
}

export async function getOfferById(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, offerId } = req.params;
    const offer = await OfferVersionModel.findOne({ _id: offerId, projectId }).lean();
    if (!offer) return res.success(null);
    return res.success(serializeOffer(offer as OfferVersion));
  } catch (err) {
    next(err);
  }
}

export async function updateOfferVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, offerId } = req.params;
    const body = req.body ?? {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems
      .map((raw: unknown) => sanitizeLineItem(raw))
      .filter((item: OfferLineItem | null): item is OfferLineItem => !!item);

    if (!items.length) {
      return res.fail('Ponudba mora vsebovati vsaj eno veljavno postavko.', 400);
    }

    const totals = calculateOfferTotals({
      items,
      usePerItemDiscount: body?.usePerItemDiscount ?? false,
      useGlobalDiscount: body?.useGlobalDiscount ?? true,
      globalDiscountPercent: body?.globalDiscountPercent ?? body?.discountPercent ?? 0,
      vatMode: body?.vatMode ?? 22,
    });

    const existing = await OfferVersionModel.findOne({ _id: offerId, projectId });
    if (!existing) {
      return res.success(null);
    }

    existing.title = body.title ?? existing.title;
    existing.validUntil = body.validUntil ? new Date(body.validUntil).toISOString() : existing.validUntil;
    existing.paymentTerms = body.paymentTerms ?? existing.paymentTerms ?? null;
    existing.introText = body.introText ?? existing.introText ?? null;
    const normalizedComment = normalizeText(body?.comment, existing.comment ?? '');
    existing.comment = normalizedComment || null;
    existing.items = items;
    existing.totalNet = totals.totalNet;
    existing.totalVat22 = totals.totalVat22;
    existing.totalVat95 = totals.totalVat95;
    existing.totalVat = totals.totalVat;
    existing.totalGross = totals.totalGross;
    existing.discountPercent = totals.discountPercent;
    existing.globalDiscountPercent = totals.discountPercent;
    existing.discountAmount = totals.discountAmount;
    existing.totalNetAfterDiscount = totals.totalNetAfterDiscount;
    existing.totalGrossAfterDiscount = totals.totalGrossAfterDiscount;
    existing.useGlobalDiscount = body?.useGlobalDiscount ?? existing.useGlobalDiscount ?? true;
    existing.usePerItemDiscount = body?.usePerItemDiscount ?? existing.usePerItemDiscount ?? false;
    existing.vatMode = body?.vatMode ?? existing.vatMode ?? 22;
    existing.baseWithoutVat = totals.baseWithoutVat ?? existing.baseWithoutVat ?? 0;
    existing.perItemDiscountAmount = totals.perItemDiscountAmount ?? existing.perItemDiscountAmount ?? 0;
    existing.globalDiscountAmount = totals.globalDiscountAmount ?? existing.globalDiscountAmount ?? 0;
    existing.baseAfterDiscount = totals.baseAfterDiscount ?? existing.baseAfterDiscount ?? 0;
    existing.vatAmount = totals.vatAmount ?? existing.vatAmount ?? 0;
    existing.totalWithVat = totals.totalWithVat ?? existing.totalWithVat ?? existing.totalGrossAfterDiscount ?? 0;
    existing.status = body.status ?? existing.status;

    await existing.save();

    const plain = existing.toObject();
    return res.success(
      serializeOffer({
        ...(plain as OfferVersion),
        validUntil: plain.validUntil ? new Date(plain.validUntil).toISOString() : null,
        createdAt: plain.createdAt ? new Date(plain.createdAt).toISOString() : '',
        updatedAt: plain.updatedAt ? new Date(plain.updatedAt).toISOString() : '',
      })
    );
  } catch (err) {
    console.error('Failed to update offer version', err);
    next(err);
  }
}

export async function deleteOfferVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, offerId } = req.params;
    const deleted = await OfferVersionModel.findOneAndDelete({ _id: offerId, projectId });
    return res.success(!!deleted);
  } catch (err) {
    next(err);
  }
}

export async function exportOfferPdf(req: Request, res: Response) {
  const { projectId, offerVersionId } = req.params;
  const modeParam = typeof req.query.mode === 'string' ? req.query.mode.toLowerCase() : 'offer';
  const mode: 'offer' | 'project' | 'both' =
    modeParam === 'project' || modeParam === 'both' ? (modeParam as 'project' | 'both') : 'offer';
  const includeOffer = mode === 'offer' || mode === 'both';
  const includeProject = mode === 'project' || mode === 'both';

  const offer = await OfferVersionModel.findOne({ _id: offerVersionId, projectId }).lean();
  if (!offer) {
    return res.fail('Ponudba ni najdena.', 404);
  }

  const canUseTemplate = includeOffer && !includeProject;
  if (canUseTemplate) {
    try {
      const project = (await ProjectModel.findOne({ id: projectId }).lean()) as ProjectDocument | null;
      const template = project ? getDefaultTemplate(project, 'offer') : null;
      if (project && template) {
        const tokens = buildOfferTemplateTokens(project, offer);
        const html = renderTemplateContent(template.content, tokens);
        const buffer = await renderHtmlToPdf(html);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="offer-${offer._id}.pdf"`);
        res.end(buffer);
        return;
      }
    } catch (error) {
      console.error('Offer template render failed', error);
    }
  }

  renderOfferPdfFallback(res, offer, includeOffer, includeProject);
}

function renderOfferPdfFallback(
  res: Response,
  offer: OfferVersion,
  includeOffer: boolean,
  includeProject: boolean,
) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
  doc.on('end', () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="offer-${offer._id}.pdf"`);
    res.send(pdf);
  });

  (async () => {
    if (includeOffer) {
      renderOfferSection(doc, offer);
    }

    if (includeProject) {
      if (includeOffer) {
        doc.addPage();
      }
      const projectEntries = await buildProjectEntries(offer);
      await appendProjectSection(doc, projectEntries);
    }

    doc.end();
  })().catch((error) => {
    console.error('Offer PDF fallback failed', error);
    doc.end();
  });
}

function renderOfferSection(doc: PDFDocumentInstance, offer: OfferVersion) {
  doc.fontSize(18).text(offer.title || 'Ponudba', { align: 'left' });
  doc.moveDown();
  doc.fontSize(12).text(`Projekt: ${offer.projectId}`);
  if (offer.validUntil) {
    doc.text(`Velja do: ${new Date(offer.validUntil).toLocaleDateString('sl-SI')}`);
  }
  if (offer.paymentTerms) {
    doc.text(`Plačilni pogoji: ${offer.paymentTerms}`);
  }
  doc.moveDown();
  doc.text('Postavke:', { underline: true });
  doc.moveDown(0.5);

  (offer.items ?? []).forEach((item: OfferLineItem) => {
    doc.fontSize(12).text(`${item.name} (${item.quantity} ${item.unit})`);
    doc
      .fontSize(10)
      .fillColor('gray')
      .text(
        `Cena: ${item.unitPrice.toFixed(2)} | DDV ${item.vatRate}% | Neto: ${item.totalNet.toFixed(2)} | Bruto: ${item.totalGross.toFixed(2)}`
      );
    doc.moveDown(0.5);
    doc.fillColor('black');
  });

  doc.moveDown();
  doc.fontSize(12).text(`Skupaj neto: ${offer.totalNet.toFixed(2)}`);
  doc.text(`DDV 22%: ${offer.totalVat22.toFixed(2)}`);
  doc.text(`DDV 9.5%: ${offer.totalVat95.toFixed(2)}`);
  doc.text(`DDV skupaj: ${offer.totalVat.toFixed(2)}`);
  doc.fontSize(14).text(`Skupaj z DDV: ${offer.totalGross.toFixed(2)}`, { align: 'left' });

  const usableWidth =
    doc.page.width - (doc.page.margins?.left ?? 72) - (doc.page.margins?.right ?? 72);
  const commentText = offer.comment ? offer.comment.trim() : '';
  if (commentText) {
    doc.moveDown();
    doc.fontSize(12).text('Komentar', { underline: true });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .text(commentText, {
        width: usableWidth,
        align: 'left',
      });
    doc.moveDown();
  }
}

type PDFDocumentInstance = InstanceType<typeof PDFDocument>;

interface ProjectEntry {
  title: string;
  description?: string;
  imageUrl?: string;
  imageBuffer?: Buffer | null;
}

async function buildProjectEntries(offer: OfferVersion): Promise<ProjectEntry[]> {
  const items = Array.isArray(offer.items) ? offer.items : [];
  const uniqueIds = Array.from(
    new Set(
      items
        .map((item) => (item.productId ? String(item.productId) : null))
        .filter((value): value is string => !!value)
    )
  );

  let productMap = new Map<string, any>();
  if (uniqueIds.length > 0) {
    const products = await ProductModel.find({ _id: { $in: uniqueIds } }).lean();
    productMap = new Map(products.map((product) => [product._id.toString(), product]));
  }

  const seenProducts = new Set<string>();
  const entries: ProjectEntry[] = [];

  for (const item of items) {
    const productId = item.productId ? String(item.productId) : null;
    if (productId && productMap.has(productId)) {
      if (seenProducts.has(productId)) {
        continue;
      }
      const product = productMap.get(productId);
      entries.push({
        title: product?.ime || item.name,
        description: sanitizeDescription(product?.dolgOpis || product?.kratekOpis || ''),
        imageUrl: product?.povezavaDoSlike || undefined,
      });
      seenProducts.add(productId);
    } else {
      entries.push({
        title: item.name,
      });
    }
  }

  return entries;
}

async function appendProjectSection(doc: PDFDocumentInstance, entries: ProjectEntry[]) {
  const processed = await Promise.all(
    entries.map(async (entry) => {
      if (entry.imageUrl) {
        entry.imageBuffer = await downloadImageBuffer(entry.imageUrl);
      }
      return entry;
    })
  );

  doc.fontSize(18).text('Projekt', { align: 'left' });
  doc.moveDown();

  const usableWidth =
    doc.page.width - (doc.page.margins?.left ?? 72) - (doc.page.margins?.right ?? 72);

  processed.forEach((entry, index) => {
    ensureSpace(doc, 200);
    doc.fontSize(14).text(entry.title, { align: 'left' });
    doc.moveDown(0.3);
    if (entry.imageBuffer) {
      doc.image(entry.imageBuffer, {
        fit: [Math.min(usableWidth, 320), 220],
      });
      doc.moveDown(0.3);
    }
    if (entry.description) {
      doc.fontSize(11).text(entry.description, { align: 'left' });
      doc.moveDown(0.5);
    } else {
      doc.moveDown(0.5);
    }
    if (index < processed.length - 1) {
      doc.moveDown(0.5);
    }
  });
}

function sanitizeDescription(value: string) {
  if (!value) return '';
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function downloadImageBuffer(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      client
        .get(url, (response) => {
          if (!response.statusCode || response.statusCode >= 400) {
            response.resume();
            resolve(null);
            return;
          }
          const data: Buffer[] = [];
          response.on('data', (chunk) => data.push(chunk as Buffer));
          response.on('end', () => resolve(Buffer.concat(data)));
        })
        .on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function ensureSpace(doc: PDFDocumentInstance, requiredHeight: number) {
  const bottom = doc.page.margins?.bottom ?? 72;
  const availableHeight = doc.page.height - bottom;
  if (doc.y + requiredHeight > availableHeight) {
    doc.addPage();
  }
}

export async function sendOfferVersionStub(req: Request, res: Response) {
  const { projectId, offerVersionId } = req.params;
  const offer = await OfferVersionModel.findOne({ _id: offerVersionId, projectId }).lean();
  if (!offer) {
    return res.fail('Ponudba ni najdena.', 404);
  }

  // TODO: implementirati dejansko pošiljanje emaila
  return res.success({
    sent: false,
    message: 'Email sending not implemented yet',
  });
}
