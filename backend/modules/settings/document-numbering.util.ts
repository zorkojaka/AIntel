import type { DocumentNumberingConfig } from './Settings';

export const DEFAULT_OFFER_NUMBER_PATTERN = 'PONUDBA-{YYYY}-{SEQ:000}';
const TOKEN_REGEX = /\{([^}]+)\}/g;
const MAX_PATTERN_LENGTH = 80;

const allowedTokens = new Set(['YYYY', 'YY', 'MM', 'DD', 'SEQ']);

function normalizeSeqToken(token: string) {
  const parts = token.split(':');
  const paddingRaw = parts[1] ?? '000';
  if (!/^0{1,6}$/.test(paddingRaw)) {
    return '{SEQ:000}';
  }
  return `{SEQ:${paddingRaw}}`;
}

export function normalizeNumberPattern(input?: string | null, fallback = DEFAULT_OFFER_NUMBER_PATTERN) {
  if (typeof input !== 'string') {
    return fallback;
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_PATTERN_LENGTH) {
    return fallback;
  }

  let hasSeq = false;
  let invalid = false;

  const normalized = trimmed.replace(TOKEN_REGEX, (match, raw) => {
    const token = String(raw ?? '').trim().toUpperCase();
    if (!token) {
      invalid = true;
      return match;
    }
    if (!token.startsWith('SEQ') && !allowedTokens.has(token)) {
      invalid = true;
      return match;
    }
    if (token === 'YYYY' || token === 'YY' || token === 'MM' || token === 'DD') {
      return `{${token}}`;
    }
    if (token.startsWith('SEQ')) {
      hasSeq = true;
      return normalizeSeqToken(token);
    }
    invalid = true;
    return match;
  });

  if (invalid) {
    return fallback;
  }

  if (!hasSeq) {
    const separator = normalized.endsWith('-') ? '' : '-';
    return `${normalized}${separator}{SEQ:000}`;
  }

  return normalized;
}

export function buildPatternFromPrefix(prefix: string | undefined) {
  const value = typeof prefix === 'string' ? prefix.trim() : '';
  if (!value) {
    return DEFAULT_OFFER_NUMBER_PATTERN;
  }
  const separator = value.endsWith('-') ? '' : '-';
  return `${value}${separator}{YYYY}-{SEQ:000}`;
}

function padSequence(sequence: number, token: string) {
  const match = token.match(/^SEQ(?::(0{1,6}))?$/);
  const padding = match?.[1] ?? '000';
  const width = Math.max(padding.length, 1);
  return String(Math.max(0, sequence)).padStart(width, '0');
}

export function formatDocumentNumber(
  pattern: string,
  date: Date,
  sequence: number,
  options?: { yearOverride?: number | null }
) {
  const safePattern = normalizeNumberPattern(pattern);
  const targetDate = date instanceof Date && !Number.isNaN(date.valueOf()) ? date : new Date();
  const effectiveYear = options?.yearOverride ?? targetDate.getFullYear();
  const fullYear = String(effectiveYear);
  const shortYear = fullYear.slice(-2).padStart(2, '0');
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');

  return safePattern.replace(TOKEN_REGEX, (match, raw) => {
    const token = String(raw ?? '').trim().toUpperCase();
    switch (token) {
      case 'YYYY':
        return fullYear;
      case 'YY':
        return shortYear;
      case 'MM':
        return month;
      case 'DD':
        return day;
      default: {
        if (token.startsWith('SEQ')) {
          return padSequence(sequence, token);
        }
        return match;
      }
    }
  });
}

export function ensureOfferNumberingConfig(config?: DocumentNumberingConfig | null): DocumentNumberingConfig {
  const pattern = normalizeNumberPattern(config?.pattern);
  const reset = config?.reset === 'never' ? 'never' : 'yearly';
  const safeYearOverride =
    typeof config?.yearOverride === 'number' && Number.isFinite(config.yearOverride) ? config.yearOverride : undefined;
  const safeSeqOverride =
    typeof config?.seqOverride === 'number' && Number.isFinite(config.seqOverride) && config.seqOverride > 0
      ? Math.floor(config.seqOverride)
      : undefined;

  return {
    pattern,
    reset,
    yearOverride: safeYearOverride,
    seqOverride: safeSeqOverride,
  };
}
