import {
  DEFAULT_COMPANY_SETTINGS,
  DEFAULT_DOCUMENT_SETTINGS,
  OfferPdfOverrideModel,
  PdfCompanySettings,
  PdfCompanySettingsModel,
  PdfDocumentSettings,
  PdfDocumentSettingsModel,
  PdfDocumentType,
} from '../schemas/pdf-settings';

const ALLOWED_DOC_TYPES: PdfDocumentType[] = [
  'OFFER',
  'INVOICE',
  'PURCHASE_ORDER',
  'DELIVERY_NOTE',
  'WORK_ORDER',
  'WORK_ORDER_CONFIRMATION',
  'CREDIT_NOTE',
];

const DOC_DEFAULTS: Record<PdfDocumentType, PdfDocumentSettings> = {
  OFFER: DEFAULT_DOCUMENT_SETTINGS,
  INVOICE: {
    ...DEFAULT_DOCUMENT_SETTINGS,
    docType: 'INVOICE',
    numberingRule: { ...DEFAULT_DOCUMENT_SETTINGS.numberingRule, prefix: 'RAC' },
    defaultTexts: {
      paymentTerms: 'Placilo v 8 dneh po izstavitvi racuna.',
      disclaimer: 'Racun je izdan na podlagi izvedenih storitev.',
    },
  },
  PURCHASE_ORDER: {
    ...DEFAULT_DOCUMENT_SETTINGS,
    docType: 'PURCHASE_ORDER',
    numberingRule: { ...DEFAULT_DOCUMENT_SETTINGS.numberingRule, prefix: 'NOR' },
    defaultTexts: {
      paymentTerms: '',
      disclaimer: 'Narocilo velja ob pisni potrditvi.',
    },
  },
  DELIVERY_NOTE: {
    ...DEFAULT_DOCUMENT_SETTINGS,
    docType: 'DELIVERY_NOTE',
    numberingRule: { ...DEFAULT_DOCUMENT_SETTINGS.numberingRule, prefix: 'DOB' },
    defaultTexts: {
      paymentTerms: '',
      disclaimer: 'Prevzem potrjuje kolicine brez cen.',
    },
  },
  WORK_ORDER: {
    ...DEFAULT_DOCUMENT_SETTINGS,
    docType: 'WORK_ORDER',
    numberingRule: { ...DEFAULT_DOCUMENT_SETTINGS.numberingRule, prefix: 'DEL' },
    defaultTexts: {
      paymentTerms: '',
      disclaimer: 'Delovni nalog zajema dogovorjene naloge.',
    },
  },
  WORK_ORDER_CONFIRMATION: {
    ...DEFAULT_DOCUMENT_SETTINGS,
    docType: 'WORK_ORDER_CONFIRMATION',
    numberingRule: { ...DEFAULT_DOCUMENT_SETTINGS.numberingRule, prefix: 'POT' },
    defaultTexts: {
      paymentTerms: '',
      disclaimer: 'Potrdilo delovnega naloga potrjuje izvedbo.',
    },
  },
  CREDIT_NOTE: {
    ...DEFAULT_DOCUMENT_SETTINGS,
    docType: 'CREDIT_NOTE',
    numberingRule: { ...DEFAULT_DOCUMENT_SETTINGS.numberingRule, prefix: 'DOBR' },
    defaultTexts: {
      paymentTerms: '',
      disclaimer: 'Dobropis zmanjsuje znesek izdanega racuna.',
    },
  },
};

function normalizeString(value: unknown) {
  if (typeof value === 'string') {
    return value.normalize('NFC').trim();
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value).normalize('NFC').trim();
}

function sanitizeCompanyPayload(payload: Partial<PdfCompanySettings>): Partial<PdfCompanySettings> {
  return {
    companyName: normalizeString(payload.companyName) ?? DEFAULT_COMPANY_SETTINGS.companyName,
    address: normalizeString(payload.address) ?? DEFAULT_COMPANY_SETTINGS.address,
    email: normalizeString(payload.email),
    phone: normalizeString(payload.phone),
    vatId: normalizeString(payload.vatId),
    iban: normalizeString(payload.iban),
    directorName: normalizeString(payload.directorName),
    logoUrl: normalizeString(payload.logoUrl),
    logoAssetId: normalizeString(payload.logoAssetId),
  };
}

function sanitizeDocumentPayload(payload: Partial<PdfDocumentSettings>): Partial<PdfDocumentSettings> {
  const numbering = (payload.numberingRule ?? {}) as Partial<PdfDocumentSettings['numberingRule']>;
  const texts = (payload.defaultTexts ?? {}) as Partial<PdfDocumentSettings['defaultTexts']>;

  const normalizedNumbering = {
    prefix: normalizeString(numbering.prefix) ?? DEFAULT_DOCUMENT_SETTINGS.numberingRule.prefix,
    formatPreset: (numbering.formatPreset as PdfDocumentSettings['numberingRule']['formatPreset']) ??
      DEFAULT_DOCUMENT_SETTINGS.numberingRule.formatPreset,
    nextSequence: typeof numbering.nextSequence === 'number' && Number.isFinite(numbering.nextSequence)
      ? Math.max(1, Math.floor(numbering.nextSequence))
      : DEFAULT_DOCUMENT_SETTINGS.numberingRule.nextSequence,
    resetPolicy: (numbering.resetPolicy as PdfDocumentSettings['numberingRule']['resetPolicy']) ??
      DEFAULT_DOCUMENT_SETTINGS.numberingRule.resetPolicy,
    padding: typeof numbering.padding === 'number' && Number.isFinite(numbering.padding)
      ? Math.min(6, Math.max(1, Math.floor(numbering.padding)))
      : DEFAULT_DOCUMENT_SETTINGS.numberingRule.padding,
  } as PdfDocumentSettings['numberingRule'];

  const normalizedTexts: PdfDocumentSettings['defaultTexts'] = {};
  const paymentTerms = normalizeString(texts.paymentTerms);
  if (paymentTerms !== undefined) {
    normalizedTexts.paymentTerms = paymentTerms;
  }
  const disclaimer = normalizeString(texts.disclaimer);
  if (disclaimer !== undefined) {
    normalizedTexts.disclaimer = disclaimer;
  }

  const sanitizedTemplate =
    typeof payload.templateHtml === 'string' ? payload.templateHtml : payload.templateHtml === null ? null : undefined;

  return {
    numberingRule: normalizedNumbering,
    defaultTexts: normalizedTexts,
    templateHtml: sanitizedTemplate,
  };
}

function ensureDocType(docType?: string): PdfDocumentType {
  const normalized = (docType ?? 'OFFER').toUpperCase();
  if (ALLOWED_DOC_TYPES.includes(normalized as PdfDocumentType)) {
    return normalized as PdfDocumentType;
  }
  throw new Error(`Unsupported document type: ${docType}`);
}

export async function getCompanySettings() {
  const existing =
    (await PdfCompanySettingsModel.findById('singleton').lean()) ??
    (await PdfCompanySettingsModel.create({ _id: 'singleton', ...DEFAULT_COMPANY_SETTINGS }).then((doc) => doc.toObject()));

  return { ...DEFAULT_COMPANY_SETTINGS, ...existing };
}

export async function updateCompanySettings(payload: Partial<PdfCompanySettings>) {
  const sanitized = sanitizeCompanyPayload(payload);
  const doc =
    (await PdfCompanySettingsModel.findById('singleton')) ??
    new PdfCompanySettingsModel({ _id: 'singleton', ...DEFAULT_COMPANY_SETTINGS });

  Object.assign(doc, sanitized);
  await doc.save();
  return { ...DEFAULT_COMPANY_SETTINGS, ...doc.toObject() };
}

export async function getPdfDocumentSettings(docType?: string) {
  const normalizedType = ensureDocType(docType);
  const existing =
    (await PdfDocumentSettingsModel.findOne({ docType: normalizedType }).lean()) ??
    (await PdfDocumentSettingsModel.create({ ...DOC_DEFAULTS[normalizedType], docType: normalizedType }).then((doc) => doc.toObject()));

  return {
    ...DOC_DEFAULTS[normalizedType],
    ...existing,
    docType: normalizedType,
    numberingRule: {
      ...DOC_DEFAULTS[normalizedType].numberingRule,
      ...(existing.numberingRule ?? {}),
    },
    defaultTexts: {
      ...DOC_DEFAULTS[normalizedType].defaultTexts,
      ...(existing.defaultTexts ?? {}),
    },
  };
}

export async function updatePdfDocumentSettings(docType: string | undefined, payload: Partial<PdfDocumentSettings>) {
  const normalizedType = ensureDocType(docType);
  const sanitized = sanitizeDocumentPayload(payload);
  const doc =
    (await PdfDocumentSettingsModel.findOne({ docType: normalizedType })) ??
    new PdfDocumentSettingsModel({ ...DOC_DEFAULTS[normalizedType], docType: normalizedType });

  doc.numberingRule = {
    ...(doc.numberingRule ?? DOC_DEFAULTS[normalizedType].numberingRule),
    ...(sanitized.numberingRule ?? {}),
  };

  doc.defaultTexts = {
    ...(doc.defaultTexts ?? DOC_DEFAULTS[normalizedType].defaultTexts),
    ...(sanitized.defaultTexts ?? {}),
  };

  if (sanitized.templateHtml !== undefined) {
    doc.templateHtml = sanitized.templateHtml;
  }

  await doc.save();
  return getPdfDocumentSettings(normalizedType);
}

export async function getOfferPdfOverride(offerVersionId: string) {
  if (!offerVersionId) return null;
  return OfferPdfOverrideModel.findOne({ offerVersionId }).lean();
}
