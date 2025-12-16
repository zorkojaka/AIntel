import { DocumentCounterModel } from '../../settings/document-counter.model';
import { getSettings } from '../../settings/settings.service';
import {
  DEFAULT_OFFER_NUMBER_PATTERN,
  ensureOfferNumberingConfig,
  formatDocumentNumber,
} from '../../settings/document-numbering.util';
import type { DocumentNumberingConfig } from '../../settings/Settings';

interface OfferNumberingConfig extends DocumentNumberingConfig {
  pattern: string;
}

export async function getOfferNumberingConfig(): Promise<OfferNumberingConfig> {
  const settings = await getSettings();
  const config = ensureOfferNumberingConfig(settings.documentNumbering?.offer ?? null);
  return config;
}

function resolveCounterKey(config: OfferNumberingConfig, effectiveYear: number) {
  return config.reset === 'yearly' ? `offer:${effectiveYear}` : 'offer';
}

function resolveInitialSequence(config: OfferNumberingConfig) {
  if (config.seqOverride && Number.isFinite(config.seqOverride)) {
    return Math.max(1, Math.floor(config.seqOverride));
  }
  return 1;
}

export function formatOfferNumberExample(
  pattern: string,
  referenceDate: Date = new Date(),
  sequence = 1,
  yearOverride?: number | null
) {
  return formatDocumentNumber(pattern || DEFAULT_OFFER_NUMBER_PATTERN, referenceDate, sequence, {
    yearOverride,
  });
}

export async function generateOfferDocumentNumber(referenceDate: Date = new Date()) {
  const config = await getOfferNumberingConfig();
  const date = referenceDate instanceof Date && !Number.isNaN(referenceDate.valueOf()) ? referenceDate : new Date();
  const effectiveYear = config.yearOverride ?? date.getFullYear();
  const counterKey = resolveCounterKey(config, effectiveYear);
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
  const number = formatOfferNumberExample(config.pattern ?? DEFAULT_OFFER_NUMBER_PATTERN, date, sequence, config.yearOverride);

  return {
    number,
    sequence,
    pattern: config.pattern ?? DEFAULT_OFFER_NUMBER_PATTERN,
    year: effectiveYear,
  };
}

export async function getOfferNumberingExample() {
  const config = await getOfferNumberingConfig();
  const example = formatOfferNumberExample(config.pattern ?? DEFAULT_OFFER_NUMBER_PATTERN, new Date(), 1, config.yearOverride);
  return {
    pattern: config.pattern ?? DEFAULT_OFFER_NUMBER_PATTERN,
    example,
  };
}
