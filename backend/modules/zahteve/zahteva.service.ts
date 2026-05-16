import mongoose, { Types } from 'mongoose';
import type { OfferLineItem } from '../../../shared/types/offers';
import { ProductModel, type ProductDocument } from '../cenik/product.model';
import { ProjectModel } from '../projects/schemas/project';
import { OfferVersionModel } from '../projects/schemas/offer-version';
import { calculateOfferTotals } from '../projects/services/offer-totals.service';
import { generateOfferDocumentNumber } from '../projects/services/document-numbering.service';
import { ZahtevaModel, type ZahtevaDocument } from './zahteva.model';
import { dvcStorageCalculator } from './dvcStorageCalculator';

const DEFAULT_PAYMENT_TERMS = '50% - avans, 50% - 10 dni po izvedbi';

function normalizeText(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.normalize('NFC').trim();
  if (value === undefined || value === null) return fallback;
  return String(value).normalize('NFC').trim();
}

function isObjectId(value: unknown) {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

function nextStandard(value: number, standards: number[]) {
  const normalized = Math.max(0, Number(value) || 0);
  return standards.find((entry) => entry >= normalized) ?? standards[standards.length - 1];
}

function productManufacturer(product: any) {
  return normalizeText(product?.classification?.manufacturer || product?.proizvajalec);
}

function productUnit(product: any) {
  return product?.isService ? 'storitev' : 'kos';
}

function vatRate(product: any) {
  const aaVat = Number(product?.aaData?.vat);
  if (Number.isFinite(aaVat) && aaVat >= 0) return aaVat;
  return 22;
}

function lineFromProduct(product: any, quantity: number, tip: 'material' | 'storitev'): OfferLineItem {
  const unitPrice = Number(product?.prodajnaCena ?? 0);
  const qty = Math.max(0, Number(quantity) || 0);
  const vat = vatRate(product);
  const totalNet = Number((qty * unitPrice).toFixed(2));
  const totalVat = Number((totalNet * (vat / 100)).toFixed(2));
  return {
    id: new Types.ObjectId().toString(),
    productId: String(product._id),
    name: product.ime,
    quantity: qty,
    unit: tip === 'storitev' ? 'storitev' : productUnit(product),
    unitPrice,
    vatRate: vat,
    discountPercent: 0,
    totalNet,
    totalVat,
    totalGross: Number((totalNet + totalVat).toFixed(2)),
    casovnaNorma: Number(product?.casovnaNorma) || 0,
    dobavitelj: product?.dobavitelj ?? '',
    naslovDobavitelja: product?.naslovDobavitelja ?? '',
  };
}

async function getNextOfferVersionNumber(projectId: string, baseTitle: string) {
  const last = await OfferVersionModel.findOne({ projectId, baseTitle }).sort({ versionNumber: -1 }).lean();
  return last ? (last.versionNumber || 0) + 1 : 1;
}

async function createOfferVersion(input: {
  projectId: string;
  baseTitle?: string;
  items: OfferLineItem[];
  comment?: string | null;
}) {
  const baseTitle = normalizeText(input.baseTitle, 'Ponudba') || 'Ponudba';
  const versionNumber = await getNextOfferVersionNumber(input.projectId, baseTitle);
  const title = `${baseTitle}_${versionNumber}`;
  const now = new Date();
  const totals = calculateOfferTotals({
    items: input.items,
    usePerItemDiscount: false,
    useGlobalDiscount: true,
    globalDiscountPercent: 0,
    vatMode: 22,
  });

  const payload: any = {
    projectId: input.projectId,
    baseTitle,
    versionNumber,
    title,
    validUntil: null,
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    comment: input.comment ?? null,
    items: input.items,
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
    useGlobalDiscount: true,
    usePerItemDiscount: false,
    vatMode: 22,
    baseWithoutVat: totals.baseWithoutVat ?? totals.totalNet ?? 0,
    perItemDiscountAmount: totals.perItemDiscountAmount ?? 0,
    globalDiscountAmount: totals.globalDiscountAmount ?? 0,
    baseAfterDiscount: totals.baseAfterDiscount ?? totals.totalNetAfterDiscount ?? 0,
    vatAmount: totals.vatAmount ?? totals.totalVat ?? 0,
    totalWithVat: totals.totalWithVat ?? totals.totalGrossAfterDiscount ?? totals.totalGross ?? 0,
    status: 'draft',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    const numbering = await generateOfferDocumentNumber(now);
    payload.documentNumber = numbering.number;
  } catch (error) {
    console.error('Failed to generate document number for request offer', error);
  }

  return OfferVersionModel.create(payload);
}

export async function resolveProjectForZahteva(projectId: string) {
  if (isObjectId(projectId)) {
    const byMongoId = await ProjectModel.findById(projectId);
    if (byMongoId) return byMongoId;
  }
  return ProjectModel.findOne({ id: projectId });
}

export async function createPreskocenaPonudba(zahteva: ZahtevaDocument) {
  const project = await ProjectModel.findById(zahteva.projectId).lean();
  const projectKey = project?.id ?? String(zahteva.projectId);
  return createOfferVersion({
    projectId: projectKey,
    baseTitle: 'Ponudba',
    items: [],
    comment: 'Prazna ponudba iz preskočene zahteve.',
  });
}

export async function predlagajSnemalnik(skupajKamer: number, dominantenBrand?: string, potrebujePoE?: boolean) {
  const kanali = nextStandard(skupajKamer, [4, 8, 16, 32, 64]);
  const baseQuery: any = {
    'classification.productType': 'snemalnik',
    'classification.nvrChannels': kanali,
    isActive: true,
  };
  if (potrebujePoE) baseQuery['classification.nvrHasPoE'] = true;

  const brand = normalizeText(dominantenBrand);
  const branded = brand
    ? await ProductModel.findOne({ ...baseQuery, 'classification.manufacturer': brand }).sort({ prodajnaCena: 1 }).lean()
    : null;
  return branded ?? ProductModel.findOne(baseQuery).sort({ prodajnaCena: 1 }).lean();
}

export async function predlagajPoESwitch(potrebnoPortov: number) {
  if ((Number(potrebnoPortov) || 0) <= 0) return null;
  const portov = nextStandard(potrebnoPortov, [4, 8, 16, 24]);
  return ProductModel.findOne({
    'classification.productType': 'switch',
    'classification.poePortCount': { $gte: portov },
    'classification.switchSpeed': 'gigabit',
    isActive: true,
  })
    .sort({ 'classification.poePortCount': 1, prodajnaCena: 1 })
    .lean();
}

export async function predlagajDisk(tb: number, surveillance = true) {
  return ProductModel.findOne({
    'classification.productType': 'disk',
    'classification.diskCapacityTB': { $gte: Math.max(0, Number(tb) || 0) },
    ...(surveillance ? { 'classification.isSurveillanceDisk': true } : {}),
    isActive: true,
  })
    .sort({ 'classification.diskCapacityTB': 1, prodajnaCena: 1 })
    .lean();
}

export async function predlagajNosilce(kameraId: string) {
  if (!isObjectId(kameraId)) return [];
  const kamera = await ProductModel.findById(kameraId).lean();
  if (!kamera) return [];

  const compatibleCodes = Array.isArray(kamera.classification?.compatibleBracketCodes)
    ? kamera.classification.compatibleBracketCodes.filter(Boolean)
    : [];

  if (compatibleCodes.length > 0) {
    return ProductModel.find({
      'classification.productType': 'nosilec',
      'classification.bracketCodeOwn': { $in: compatibleCodes },
      isActive: true,
    })
      .sort({ prodajnaCena: 1 })
      .lean();
  }

  const manufacturer = productManufacturer(kamera);
  return ProductModel.find({
    'classification.productType': 'nosilec',
    ...(manufacturer ? { 'classification.manufacturer': manufacturer } : {}),
    isActive: true,
  })
    .sort({ prodajnaCena: 1 })
    .lean();
}

export async function izracunajInPredlagajDisk(input: {
  cameraIds: string[];
  savingDays: number;
  motionRecord: boolean;
}) {
  const ids = (input.cameraIds ?? []).filter(isObjectId);
  const products = ids.length > 0 ? await ProductModel.find({ _id: { $in: ids } }).lean() : [];
  const storage = dvcStorageCalculator({
    channels: products.map((product) => ({
      resolutionMP: product.classification?.maxResolutionMP,
    })),
    savingDays: input.savingDays || 30,
    dailyHours: input.motionRecord ? 12 : 24,
  });
  const product = await predlagajDisk(storage.recommendedDiskTB, true);
  return { storage, product };
}

async function findManualProduct(pattern: RegExp) {
  return ProductModel.findOne({
    ime: pattern,
    externalSource: { $in: ['manual', 'services_sheet', ''] },
    isActive: { $ne: false },
  })
    .sort({ prodajnaCena: 1 })
    .lean();
}

function addProductRequest(
  requests: Array<{ productId: string; kolicina: number; tip: 'material' | 'storitev' }>,
  productId: unknown,
  kolicina: number,
  tip: 'material' | 'storitev'
) {
  if (!productId || !isObjectId(String(productId))) return;
  const qty = Number(kolicina) || 0;
  if (qty <= 0) return;
  requests.push({ productId: String(productId), kolicina: qty, tip });
}

async function buildOfferItems(zahteva: ZahtevaDocument) {
  const videonadzor = zahteva.videonadzor;
  const productRequests: Array<{ productId: string; kolicina: number; tip: 'material' | 'storitev' }> = [];

  for (const par of videonadzor.kosarica ?? []) {
    addProductRequest(productRequests, par.kameraProductId, par.kolicina, 'material');
    addProductRequest(productRequests, par.nosilecProductId, par.kolicina, 'material');
  }

  addProductRequest(productRequests, videonadzor.snemalnik?.productId, 1, 'material');
  addProductRequest(productRequests, videonadzor.poeSwitch?.productId, 1, 'material');
  addProductRequest(productRequests, videonadzor.disk?.productId, 1, 'material');

  for (const dod of videonadzor.dodatnaOprema ?? []) {
    addProductRequest(productRequests, dod.productId, dod.kolicina, 'material');
  }

  if (videonadzor.montaza?.vkljuceno) {
    const stevKamer = (videonadzor.lokacije ?? []).filter((lokacija) => lokacija.kameraId).length;
    const [montazaKamera, zagonSnem] = await Promise.all([
      findManualProduct(/montaža.*kamera|montaza.*kamera/i),
      findManualProduct(/zagon.*snemaln/i),
    ]);
    addProductRequest(productRequests, montazaKamera?._id, stevKamer, 'storitev');
    addProductRequest(productRequests, zagonSnem?._id, 1, 'storitev');

    if (videonadzor.montaza.napeljava) {
      const metrov = Number(videonadzor.montaza.metrov) || 0;
      const utp = await findManualProduct(/utp.*kabel/i);
      addProductRequest(productRequests, utp?._id, metrov, 'material');

      if (videonadzor.montaza.zascitniMaterial === 'kanal') {
        const [kanal, polaganje] = await Promise.all([
          findManualProduct(/plastič.*kanal|plastic.*kanal/i),
          findManualProduct(/polaganje.*kanal/i),
        ]);
        addProductRequest(productRequests, kanal?._id, metrov, 'material');
        addProductRequest(productRequests, polaganje?._id, metrov, 'storitev');
      }

      if (videonadzor.montaza.zascitniMaterial === 'cev') {
        const [cev, polaganje] = await Promise.all([
          findManualProduct(/gibljiv.*cev/i),
          findManualProduct(/polaganje.*cev/i),
        ]);
        addProductRequest(productRequests, cev?._id, metrov, 'material');
        addProductRequest(productRequests, polaganje?._id, metrov, 'storitev');
      }
    }
  }

  const productIds = Array.from(new Set(productRequests.map((entry) => entry.productId)));
  const products = await ProductModel.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((product: ProductDocument) => [String(product._id), product]));

  return productRequests
    .map((entry) => {
      const product = productMap.get(entry.productId);
      return product ? lineFromProduct(product, entry.kolicina, entry.tip) : null;
    })
    .filter((item): item is OfferLineItem => Boolean(item));
}

export async function zakljucniZahtevo(zahtevaId: string) {
  if (!isObjectId(zahtevaId)) {
    throw Object.assign(new Error('Neveljavna zahteva.'), { statusCode: 400 });
  }

  const zahteva = await ZahtevaModel.findById(zahtevaId);
  if (!zahteva) {
    throw Object.assign(new Error('Zahteva ni najdena.'), { statusCode: 404 });
  }

  if (zahteva.generatedQuoteId) {
    const existing = await OfferVersionModel.findById(zahteva.generatedQuoteId);
    if (existing) return existing;
  }

  const project = await ProjectModel.findById(zahteva.projectId).lean();
  const projectKey = project?.id ?? String(zahteva.projectId);
  const items = await buildOfferItems(zahteva);
  const ponudba = await createOfferVersion({
    projectId: projectKey,
    baseTitle: 'Ponudba',
    items,
    comment: 'Ponudba ustvarjena iz zahteve.',
  });

  zahteva.status = 'koncana';
  zahteva.generatedQuoteId = ponudba._id;
  await zahteva.save();

  return ponudba;
}
