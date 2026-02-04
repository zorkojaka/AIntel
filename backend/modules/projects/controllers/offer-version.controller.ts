import { NextFunction, Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import http from 'http';
import https from 'https';
import type { OfferLineItem, OfferStatus, OfferVersion } from '../../../../shared/types/offers';
import { OfferVersionModel } from '../schemas/offer-version';
import { ProductModel } from '../../cenik/product.model';
import { ProjectModel } from '../schemas/project';
import { renderHtmlToPdf } from '../services/html-pdf.service';
import { generateOfferDocumentPdf } from '../services/offer-pdf-preview.service';
import { generateOfferDocumentNumber, type DocumentNumberingKind } from '../services/document-numbering.service';
import { resolveActorId } from '../../../utils/tenant';

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

const EXPORTABLE_DOC_TYPES: DocumentNumberingKind[] = [
  'OFFER',
  'PURCHASE_ORDER',
  'DELIVERY_NOTE',
  'WORK_ORDER',
  'WORK_ORDER_CONFIRMATION',
  'CREDIT_NOTE',
];

const DOC_TYPE_SLUGS: Partial<Record<DocumentNumberingKind, string>> = {
  OFFER: 'offer',
  PURCHASE_ORDER: 'purchase-order',
  DELIVERY_NOTE: 'delivery-note',
  WORK_ORDER: 'work-order',
  WORK_ORDER_CONFIRMATION: 'work-order-confirmation',
  CREDIT_NOTE: 'credit-note',
};
const DEFAULT_PAYMENT_TERMS = '50% - avans, 50% - 10 dni po izvedbi';

function parseOfferDocType(value?: string | string[]): DocumentNumberingKind {
  if (Array.isArray(value)) value = value[0];
  const normalized = typeof value === 'string' ? value.toUpperCase() : 'OFFER';
  return EXPORTABLE_DOC_TYPES.includes(normalized as DocumentNumberingKind)
    ? (normalized as DocumentNumberingKind)
    : 'OFFER';
}

function getDocTypeSlug(docType: DocumentNumberingKind) {
  return DOC_TYPE_SLUGS[docType] ?? 'offer';
}

type LineItemParseResult = { item?: OfferLineItem; error?: string; skipped?: boolean };

function parseQuantity(rawValue: unknown): { value?: number; error?: string } {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { value: 1 };
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return { error: 'quantity' };
  }
  return { value: parsed };
}

function sanitizeLineItem(raw: unknown): LineItemParseResult {
  const item = raw as Record<string, unknown>;
  const name = normalizeText(item?.name);
  const unitPrice = clampNumber(item?.unitPrice, 0, 0);
  const vatRate = clampNumber(item?.vatRate, 22, 0);
  const unit = normalizeText(item?.unit, 'kos') || 'kos';
  const discountPercent = clampNumber(item?.discountPercent, 0, 0);

  if (!name || unitPrice <= 0) return { skipped: true };

  const quantityResult = parseQuantity(item?.quantity);
  if (quantityResult.error) {
    return { error: quantityResult.error };
  }
  const quantity = quantityResult.value ?? 1;

  const totalNet = Number((quantity * unitPrice).toFixed(2));
  const totalVat = Number((totalNet * (vatRate / 100)).toFixed(2));
  const totalGross = Number((totalNet + totalVat).toFixed(2));

  return {
    item: {
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
    }
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

function normalizeCasovnaNorma(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function attachCasovnaNorma(items: OfferLineItem[]) {
  const productIds = Array.from(
    new Set(
      items
        .map((item) => (item.productId ? String(item.productId) : null))
        .filter((value): value is string => !!value)
    )
  );
  if (productIds.length === 0) {
    return items.map((item) => ({
      ...item,
      casovnaNorma: normalizeCasovnaNorma((item as any).casovnaNorma),
    }));
  }
  const products = await ProductModel.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));
  return items.map((item) => {
    const productId = item.productId ? String(item.productId) : null;
    const product = productId ? productMap.get(productId) : null;
    return {
      ...item,
      casovnaNorma: product
        ? normalizeCasovnaNorma((product as any).casovnaNorma)
        : normalizeCasovnaNorma((item as any).casovnaNorma),
      dobavitelj: product ? (product as any).dobavitelj : (item as any).dobavitelj,
      naslovDobavitelja: product ? (product as any).naslovDobavitelja : (item as any).naslovDobavitelja,
    };
  });
}

function extractBaseTitle(rawTitle?: string) {
  const title = (rawTitle || 'Ponudba').trim();
  const match = title.match(/^(.*)_\d+$/);
  return (match?.[1] || title).trim() || 'Ponudba';
}

function getCustomerLastName(name?: string | null) {
  const trimmed = normalizeText(name);
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return trimmed;
  }
  return parts[parts.length - 1];
}

function buildDefaultOfferTitle(categoryLabel: string, customerName: string) {
  const category = normalizeText(categoryLabel, 'Ponudba');
  const lastName = getCustomerLastName(customerName);
  if (!category && !lastName) return 'Ponudba';
  if (category && lastName) return `${category} ${lastName}`.trim();
  return (category || lastName || 'Ponudba').trim();
}

async function getNextVersionNumber(projectId: string, baseTitle: string) {
  const last = await OfferVersionModel.findOne({ projectId, baseTitle }).sort({ versionNumber: -1 }).lean();
  return last ? (last.versionNumber || 0) + 1 : 1;
}

function serializeOffer(offer: OfferVersion) {
  const { introText: _introText, ...rest } = offer as OfferVersion & { introText?: unknown };
  return {
    ...rest,
    items: (offer.items ?? []).map((item) => ({
      ...item,
      casovnaNorma: normalizeCasovnaNorma((item as any).casovnaNorma),
      dobavitelj: (item as any).dobavitelj,
      naslovDobavitelja: (item as any).naslovDobavitelja,
    })),
    validUntil: offer.validUntil ? new Date(offer.validUntil).toISOString() : null,
    sentAt: offer.sentAt ? new Date(offer.sentAt).toISOString() : null,
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
    const actorId = resolveActorId(req);
    const body = req.body ?? {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const parsedItems = rawItems.map((raw: unknown) => sanitizeLineItem(raw));
    if (parsedItems.some((entry) => entry.error)) {
      return res.fail('Količina postavke mora biti vsaj 1.', 400);
    }
    const items = parsedItems
      .filter((entry) => entry.item)
      .map((entry) => entry.item as OfferLineItem);
    const itemsWithNorma = await attachCasovnaNorma(items);

    if (!itemsWithNorma.length) {
      return res.fail('Ponudba mora vsebovati vsaj eno veljavno postavko.', 400);
    }

    const needsDefaultTitle = !normalizeText(body?.title) || normalizeText(body?.title).toLowerCase() === 'ponudba';
    const shouldSetSeller = actorId ? mongoose.isValidObjectId(actorId) : false;
    const shouldLoadProject = needsDefaultTitle || shouldSetSeller;
    const project = shouldLoadProject
      ? await ProjectModel.findOne({ id: projectId }).select('salesUserId customer').lean()
      : null;

    if (shouldSetSeller && project && !project.salesUserId) {
      await ProjectModel.updateOne({ id: projectId }, { $set: { salesUserId: actorId } });
    }

    let resolvedTitle = normalizeText(body?.title);
    if (needsDefaultTitle) {
      const firstProductId = items[0]?.productId ? String(items[0].productId) : null;
      let categoryLabel = '';
      if (firstProductId) {
        const product = await ProductModel.findById(firstProductId).select('kategorija').lean();
        categoryLabel = normalizeText(product?.kategorija, '');
      }
      const customerName = normalizeText(project?.customer?.name, '');
      resolvedTitle = buildDefaultOfferTitle(categoryLabel || 'Ponudba', customerName);
    }

    const totals = calculateOfferTotals({
      items: itemsWithNorma,
      usePerItemDiscount: body?.usePerItemDiscount ?? false,
      useGlobalDiscount: body?.useGlobalDiscount ?? true,
      globalDiscountPercent: body?.globalDiscountPercent ?? body?.discountPercent ?? 0,
      vatMode: body?.vatMode ?? 22,
    });

    const now = new Date();
    const validUntilValue = body?.validUntil;
    const validUntil =
      validUntilValue && !Number.isNaN(new Date(validUntilValue).valueOf()) ? new Date(validUntilValue) : null;

    const baseTitle = extractBaseTitle(resolvedTitle || body?.title);
    const versionNumber = await getNextVersionNumber(projectId, baseTitle);
    const title = `${baseTitle}_${versionNumber}`;

    const normalizedPaymentTerms = normalizeText(body?.paymentTerms);
    const resolvedPaymentTerms = normalizedPaymentTerms || DEFAULT_PAYMENT_TERMS;

    const payload: Omit<OfferVersion, '_id'> = {
      projectId,
      baseTitle,
      versionNumber,
      title,
      validUntil: validUntil ? validUntil.toISOString() : null,
      paymentTerms: resolvedPaymentTerms,
      comment: normalizeText(body?.comment) || null,
      items: itemsWithNorma,
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

    try {
      const numbering = await generateOfferDocumentNumber(now);
      payload.documentNumber = numbering.number;
    } catch (numberingError) {
      console.error('Failed to generate document number for offer', numberingError);
    }

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
      documentNumber: o.documentNumber ?? null,
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
    const parsedItems = rawItems.map((raw: unknown) => sanitizeLineItem(raw));
    if (parsedItems.some((entry) => entry.error)) {
      return res.fail('Količina postavke mora biti vsaj 1.', 400);
    }
    const items = parsedItems
      .filter((entry) => entry.item)
      .map((entry) => entry.item as OfferLineItem);
    const itemsWithNorma = await attachCasovnaNorma(items);

    if (!itemsWithNorma.length) {
      return res.fail('Ponudba mora vsebovati vsaj eno veljavno postavko.', 400);
    }

    const totals = calculateOfferTotals({
      items: itemsWithNorma,
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
    const normalizedComment = normalizeText(body?.comment, existing.comment ?? '');
    existing.comment = normalizedComment || null;
    existing.items = itemsWithNorma;
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
  const docType = parseOfferDocType(req.query.docType);

  const offer = await OfferVersionModel.findOne({ _id: offerVersionId, projectId });
  if (!offer) {
    return res.fail('Ponudba ni najdena.', 404);
  }

  const actorId = resolveActorId(req);
  offer.sentAt = new Date();
  offer.sentByUserId = actorId ?? offer.sentByUserId ?? null;
  offer.sentVia = 'email';
  await offer.save();

  if (docType !== 'OFFER' && includeProject) {
    return res.fail('Ta dokument ne podpira kombiniranega izvoza.', 400);
  }

  if (!includeOffer) {
    return res.fail('Ta dokument ni na voljo za izvoz brez ponudbe.', 400);
  }

  if (includeOffer && !includeProject) {
    console.log('DOCUMENT EXPORT: renderer', { projectId, offerVersionId, docType });
    try {
      const buffer = await generateOfferDocumentPdf(offerVersionId, docType);
      res.setHeader('Content-Type', 'application/pdf');
      const slug = getDocTypeSlug(docType);
      res.setHeader('Content-Disposition', `attachment; filename="${slug}-${offer._id}.pdf"`);
      res.end(buffer);
      return;
    } catch (error) {
      console.error('Document renderer failed', error);
      res.fail('Izvoz dokumenta ni uspel. Poskusite znova.', 500);
      return;
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
  const offer = await OfferVersionModel.findOne({ _id: offerVersionId, projectId });
  if (!offer) {
    return res.fail('Ponudba ni najdena.', 404);
  }

  const actorId = resolveActorId(req);
  offer.sentAt = new Date();
  offer.sentByUserId = actorId ?? offer.sentByUserId ?? null;
  offer.sentVia = 'email';
  await offer.save();

  // TODO: implementirati dejansko pošiljanje emaila
  return res.success({
    sent: true,
    sentAt: offer.sentAt ? offer.sentAt.toISOString() : null,
    sentByUserId: offer.sentByUserId ?? null,
    sentVia: offer.sentVia ?? null,
    message: 'Email sending not implemented yet',
  });
}
