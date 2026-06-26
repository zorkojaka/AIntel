import mongoose, { Types } from 'mongoose';
import type { OfferLineItem } from '../../../shared/types/offers';
import { ProductModel, type ProductDocument } from '../cenik/product.model';
import { ProjectModel } from '../projects/schemas/project';
import { OfferVersionModel } from '../projects/schemas/offer-version';
import { calculateOfferTotals } from '../projects/services/offer-totals.service';
import { generateOfferDocumentNumber } from '../projects/services/document-numbering.service';
import { ZahtevaModel, type ZahtevaDocument } from './zahteva.model';
import { dvcStorageCalculator } from './dvcStorageCalculator';
import { ExecutionRuleSettingsModel } from '../execution-rules/execution-rules.model';
import { DEFAULT_EXECUTION_SCENARIOS, normalizeScenarios } from '../execution-rules/execution-rules.service';

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

function buildZahtevaLocationPhotoItemId(zahtevaId: string, sistemId: string, lokacijaId: string) {
  return `zahteva-location:${zahtevaId}:${sistemId}:${lokacijaId}`;
}

function buildAlarmLocationPhotoItemId(zahtevaId: string, sistemId: string, lokacijaId: string) {
  return `zahteva-alarm-location:${zahtevaId}:${sistemId}:${lokacijaId}`;
}

function isDefaultLocationName(value: unknown) {
  const normalized = normalizeText(value);
  return /^Lokacija\s+\d+$/i.test(normalized) || /^loc-\d+$/i.test(normalized);
}

function hasInlineLocationPhotos(lokacija: any) {
  return Array.isArray(lokacija?.slike) && lokacija.slike.length > 0;
}

function isMeaningfulVideoLocation(lokacija: any) {
  return Boolean(lokacija?.asortimaIdAssigned) || !isDefaultLocationName(lokacija?.ime) || hasInlineLocationPhotos(lokacija);
}

function isMeaningfulAlarmLocation(lokacija: any) {
  return Boolean(lokacija?.senzorIdAssigned) || !isDefaultLocationName(lokacija?.ime) || hasInlineLocationPhotos(lokacija);
}

function lineFromProduct(
  product: any,
  quantity: number,
  tip: 'material' | 'storitev',
  extra?: Partial<OfferLineItem>
): OfferLineItem {
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
    ...extra,
  };
}

async function getNextOfferVersionNumber(projectId: string, baseTitle: string) {
  const last = await OfferVersionModel.findOne({ projectId, baseTitle }).sort({ versionNumber: -1 }).lean();
  return last ? (last.versionNumber || 0) + 1 : 1;
}

async function createOfferVersion(input: {
  projectId: string;
  requestId?: string | null;
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
    requestId: input.requestId ?? null,
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

export function createDefaultVideonadzorSystem() {
  return {
    id: 'sys-1',
    tip: 'videonadzor' as const,
    steviloLokacij: 1,
    videonadzor: {
      asortima: [],
      lokacije: [{ id: 'loc-1', ime: 'Lokacija 1', asortimaIdAssigned: null, slike: [] }],
      snemalnik: { productId: null },
      poeSwitch: { productId: null, kolicina: 0, items: [] },
      disk: { productId: null, kolicina: 0, items: [], dniSnemanja: 30, motionRecord: false },
      dodatnaOprema: [],
    },
    execution: {
      scenarioType: 'posiljanje' as const,
      estimates: { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0, kilometrinaKm: 0 },
    },
  };
}

export async function predlagajSnemalnik(skupajKamer: number, dominantenBrand?: string, potrebujePoE?: boolean) {
  const kanali = nextStandard(skupajKamer, [4, 8, 16, 32, 64]);
  const channelPattern = new RegExp(`\\b${kanali}\\s*[- ]*(?:kanal(?:ni|ov)?|channel|ch|kamer|cameras)\\b`, 'i');
  const channelLabelPattern = new RegExp(`\\b(?:number of cameras|kamer(?:e|a)?)\\s*:\\s*${kanali}\\b`, 'i');
  const baseQuery: any = {
    $or: [
      { 'classification.productType': 'snemalnik' },
      { ime: /\b(DRN|NVR)\b/i },
      { kategorija: /\bsnemalnik\b/i },
      { categorySlugs: 'snemalnik' },
      { 'aaData.productCode': /\b(DRN|NVR)\b/i },
      { dolgOpis: /\b(DRN|NVR)\b/i },
    ],
    $and: [
      {
        $or: [
          { 'classification.nvrChannels': kanali },
          { ime: channelPattern },
          { kratekOpis: channelPattern },
          { dolgOpis: channelPattern },
          { 'aaData.rawDescription': channelPattern },
          { kratekOpis: channelLabelPattern },
          { dolgOpis: channelLabelPattern },
          { 'aaData.rawDescription': channelLabelPattern },
        ],
      },
      { ime: { $not: /\b(DRA|DVR|AHD|analog)\b/i } },
      { kratekOpis: { $not: /\b(DRA|DVR|AHD|analog)\b/i } },
      { dolgOpis: { $not: /\b(DRA|DVR|AHD|analog)\b/i } },
    ],
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

function addProductRequest(
  requests: Array<{ productId: string; kolicina: number; tip: 'material' | 'storitev'; extra?: Partial<OfferLineItem> }>,
  productId: unknown,
  kolicina: number,
  tip: 'material' | 'storitev',
  extra?: Partial<OfferLineItem>
) {
  if (!productId || !isObjectId(String(productId))) return;
  const qty = Number(kolicina) || 0;
  if (qty <= 0) return;
  requests.push({ productId: String(productId), kolicina: qty, tip, extra });
}

function selectedEquipmentItems(input?: { productId?: unknown; kolicina?: number; items?: Array<{ productId?: unknown; kolicina?: number }> }) {
  const items = (input?.items ?? [])
    .map((item) => ({ productId: item.productId, kolicina: Math.max(0, Number(item.kolicina) || 0) }))
    .filter((item) => item.productId && item.kolicina > 0);
  if (items.length > 0) return items;
  const qty = Math.max(0, Number(input?.kolicina ?? (input?.productId ? 1 : 0)) || 0);
  return input?.productId && qty > 0 ? [{ productId: input.productId, kolicina: qty }] : [];
}

function getByPath(source: any, path?: string) {
  const cleanPath = normalizeText(path);
  if (!cleanPath) return undefined;
  return cleanPath.split('.').reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function quantityFromRule(rule: any, baseQuantity: number, product?: any, estimates?: any) {
  const quantityRule = rule?.quantityRule ?? {};
  const type = quantityRule.type;
  if (type === 'per_unit') {
    return Math.max(0, Number(baseQuantity) || 0);
  }
  if (type === 'per_classification_field') {
    const fieldValue = getByPath(product?.classification ?? estimates ?? {}, quantityRule.field);
    const qty = Number(fieldValue);
    return Number.isFinite(qty) && qty > 0 ? qty * Math.max(1, Number(baseQuantity) || 1) : 0;
  }
  return Math.max(0, Number(quantityRule.value ?? 1) || 0);
}

function executionProductMatches(rule: any, product: any, projectTypes: Set<string>) {
  const triggerValue = normalizeText(rule.triggerValue);
  if (!triggerValue) return false;
  if (rule.triggerType === 'project') {
    return projectTypes.has(triggerValue);
  }
  if (!product) return false;
  if (rule.triggerType === 'product') {
    return String(product._id) === triggerValue;
  }
  if (rule.triggerType === 'category') {
    return (product.categorySlugs ?? []).map(String).includes(triggerValue);
  }
  if (rule.triggerType === 'classification') {
    const productType = normalizeText(product.classification?.productType);
    if (productType !== triggerValue) return false;
    const triggerField = normalizeText(rule.triggerField);
    if (!triggerField) return true;
    const fieldValue = getByPath(product.classification, triggerField);
    const expected = normalizeText(rule.triggerFieldValue);
    return expected ? normalizeText(fieldValue) === expected : fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
  }
  return false;
}

type ProductRequest = { productId: string; kolicina: number; tip: 'material' | 'storitev'; extra?: Partial<OfferLineItem> };
type SystemProductRequests = { sistem: ZahtevaDocument['sistemi'][number]; requests: ProductRequest[] };

function isVideoRequirementSystem(sistem: ZahtevaDocument['sistemi'][number]) {
  return sistem.tip === 'videonadzor' || sistem.tip === 'wifi_kamere';
}

function mergeProductRequestExtra(
  current?: Partial<OfferLineItem>,
  incoming?: Partial<OfferLineItem>,
): Partial<OfferLineItem> | undefined {
  if (!current && !incoming) return undefined;

  const requirementsLocationUnits = [
    ...(current?.requirementsLocationUnits ?? []),
    ...(incoming?.requirementsLocationUnits ?? []),
  ];
  const merged: Partial<OfferLineItem> = { ...(incoming ?? {}), ...(current ?? {}) };

  if (requirementsLocationUnits.length > 0) {
    merged.requirementsLocationUnits = requirementsLocationUnits;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeProductRequests(requests: ProductRequest[]) {
  const mergedRequests: ProductRequest[] = [];
  const requestByKey = new Map<string, ProductRequest>();

  for (const request of requests) {
    const key = `${request.tip}:${request.productId}`;
    const existing = requestByKey.get(key);

    if (!existing) {
      const copy: ProductRequest = {
        ...request,
        extra: mergeProductRequestExtra(undefined, request.extra),
      };
      requestByKey.set(key, copy);
      mergedRequests.push(copy);
      continue;
    }

    existing.kolicina += request.kolicina;
    existing.extra = mergeProductRequestExtra(existing.extra, request.extra);
  }

  return mergedRequests;
}

async function addConfiguredExecutionRequests(
  zahteva: ZahtevaDocument,
  productRequests: ProductRequest[],
  systemRequests: SystemProductRequests[],
  tenantId: string,
) {
  const settings = await ExecutionRuleSettingsModel.findOne({ tenantId }).lean();
  if (!settings) return;

  const allMaterialRequests = systemRequests.flatMap((entry) => entry.requests.filter((request) => request.tip === 'material'));
  const materialIds = Array.from(new Set(allMaterialRequests.map((entry) => entry.productId)));
  const products = materialIds.length > 0 ? await ProductModel.find({ _id: { $in: materialIds } }).lean() : [];
  const productMap = new Map<string, any>(products.map((product) => [String(product._id), product]));
  const projectTypes = new Set<string>();
  for (const sistem of zahteva.sistemi ?? []) {
    projectTypes.add(sistem.tip);
    if (sistem.tip === 'wifi_kamere') projectTypes.add('videonadzor');
  }
  const addedProjectRuleIds = new Set<string>();

  for (const systemEntry of systemRequests) {
    const materialRequests = systemEntry.requests.filter((entry) => entry.tip === 'material');
    const systemTypes = new Set<string>([systemEntry.sistem.tip]);
    if (systemEntry.sistem.tip === 'wifi_kamere') systemTypes.add('videonadzor');

    for (const rule of settings.productServiceRules ?? []) {
      if (!rule.isActive) continue;
      if (rule.triggerType === 'project') {
        const pseudoProduct = {};
        if (!executionProductMatches(rule, pseudoProduct, projectTypes)) continue;
        if (addedProjectRuleIds.has(rule.id)) continue;
        addedProjectRuleIds.add(rule.id);
        addProductRequest(productRequests, rule.serviceProductId, quantityFromRule(rule, 1), 'storitev');
        continue;
      }

      for (const request of materialRequests) {
        const product = productMap.get(request.productId);
        if (!executionProductMatches(rule, product, systemTypes)) continue;
        addProductRequest(
          productRequests,
          rule.serviceProductId,
          quantityFromRule(rule, request.kolicina, product),
          'storitev',
        );
      }
    }

    const scenarios = normalizeScenarios(settings.scenarios ?? DEFAULT_EXECUTION_SCENARIOS);
    const selectedType = systemEntry.sistem.execution?.scenarioType ?? 'posiljanje';
    const scenario = scenarios.find((entry) => entry.type === selectedType);
    const totalCameraCount = materialRequests.reduce((sum, request) => {
      const product = productMap.get(request.productId);
      return product?.classification?.productType === 'kamera' ? sum + request.kolicina : sum;
    }, 0);
    const estimates = systemEntry.sistem.execution?.estimates ?? {};

    for (const service of scenario?.storitve ?? []) {
      let quantity = quantityFromRule(service, Math.max(1, totalCameraCount), undefined, estimates);
      if (service.quantityRule?.type === 'per_classification_field') {
        quantity = Number(getByPath(estimates, service.quantityRule.field)) || 0;
      }
      addProductRequest(productRequests, service.serviceProductId, quantity, 'storitev');
    }
  }
}

async function buildOfferItems(zahteva: ZahtevaDocument, tenantId = 'inteligent') {
  const productRequests: ProductRequest[] = [];
  const systemRequests: SystemProductRequests[] = [];

  for (const sistem of zahteva.sistemi ?? []) {
    if (sistem.tip === 'alarm' && sistem.alarm) {
      const alarm = sistem.alarm as any;
      const beforeSystemCount = productRequests.length;

      for (const senzor of alarm.senzorji ?? []) {
        const senzorLokacije = (alarm.lokacije ?? []).filter((lokacija: any) => lokacija.senzorIdAssigned === senzor.id);
        const kolicina = senzorLokacije.length;
        addProductRequest(productRequests, senzor.senzorProductId, kolicina, 'material', {
          requirementsLocationUnits: senzorLokacije.map((lokacija: any) => ({
            locationId: lokacija.id,
            locationName: normalizeText(lokacija.ime, lokacija.id) || lokacija.id,
            sourcePhotoItemId: buildAlarmLocationPhotoItemId(String(zahteva._id), sistem.id, lokacija.id),
          })),
        });
      }

      addProductRequest(productRequests, alarm.centrala?.productId, 1, 'material');
      for (const item of alarm.upravljanje ?? []) {
        addProductRequest(productRequests, item.productId, item.kolicina, 'material');
      }
      for (const item of alarm.sirene ?? []) {
        addProductRequest(productRequests, item.productId, item.kolicina, 'material');
      }
      for (const item of alarm.pozarPoplava ?? []) {
        addProductRequest(productRequests, item.productId, item.kolicina, 'material');
      }
      for (const item of alarm.dodatnaOprema ?? []) {
        addProductRequest(productRequests, item.productId, item.kolicina, 'material');
      }

      systemRequests.push({ sistem, requests: productRequests.slice(beforeSystemCount) });
      continue;
    }

    if (!isVideoRequirementSystem(sistem) || !sistem.videonadzor) continue;
    const videonadzor = sistem.videonadzor;
    const isWifiKamere = sistem.tip === 'wifi_kamere';
    const beforeSystemCount = productRequests.length;

    for (const variant of videonadzor.asortima ?? []) {
      const variantLokacije = (videonadzor.lokacije ?? []).filter((lokacija) => lokacija.asortimaIdAssigned === variant.id);
      const kolicina = variantLokacije.length;
      addProductRequest(productRequests, variant.kameraProductId, kolicina, 'material', {
        requirementsLocationUnits: variantLokacije.map((lokacija) => ({
          locationId: lokacija.id,
          locationName: normalizeText(lokacija.ime, lokacija.id) || lokacija.id,
          sourcePhotoItemId: buildZahtevaLocationPhotoItemId(String(zahteva._id), sistem.id, lokacija.id),
        })),
      });
      addProductRequest(productRequests, variant.nosilecProductId, kolicina, 'material');
    }

    if (!isWifiKamere) {
      addProductRequest(productRequests, videonadzor.snemalnik?.productId, 1, 'material');
      for (const item of selectedEquipmentItems(videonadzor.poeSwitch)) {
        addProductRequest(productRequests, item.productId, item.kolicina, 'material');
      }
      for (const item of selectedEquipmentItems(videonadzor.disk)) {
        addProductRequest(productRequests, item.productId, item.kolicina, 'material');
      }
    }

    for (const dod of videonadzor.dodatnaOprema ?? []) {
      addProductRequest(productRequests, dod.productId, dod.kolicina, 'material');
    }

    systemRequests.push({ sistem, requests: productRequests.slice(beforeSystemCount) });
  }

  await addConfiguredExecutionRequests(zahteva, productRequests, systemRequests, tenantId);

  const mergedProductRequests = mergeProductRequests(productRequests);
  const productIds = Array.from(new Set(mergedProductRequests.map((entry) => entry.productId)));
  const products = await ProductModel.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((product: ProductDocument) => [String(product._id), product]));

  return mergedProductRequests
    .map((entry) => {
      const product = productMap.get(entry.productId);
      return product ? lineFromProduct(product, entry.kolicina, entry.tip, entry.extra) : null;
    })
    .filter((item): item is OfferLineItem => Boolean(item));
}

function validateZahtevaForOffer(zahteva: ZahtevaDocument) {
  if (!Array.isArray(zahteva.sistemi) || zahteva.sistemi.length === 0) {
    throw Object.assign(new Error('Zahteva nima dodanih sistemov.'), { statusCode: 400 });
  }

  for (const sistem of zahteva.sistemi) {
    if (sistem.tip === 'alarm') {
      const alarm = sistem.alarm as any;
      if (!alarm) {
        throw Object.assign(new Error('Alarm sistem nima podatkov.'), { statusCode: 400 });
      }
      const activeLokacije = Array.isArray(alarm.lokacije) ? alarm.lokacije.filter(isMeaningfulAlarmLocation) : [];
      if (activeLokacije.length === 0) {
        throw Object.assign(new Error('Alarm mora imeti vsaj eno lokacijo.'), { statusCode: 400 });
      }
      const senzorIds = new Set((alarm.senzorji ?? []).map((senzor: any) => senzor.id));
      if (senzorIds.size === 0) {
        throw Object.assign(new Error('Alarm mora imeti vsaj en senzor.'), { statusCode: 400 });
      }
      if (!alarm.centrala?.productId) {
        throw Object.assign(new Error('Alarm mora imeti izbrano centralo.'), { statusCode: 400 });
      }
      const missing = activeLokacije.filter((lokacija: any) => !lokacija.senzorIdAssigned);
      if (missing.length > 0) {
        throw Object.assign(new Error('Vse alarmne lokacije morajo imeti dodeljen senzor.'), { statusCode: 400 });
      }
      const invalid = activeLokacije.filter((lokacija: any) => !senzorIds.has(String(lokacija.senzorIdAssigned)));
      if (invalid.length > 0) {
        throw Object.assign(new Error('Alarmna lokacija ima dodeljen neobstoječi senzor.'), { statusCode: 400 });
      }
      continue;
    }

    if (!isVideoRequirementSystem(sistem)) continue;
    const videonadzor = sistem.videonadzor;
    if (!videonadzor) {
      throw Object.assign(new Error('Sistem kamer nima podatkov.'), { statusCode: 400 });
    }
    const activeLokacije = Array.isArray(videonadzor.lokacije) ? videonadzor.lokacije.filter(isMeaningfulVideoLocation) : [];
    if (activeLokacije.length === 0) {
      throw Object.assign(new Error('Sistem kamer mora imeti vsaj eno lokacijo.'), { statusCode: 400 });
    }
    const variantIds = new Set((videonadzor.asortima ?? []).map((variant) => variant.id));
    if (variantIds.size === 0) {
      throw Object.assign(new Error('Sistem kamer mora imeti vsaj eno varianto asortimana.'), { statusCode: 400 });
    }
    const missing = activeLokacije.filter((lokacija) => !lokacija.asortimaIdAssigned);
    if (missing.length > 0) {
      throw Object.assign(new Error('Vse lokacije morajo imeti dodeljeno varianto.'), { statusCode: 400 });
    }
    const invalid = activeLokacije.filter((lokacija) => !variantIds.has(String(lokacija.asortimaIdAssigned)));
    if (invalid.length > 0) {
      throw Object.assign(new Error('Lokacija ima dodeljeno neobstoje?o varianto.'), { statusCode: 400 });
    }
  }
}

export async function nadaljujNaPonudbo(zahtevaId: string, tenantId = 'inteligent') {
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

  validateZahtevaForOffer(zahteva);

  const project = await ProjectModel.findById(zahteva.projectId).lean();
  const projectKey = project?.id ?? String(zahteva.projectId);
  const items = await buildOfferItems(zahteva, tenantId);
  const ponudba = await createOfferVersion({
    projectId: projectKey,
    requestId: String(zahteva._id),
    baseTitle: 'Ponudba',
    items,
    comment: 'Ponudba ustvarjena iz zahteve.',
  });

  zahteva.status = 'koncana';
  zahteva.generatedQuoteId = ponudba._id;
  await zahteva.save();

  return ponudba;
}
