import { DocumentCounterModel } from '../../settings/document-counter.model';
import { getSettings } from '../../settings/settings.service';
import {
  DEFAULT_OFFER_NUMBER_PATTERN,
  ensureDocumentNumberingConfig,
  formatDocumentNumber,
  getDefaultPattern,
} from '../../settings/document-numbering.util';
import type { DocumentNumberingConfig, DocumentTypeKey } from '../../settings/Settings';

export type DocumentNumberingKind =
  | 'OFFER'
  | 'INVOICE'
  | 'PURCHASE_ORDER'
  | 'DELIVERY_NOTE'
  | 'WORK_ORDER'
  | 'WORK_ORDER_CONFIRMATION'
  | 'CREDIT_NOTE';

const DOC_TYPE_MAP: Record<DocumentNumberingKind, DocumentTypeKey> = {
  OFFER: 'offer',
  INVOICE: 'invoice',
  PURCHASE_ORDER: 'materialOrder',
  DELIVERY_NOTE: 'deliveryNote',
  WORK_ORDER: 'workOrder',
  WORK_ORDER_CONFIRMATION: 'workOrderConfirmation',
  CREDIT_NOTE: 'creditNote',
};

interface NumberingConfig extends DocumentNumberingConfig {
  pattern: string;
}

function resolveCounterKey(config: NumberingConfig, docType: DocumentNumberingKind, effectiveYear: number) {
  const prefix = DOC_TYPE_MAP[docType];
  const baseKey = prefix ?? 'document';
  return config.reset === 'yearly' ? `${baseKey}:${effectiveYear}` : baseKey;
}

function resolveInitialSequence(config: NumberingConfig) {
  if (config.seqOverride && Number.isFinite(config.seqOverride)) {
    return Math.max(1, Math.floor(config.seqOverride));
  }
  return 1;
}

export async function getDocumentNumberingConfig(docType: DocumentNumberingKind): Promise<NumberingConfig> {
  const settings = await getSettings();
  const key = DOC_TYPE_MAP[docType] ?? 'offer';
  const config = ensureDocumentNumberingConfig(key, settings.documentNumbering?.[key] ?? null);
  return config;
}

export const getOfferNumberingConfig = () => getDocumentNumberingConfig('OFFER');

export function formatNumberExample(
  pattern: string,
  referenceDate: Date = new Date(),
  sequence = 1,
  yearOverride?: number | null,
  docType: DocumentNumberingKind = 'OFFER',
) {
  const fallback = pattern || getDefaultPattern(DOC_TYPE_MAP[docType] ?? 'offer');
  return formatDocumentNumber(fallback, referenceDate, sequence, {
    yearOverride,
  });
}

export async function generateDocumentNumber(docType: DocumentNumberingKind, referenceDate: Date = new Date()) {
  const config = await getDocumentNumberingConfig(docType);
  const date = referenceDate instanceof Date && !Number.isNaN(referenceDate.valueOf()) ? referenceDate : new Date();
  const effectiveYear = config.yearOverride ?? date.getFullYear();
  const counterKey = resolveCounterKey(config, docType, effectiveYear);
  const baseSequence = resolveInitialSequence(config);

  const counter = await DocumentCounterModel.findOneAndUpdate(
    { _id: counterKey },
    {
      $setOnInsert: { value: baseSequence - 1 },
      $inc: { value: 1 },
    },
    { new: true, upsert: true }
  ).lean();

  const sequence = counter?.value ?? baseSequence;
  const number = formatNumberExample(
    config.pattern ?? DEFAULT_OFFER_NUMBER_PATTERN,
    date,
    sequence,
    config.yearOverride,
    docType,
  );

  return {
    number,
    sequence,
    pattern: config.pattern ?? DEFAULT_OFFER_NUMBER_PATTERN,
    year: effectiveYear,
  };
}

export const generateOfferDocumentNumber = (referenceDate: Date = new Date()) =>
  generateDocumentNumber('OFFER', referenceDate);

export async function getNumberingExample(docType: DocumentNumberingKind) {
  const config = await getDocumentNumberingConfig(docType);
  const example = formatNumberExample(
    config.pattern ?? DEFAULT_OFFER_NUMBER_PATTERN,
    new Date(),
    1,
    config.yearOverride,
    docType,
  );
  return {
    pattern: config.pattern ?? DEFAULT_OFFER_NUMBER_PATTERN,
    example,
  };
}

export const getOfferNumberingExample = () => getNumberingExample('OFFER');
