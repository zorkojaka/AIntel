import { NextFunction, Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import http from 'http';
import https from 'https';
import type { OfferLineItem, OfferStatus, OfferTemplate, OfferVersion } from '../../../../shared/types/offers';
import { OfferVersionModel } from '../schemas/offer-version';
import { OfferTemplateModel } from '../schemas/offer-template';
import { ProductModel } from '../../cenik/product.model';
import { ProjectModel } from '../schemas/project';
import { renderHtmlToPdf } from '../services/html-pdf.service';
import { renderProductDescriptionsHtml, type ProductDescriptionEntry } from '../services/document-renderers';
import { generateOfferDocumentPdf } from '../services/offer-pdf-preview.service';
import { generateOfferDocumentNumber, type DocumentNumberingKind } from '../services/document-numbering.service';
import { generateOfferDescriptionsPdf } from '../services/offer-description-pdf.service';
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

type OfferImportMatch = {
  productId: string;
  ime: string;
  displayName?: string;
  prodajnaCena: number;
  isService: boolean;
  dobavitelj?: string;
  score?: number;
  reasonFlags?: {
    prefixStrong?: boolean;
    whPreferred?: boolean;
  };
};

type OfferImportTopCandidate = OfferImportMatch & {
  score: number;
};

type OfferImportRowStatus = 'matched' | 'needs_review' | 'not_found' | 'invalid';
type OfferImportReviewLevel = 'ok' | 'low' | 'needs_review' | 'invalid';
type OfferImportChosenReason =
  | 'exact'
  | 'color_default_wh'
  | 'explicit_color'
  | 'base_exact'
  | 'token_best'
  | 'token_needs_review'
  | 'invalid_row';

type OfferImportRow = {
  rowIndex: number;
  rawName: string;
  normName: string;
  normCore?: string;
  qty: number;
  status: OfferImportRowStatus;
  matches: OfferImportMatch[];
  matchCandidates?: OfferImportTopCandidate[];
  chosenProductId?: string;
  chosenReason: OfferImportChosenReason;
  matchScore: number;
  topCandidates: OfferImportTopCandidate[];
  reviewLevel: OfferImportReviewLevel;
};

type OfferImportColor = 'wh' | 'bl';

type OfferImportBaseBucket = {
  variants: {
    wh: OfferImportMatch[];
    bl: OfferImportMatch[];
    other: OfferImportMatch[];
  };
  all: OfferImportMatch[];
};

type OfferImportProduct = OfferImportMatch & {
  normFull: string;
  normCore: string;
  fullTokens: string[];
  coreTokens: string[];
  firstToken: string;
  color: OfferImportColor | null;
  trailingColor: OfferImportColor | null;
  trailingColorWord: 'black' | 'white' | null;
  tokens: string[];
};

function normalizeImportProductName(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanImportedName(value: unknown) {
  const text = normalizeText(value, '');
  if (!text) return '';
  const withoutOuterQuotes =
    text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  return withoutOuterQuotes.replace(/\s+/g, ' ').trim();
}

function parseColorTokenFromName(normName: string): OfferImportColor | null {
  const match = normName.match(/(?:\s+|[-_]\s*)(wh|bl|white|black)$/i);
  if (!match) return null;
  const token = (match[1] ?? '').toLowerCase();
  if (token === 'white') return 'wh';
  if (token === 'black') return 'bl';
  return token === 'wh' || token === 'bl' ? token : null;
}

function parseTrailingColorWord(normName: string): 'black' | 'white' | null {
  const match = normName.match(/(?:\s+|[-_]\s*)(white|black)$/i);
  if (!match) return null;
  const token = (match[1] ?? '').toLowerCase();
  return token === 'white' || token === 'black' ? token : null;
}

function stripTrailingBracketSuffix(normName: string): string {
  let current = normName;
  while (/\s*\([^)]*\)\s*$/.test(current)) {
    current = current.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }
  return current;
}

function stripTrailingVariantCore(normName: string): string {
  let current = stripTrailingBracketSuffix(normName);
  current = current.replace(/(?:\s+|[-_]\s*)(wh|bl|white|black)$/i, '').trim();
  return current.replace(/\s+/g, ' ').trim();
}

function stripTrailingColorToken(normName: string): string {
  return stripTrailingVariantCore(normName);
}

function tokenizeBySpace(normName: string) {
  if (!normName) return [] as string[];
  return normName.split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

function commonPrefixLength(a: string, b: string) {
  const limit = Math.min(a.length, b.length);
  let idx = 0;
  while (idx < limit && a[idx] === b[idx]) {
    idx += 1;
  }
  return idx;
}

function commonPrefixTokenCount(tokensA: string[], tokensB: string[]) {
  const limit = Math.min(tokensA.length, tokensB.length);
  let idx = 0;
  while (idx < limit && tokensA[idx] === tokensB[idx]) {
    idx += 1;
  }
  return idx;
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function sortImportMatches(matches: OfferImportMatch[]) {
  return matches.slice().sort((a, b) => {
    const nameCmp = a.ime.localeCompare(b.ime, 'sl-SI');
    if (nameCmp !== 0) return nameCmp;
    return a.productId.localeCompare(b.productId);
  });
}

function scoreToFixed(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

const IMPORT_TOKEN_STOPWORDS = new Set([
  'in',
  'ter',
  'za',
  'na',
  'od',
  'do',
  'v',
  's',
  'z',
  'pri',
  'po',
  'km',
  'kos',
  'ura',
  'h',
]);

function tokenizeForImportSimilarity(normName: string) {
  if (!normName) return [] as string[];
  return normName
    .replace(/[^\p{L}\p{N}+*]+/gu, ' ')
    .replace(/[+*]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !IMPORT_TOKEN_STOPWORDS.has(token));
}

function computeTokenSimilarity(inputTokens: string[], productTokens: string[]) {
  if (inputTokens.length === 0 || productTokens.length === 0) {
    return 0;
  }
  const inputSet = new Set(inputTokens);
  const productSet = new Set(productTokens);
  let intersection = 0;
  for (const token of inputSet) {
    if (productSet.has(token)) {
      intersection += 1;
    }
  }
  const baseScore = (2 * intersection) / (inputSet.size + productSet.size);
  const inputNumericTokens = Array.from(inputSet).filter((token) => /\d/.test(token));
  const hasAllNumericTokens =
    inputNumericTokens.length > 0 && inputNumericTokens.every((token) => productSet.has(token));
  const bonus = hasAllNumericTokens ? 0.05 : 0;
  return scoreToFixed(baseScore + bonus);
}

function pickBestByColor(
  candidates: OfferImportMatch[],
  requestedColor: OfferImportColor | null,
) {
  if (candidates.length === 0) return null;
  const sorted = sortImportMatches(candidates);
  if (requestedColor) {
    for (const candidate of sorted) {
      const color = parseColorTokenFromName(normalizeImportProductName(candidate.ime));
      if (color === requestedColor) {
        return candidate;
      }
    }
  }
  const whCandidate = sorted.find(
    (candidate) => parseColorTokenFromName(normalizeImportProductName(candidate.ime)) === 'wh',
  );
  return whCandidate ?? sorted[0];
}

function buildTopCandidates(
  candidates: Array<{ product: OfferImportMatch; score: number; reasonFlags?: OfferImportMatch['reasonFlags'] }>,
  limit = 5,
): OfferImportTopCandidate[] {
  const sorted = candidates
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const nameCmp = a.product.ime.localeCompare(b.product.ime, 'sl-SI');
      if (nameCmp !== 0) return nameCmp;
      return a.product.productId.localeCompare(b.product.productId);
    })
    .slice(0, limit)
    .map(({ product, score, reasonFlags }) => ({
      ...product,
      displayName: product.ime,
      score: scoreToFixed(score),
      reasonFlags,
    }));
  return sorted;
}

function shouldPreferWhVariant(topCandidates: OfferImportTopCandidate[]) {
  if (topCandidates.length < 2) return false;
  const top = topCandidates[0];
  const near = topCandidates.filter(
    (candidate) => Math.abs((candidate.score ?? 0) - (top.score ?? 0)) <= 0.02,
  );
  const wh = near.find((candidate) => parseColorTokenFromName(normalizeImportProductName(candidate.ime)) === 'wh');
  const bl = near.find((candidate) => parseColorTokenFromName(normalizeImportProductName(candidate.ime)) === 'bl');
  return Boolean(wh && bl && wh.productId !== top.productId);
}

function chooseCandidateWithWhPreference(topCandidates: OfferImportTopCandidate[]) {
  if (topCandidates.length === 0) return { chosen: undefined, whPreferred: false };
  if (!shouldPreferWhVariant(topCandidates)) {
    return { chosen: topCandidates[0], whPreferred: false };
  }
  const top = topCandidates[0];
  const wh = topCandidates.find(
    (candidate) =>
      parseColorTokenFromName(normalizeImportProductName(candidate.ime)) === 'wh' &&
      Math.abs((candidate.score ?? 0) - (top.score ?? 0)) <= 0.02,
  );
  return { chosen: wh ?? top, whPreferred: Boolean(wh) };
}

function computePrefixFirstScore(inputCore: string, productCore: string) {
  const tokensA = tokenizeBySpace(inputCore);
  const tokensB = tokenizeBySpace(productCore);
  const minLen = Math.min(inputCore.length, productCore.length);
  const minTokenLen = Math.min(tokensA.length, tokensB.length);

  const prefixChars = commonPrefixLength(inputCore, productCore);
  const prefixCharScore = minLen > 0 ? prefixChars / minLen : 0;

  const prefixTokens = commonPrefixTokenCount(tokensA, tokensB);
  const prefixTokenScore = minTokenLen > 0 ? prefixTokens / minTokenLen : 0;

  const containsScore = inputCore.startsWith(productCore) || productCore.startsWith(inputCore) ? 1 : 0;
  const distance = levenshteinDistance(inputCore, productCore);
  const denom = Math.max(inputCore.length, productCore.length, 1);
  const editDistanceScore = 1 - distance / denom;

  const score =
    0.45 * prefixTokenScore +
    0.35 * prefixCharScore +
    0.15 * containsScore +
    0.05 * editDistanceScore;

  const prefixStrong = prefixTokenScore >= 0.6 && prefixCharScore >= 0.6;
  return {
    score: scoreToFixed(score),
    prefixStrong,
    prefixTokenScore: scoreToFixed(prefixTokenScore),
    prefixCharScore: scoreToFixed(prefixCharScore),
    containsScore: scoreToFixed(containsScore),
    editDistanceScore: scoreToFixed(editDistanceScore),
  };
}

function parseLocalizedNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const noSpaces = trimmed.replace(/\s+/g, '');
  const hasComma = noSpaces.includes(',');
  const hasDot = noSpaces.includes('.');
  let normalized = noSpaces;

  if (hasComma && hasDot) {
    normalized = noSpaces.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = noSpaces.replace(',', '.');
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseQuotedDelimitedText(rawText: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];
    const nextChar = rawText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      currentRow.push(currentField);
      currentField = '';
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      rows.push(currentRow);
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function detectDelimiter(rawText: string): string {
  if (rawText.includes('\t')) return '\t';
  const semicolonCount = (rawText.match(/;/g) ?? []).length;
  const commaCount = (rawText.match(/,/g) ?? []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

function extractQuantityFromCells(cells: string[], nameIndex: number) {
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    if (index === nameIndex) continue;
    const cell = normalizeText(cells[index], '');
    if (!cell || cell.includes('%')) continue;
    const parsed = parseLocalizedNumber(cell);
    if (parsed !== null && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function buildOfferImportRows(rawText: string): Array<{ rowIndex: number; cells: string[] }> {
  const delimiter = detectDelimiter(rawText);
  const parsedRows = parseQuotedDelimitedText(rawText, delimiter);
  return parsedRows
    .map((cells, index) => ({ rowIndex: index + 1, cells }))
    .filter(({ cells }) => cells.some((cell) => normalizeText(cell, '').length > 0));
}

export async function parseOfferImport(req: Request, res: Response, next: NextFunction) {
  try {
    const rawText = typeof req.body?.rawText === 'string' ? req.body.rawText : '';
    if (!rawText.trim()) {
      return res.fail('Prilepi tabelo za uvoz.', 400);
    }

    const rowsForParsing = buildOfferImportRows(rawText);
    if (rowsForParsing.length === 0) {
      return res.success({ rows: [] as OfferImportRow[] });
    }

    const products = await ProductModel.find()
      .select({ ime: 1, prodajnaCena: 1, isService: 1, dobavitelj: 1 })
      .lean();

    const exactMap = new Map<string, OfferImportProduct[]>();
    const coreMap = new Map<string, OfferImportProduct[]>();
    const allProducts: OfferImportProduct[] = [];
    for (const product of products) {
      const normFullName = normalizeImportProductName(product.ime);
      if (!normFullName) continue;
      const normCore = stripTrailingVariantCore(normFullName) || normFullName;
      const color = parseColorTokenFromName(normFullName);
      const trailingColorWord = parseTrailingColorWord(normFullName);
      const fullTokens = tokenizeBySpace(normFullName);
      const coreTokens = tokenizeBySpace(normCore);
      const firstToken = coreTokens[0] ?? fullTokens[0] ?? '';
      const tokens = tokenizeForImportSimilarity(normCore);
      const mapped: OfferImportProduct = {
        productId: String(product._id),
        ime: normalizeText(product.ime, ''),
        prodajnaCena: Number(product.prodajnaCena ?? 0),
        isService: Boolean(product.isService),
        dobavitelj: normalizeText((product as any).dobavitelj, '') || undefined,
        normFull: normFullName,
        normCore,
        fullTokens,
        coreTokens,
        firstToken,
        color,
        trailingColor: color,
        trailingColorWord,
        tokens,
      };
      allProducts.push(mapped);

      const exactExisting = exactMap.get(normFullName) ?? [];
      exactExisting.push(mapped);
      exactMap.set(normFullName, exactExisting);

      const coreExisting = coreMap.get(normCore) ?? [];
      coreExisting.push(mapped);
      coreMap.set(normCore, coreExisting);
    }

    for (const [key, matches] of exactMap.entries()) {
      exactMap.set(
        key,
        sortImportMatches(matches).map((match) => match as OfferImportProduct),
      );
    }
    for (const [key, matches] of coreMap.entries()) {
      coreMap.set(
        key,
        sortImportMatches(matches).map((match) => match as OfferImportProduct),
      );
    }

    const rows: OfferImportRow[] = rowsForParsing.map(({ rowIndex, cells }) => {
      const firstTextIndex = cells.findIndex((cell) => cleanImportedName(cell).length > 0);
      const rawName = firstTextIndex >= 0 ? cleanImportedName(cells[firstTextIndex]) : '';
      const normName = normalizeImportProductName(rawName);
      const normCore = stripTrailingVariantCore(normName) || normName;
      const inputColor = parseColorTokenFromName(normName);
      const qty = extractQuantityFromCells(cells, firstTextIndex);
      const toPublicMatch = (product: OfferImportMatch): OfferImportMatch => ({
        productId: product.productId,
        ime: product.ime,
        displayName: product.ime,
        prodajnaCena: product.prodajnaCena,
        isService: product.isService,
        dobavitelj: product.dobavitelj,
        score: product.score,
        reasonFlags: product.reasonFlags,
      });

      if (!rawName || !normName || qty === null || qty <= 0) {
        return {
          rowIndex,
          rawName,
          normName,
          normCore,
          qty: qty ?? 0,
          status: 'invalid',
          matches: [],
          matchCandidates: [],
          chosenReason: 'invalid_row',
          matchScore: 0,
          topCandidates: [],
          reviewLevel: 'invalid',
        };
      }

      if (allProducts.length === 0) {
        return {
          rowIndex,
          rawName,
          normName,
          normCore,
          qty,
          status: 'not_found',
          matches: [],
          matchCandidates: [],
          chosenReason: 'invalid_row',
          matchScore: 0,
          topCandidates: [],
          reviewLevel: 'invalid',
        };
      }

      const exactMatches = normName ? exactMap.get(normName) ?? [] : [];

      if (exactMatches.length === 1) {
        const chosen = exactMatches[0];
        const topCandidates = buildTopCandidates([{ product: toPublicMatch(chosen), score: 1 }]);
        return {
          rowIndex,
          rawName,
          normName,
          normCore,
          qty,
          status: 'matched',
          matches: exactMatches.map((entry) => toPublicMatch(entry)),
          matchCandidates: topCandidates,
          chosenProductId: chosen.productId,
          chosenReason: 'exact',
          matchScore: 1,
          topCandidates,
          reviewLevel: 'ok',
        };
      }

      if (exactMatches.length > 1) {
        const chosen = pickBestByColor(exactMatches, inputColor);
        if (chosen) {
          const topCandidates = buildTopCandidates(
            exactMatches.map((entry) => ({ product: toPublicMatch(entry), score: 1 })),
          );
          return {
            rowIndex,
            rawName,
            normName,
            normCore,
            qty,
            status: inputColor ? 'matched' : 'needs_review',
            matches: exactMatches.map((entry) => toPublicMatch(entry)),
            matchCandidates: topCandidates,
            chosenProductId: chosen.productId,
            chosenReason: inputColor ? 'explicit_color' : 'exact',
            matchScore: 1,
            topCandidates,
            reviewLevel: inputColor ? 'ok' : 'needs_review',
          };
        }
        const topCandidates = buildTopCandidates(
          exactMatches.map((entry) => ({ product: toPublicMatch(entry), score: 1 })),
        );
        return {
          rowIndex,
          rawName,
          normName,
          normCore,
          qty,
          status: 'needs_review',
          matches: exactMatches.map((entry) => toPublicMatch(entry)),
          matchCandidates: topCandidates,
          chosenReason: 'token_needs_review',
          matchScore: 1,
          topCandidates,
          reviewLevel: 'needs_review',
        };
      }

      const coreMatches = normCore ? coreMap.get(normCore) ?? [] : [];
      if (coreMatches.length > 0) {
        const explicitColorMatches =
          inputColor !== null
            ? coreMatches.filter((entry) => parseColorTokenFromName(entry.normFull) === inputColor)
            : [];
        const whMatches = coreMatches.filter((entry) => parseColorTokenFromName(entry.normFull) === 'wh');

        let chosen: OfferImportProduct | null = null;
        let chosenReason: OfferImportChosenReason = 'base_exact';
        if (explicitColorMatches.length > 0) {
          chosen = pickBestByColor(explicitColorMatches, inputColor) as OfferImportProduct | null;
          chosenReason = 'explicit_color';
        } else if (whMatches.length > 0 && coreMatches.length > 1) {
          chosen = pickBestByColor(whMatches, 'wh') as OfferImportProduct | null;
          chosenReason = 'color_default_wh';
        } else {
          chosen = pickBestByColor(coreMatches, inputColor) as OfferImportProduct | null;
          chosenReason = 'base_exact';
        }

        if (chosen) {
          const scoredCoreCandidates = coreMatches.map((entry) => {
            const scoreBreakdown = computePrefixFirstScore(normCore, entry.normCore);
            return {
              product: toPublicMatch({
                ...entry,
                score: scoreBreakdown.score,
                reasonFlags: { prefixStrong: scoreBreakdown.prefixStrong },
              }),
              score: scoreBreakdown.score,
              reasonFlags: { prefixStrong: scoreBreakdown.prefixStrong },
            };
          });
          const topCandidates = buildTopCandidates(scoredCoreCandidates);
          return {
            rowIndex,
            rawName,
            normName,
            normCore,
            qty,
            status: coreMatches.length > 1 ? 'needs_review' : 'matched',
            matches: coreMatches.map((entry) => toPublicMatch(entry)),
            matchCandidates: topCandidates,
            chosenProductId: chosen.productId,
            chosenReason,
            matchScore: topCandidates.find((entry) => entry.productId === chosen?.productId)?.score ?? 0.9,
            topCandidates,
            reviewLevel: coreMatches.length > 1 ? 'needs_review' : 'ok',
          };
        }
      }

      const coreTokens = tokenizeBySpace(normCore);
      const firstToken = coreTokens[0] ?? '';
      const firstPrefix = normCore.slice(0, Math.min(normCore.length, 10));
      const loosePrefix = firstPrefix.slice(0, Math.min(firstPrefix.length, 6));

      let candidatePool = allProducts.filter((product) => {
        if (firstToken && product.firstToken === firstToken) return true;
        if (firstPrefix && product.normCore.startsWith(firstPrefix)) return true;
        if (loosePrefix && product.normCore.includes(loosePrefix)) return true;
        return false;
      });
      if (candidatePool.length < 30) {
        candidatePool = allProducts;
      }

      const tokenCandidatesRaw = candidatePool.map((product) => {
        const scoreBreakdown = computePrefixFirstScore(normCore, product.normCore);
        return {
          product,
          score: scoreBreakdown.score,
          reasonFlags: {
            prefixStrong: scoreBreakdown.prefixStrong,
          },
        };
      });
      const topCandidates = buildTopCandidates(
        tokenCandidatesRaw.map((entry) => ({
          product: toPublicMatch({
            ...entry.product,
            score: entry.score,
            reasonFlags: entry.reasonFlags,
          }),
          score: entry.score,
          reasonFlags: entry.reasonFlags,
        })),
      );

      const { chosen, whPreferred } = chooseCandidateWithWhPreference(topCandidates);
      const bestScore = chosen?.score ?? 0;

      if (chosen && chosen.reasonFlags?.prefixStrong) {
        return {
          rowIndex,
          rawName,
          normName,
          normCore,
          qty,
          status: 'matched',
          matches: topCandidates.map((entry) => ({
            productId: entry.productId,
            ime: entry.ime,
            displayName: entry.displayName ?? entry.ime,
            prodajnaCena: entry.prodajnaCena,
            isService: entry.isService,
            dobavitelj: entry.dobavitelj,
            score: entry.score,
            reasonFlags: entry.reasonFlags,
          })),
          matchCandidates: topCandidates,
          chosenProductId: chosen.productId,
          chosenReason: 'token_best',
          matchScore: bestScore,
          topCandidates,
          reviewLevel: 'ok',
        };
      }

      if (chosen && bestScore >= 0.6) {
        return {
          rowIndex,
          rawName,
          normName,
          normCore,
          qty,
          status: 'matched',
          matches: topCandidates.map((entry) => ({
            productId: entry.productId,
            ime: entry.ime,
            displayName: entry.displayName ?? entry.ime,
            prodajnaCena: entry.prodajnaCena,
            isService: entry.isService,
            dobavitelj: entry.dobavitelj,
            score: entry.score,
            reasonFlags: entry.reasonFlags,
          })),
          matchCandidates: topCandidates.map((entry) =>
            entry.productId === chosen.productId && whPreferred
              ? { ...entry, reasonFlags: { ...(entry.reasonFlags ?? {}), whPreferred: true } }
              : entry,
          ),
          chosenProductId: chosen.productId,
          chosenReason: whPreferred ? 'color_default_wh' : 'token_best',
          matchScore: bestScore,
          topCandidates: topCandidates.map((entry) =>
            entry.productId === chosen.productId && whPreferred
              ? { ...entry, reasonFlags: { ...(entry.reasonFlags ?? {}), whPreferred: true } }
              : entry,
          ),
          reviewLevel: bestScore < 0.7 ? 'low' : 'ok',
        };
      }

      if (chosen && bestScore >= 0.45) {
        const candidatesWithFlags = topCandidates.map((entry) =>
          entry.productId === chosen.productId && whPreferred
            ? { ...entry, reasonFlags: { ...(entry.reasonFlags ?? {}), whPreferred: true } }
            : entry,
        );
        return {
          rowIndex,
          rawName,
          normName,
          normCore,
          qty,
          status: 'needs_review',
          matches: candidatesWithFlags.map((entry) => ({
            productId: entry.productId,
            ime: entry.ime,
            displayName: entry.displayName ?? entry.ime,
            prodajnaCena: entry.prodajnaCena,
            isService: entry.isService,
            dobavitelj: entry.dobavitelj,
            score: entry.score,
            reasonFlags: entry.reasonFlags,
          })),
          matchCandidates: candidatesWithFlags,
          chosenProductId: chosen.productId,
          chosenReason: 'token_needs_review',
          matchScore: bestScore,
          topCandidates: candidatesWithFlags,
          reviewLevel: 'needs_review',
        };
      }

      return {
        rowIndex,
        rawName,
        normName,
        normCore,
        qty,
        status: 'not_found',
        matches: topCandidates.map((entry) => ({
          productId: entry.productId,
          ime: entry.ime,
          displayName: entry.displayName ?? entry.ime,
          prodajnaCena: entry.prodajnaCena,
          isService: entry.isService,
          dobavitelj: entry.dobavitelj,
          score: entry.score,
          reasonFlags: entry.reasonFlags,
        })),
        matchCandidates: topCandidates,
        chosenProductId: chosen?.productId,
        chosenReason: 'token_needs_review',
        matchScore: bestScore,
        topCandidates,
        reviewLevel: 'needs_review',
      };
    });

    return res.success({ rows });
  } catch (error) {
    next(error);
  }
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

function serializeTemplate(template: OfferTemplate) {
  return {
    ...template,
    createdAt: template.createdAt ? new Date(template.createdAt).toISOString() : '',
    updatedAt: template.updatedAt ? new Date(template.updatedAt).toISOString() : '',
    items: (template.items ?? []).map((item) => ({
      ...item,
      casovnaNorma: normalizeCasovnaNorma((item as any).casovnaNorma),
      dobavitelj: (item as any).dobavitelj,
      naslovDobavitelja: (item as any).naslovDobavitelja,
    })),
    paymentTerms: template.paymentTerms ?? null,
    comment: template.comment ?? null,
    discountPercent: template.discountPercent ?? 0,
    globalDiscountPercent: template.globalDiscountPercent ?? template.discountPercent ?? 0,
    discountAmount: template.discountAmount ?? 0,
    totalNetAfterDiscount: template.totalNetAfterDiscount ?? template.totalNet ?? 0,
    totalGrossAfterDiscount: template.totalGrossAfterDiscount ?? template.totalGross ?? 0,
    applyGlobalDiscount: template.applyGlobalDiscount ?? true,
    applyPerItemDiscount: template.applyPerItemDiscount ?? true,
    useGlobalDiscount: template.useGlobalDiscount ?? true,
    usePerItemDiscount: template.usePerItemDiscount ?? false,
    vatMode: (template.vatMode as number) ?? 22,
    baseWithoutVat: template.baseWithoutVat ?? 0,
    perItemDiscountAmount: template.perItemDiscountAmount ?? 0,
    globalDiscountAmount: template.globalDiscountAmount ?? template.discountAmount ?? 0,
    baseAfterDiscount: template.baseAfterDiscount ?? template.totalNetAfterDiscount ?? 0,
    vatAmount: template.vatAmount ?? template.totalVat ?? 0,
    totalWithVat: template.totalWithVat ?? template.totalGrossAfterDiscount ?? template.totalGross ?? 0,
  } as OfferTemplate;
}

function buildOfferSnapshotPayload(input: {
  title: string;
  sourceProjectId?: string | null;
  paymentTerms: string | null;
  comment: string | null;
  items: OfferLineItem[];
  applyGlobalDiscount: boolean;
  applyPerItemDiscount: boolean;
  useGlobalDiscount: boolean;
  usePerItemDiscount: boolean;
  vatMode: number;
  totals: ReturnType<typeof calculateOfferTotals>;
  sourceOfferId?: string | null;
}) {
  return {
    title: input.title,
    sourceProjectId: input.sourceProjectId ?? null,
    sourceOfferId: input.sourceOfferId ?? null,
    paymentTerms: input.paymentTerms,
    comment: input.comment,
    items: input.items,
    totalNet: input.totals.totalNet,
    totalVat22: input.totals.totalVat22,
    totalVat95: input.totals.totalVat95,
    totalVat: input.totals.totalVat,
    totalGross: input.totals.totalGross,
    discountPercent: input.totals.discountPercent,
    globalDiscountPercent: input.totals.discountPercent,
    discountAmount: input.totals.discountAmount,
    totalNetAfterDiscount: input.totals.totalNetAfterDiscount,
    totalGrossAfterDiscount: input.totals.totalGrossAfterDiscount,
    applyGlobalDiscount: input.applyGlobalDiscount,
    applyPerItemDiscount: input.applyPerItemDiscount,
    useGlobalDiscount: input.useGlobalDiscount,
    usePerItemDiscount: input.usePerItemDiscount,
    vatMode: input.vatMode as 0 | 9.5 | 22,
    baseWithoutVat: input.totals.baseWithoutVat ?? input.totals.totalNet ?? 0,
    perItemDiscountAmount: input.totals.perItemDiscountAmount ?? 0,
    globalDiscountAmount: input.totals.globalDiscountAmount ?? 0,
    baseAfterDiscount: input.totals.baseAfterDiscount ?? input.totals.totalNetAfterDiscount ?? 0,
    vatAmount: input.totals.vatAmount ?? input.totals.totalVat ?? 0,
    totalWithVat: input.totals.totalWithVat ?? input.totals.totalGrossAfterDiscount ?? input.totals.totalGross ?? 0,
  };
}

async function parseOfferItemsFromBody(body: Record<string, unknown>) {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const parsedItems = rawItems.map((raw: unknown) => sanitizeLineItem(raw));
  if (parsedItems.some((entry) => entry.error)) {
    return { error: 'Količina postavke mora biti vsaj 1.' };
  }

  const items = parsedItems
    .filter((entry) => entry.item)
    .map((entry) => entry.item as OfferLineItem);
  const itemsWithNorma = await attachCasovnaNorma(items);

  if (!itemsWithNorma.length) {
    return { error: 'Ponudba mora vsebovati vsaj eno veljavno postavko.' };
  }

  return { items: itemsWithNorma };
}

function buildOfferTitleFromTemplate(templateTitle: string) {
  const normalized = normalizeText(templateTitle, 'Template');
  return normalized.toLowerCase().endsWith(' template') ? normalized.slice(0, -9).trim() || 'Ponudba' : normalized;
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

export async function listOfferTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const templates = await OfferTemplateModel.find({}).sort({ updatedAt: -1, title: 1 }).lean();
    return res.success(
      templates.map((template) => ({
        _id: String(template._id),
        title: template.title,
        sourceProjectId: (template as any).sourceProjectId ?? (template as any).projectId ?? null,
        sourceOfferId: template.sourceOfferId ?? null,
        updatedAt: template.updatedAt ? new Date(template.updatedAt).toISOString() : '',
        totalGrossAfterDiscount:
          template.totalGrossAfterDiscount ?? template.totalWithVat ?? template.totalGross ?? 0,
        totalWithVat: template.totalWithVat ?? template.totalGrossAfterDiscount ?? template.totalGross ?? 0,
      }))
    );
  } catch (err) {
    next(err);
  }
}

export async function saveOfferTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const body = req.body ?? {};
    const parsed = await parseOfferItemsFromBody(body);
    if (parsed.error || !parsed.items) {
      return res.fail(parsed.error ?? 'Ponudba mora vsebovati vsaj eno veljavno postavko.', 400);
    }

    const itemsWithNorma = parsed.items;
    const totals = calculateOfferTotals({
      items: itemsWithNorma,
      usePerItemDiscount: body?.usePerItemDiscount ?? false,
      useGlobalDiscount: body?.useGlobalDiscount ?? true,
      globalDiscountPercent: body?.globalDiscountPercent ?? body?.discountPercent ?? 0,
      vatMode: body?.vatMode ?? 22,
    });
    const normalizedTitle = normalizeText(body?.title);
    const templateTitle = normalizedTitle || `${extractBaseTitle(normalizeText(body?.sourceTitle, 'Ponudba'))} template`;
    const normalizedPaymentTerms = normalizeText(body?.paymentTerms);

    const created = await OfferTemplateModel.create(
      buildOfferSnapshotPayload({
        title: templateTitle,
        sourceProjectId: projectId,
        paymentTerms: normalizedPaymentTerms || DEFAULT_PAYMENT_TERMS,
        comment: normalizeText(body?.comment) || null,
        items: itemsWithNorma,
        applyGlobalDiscount: body?.applyGlobalDiscount ?? true,
        applyPerItemDiscount: body?.applyPerItemDiscount ?? true,
        useGlobalDiscount: body?.useGlobalDiscount ?? true,
        usePerItemDiscount: body?.usePerItemDiscount ?? false,
        vatMode: body?.vatMode ?? 22,
        totals,
        sourceOfferId: normalizeText(body?.sourceOfferId) || null,
      })
    );

    return res.success(serializeTemplate(created.toObject() as OfferTemplate));
  } catch (err) {
    next(err);
  }
}

export async function applyOfferTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { templateId } = req.params;
    const template = await OfferTemplateModel.findById(templateId).lean();
    if (!template) {
      return res.fail('Template ne obstaja.', 404);
    }
    return res.success(serializeTemplate(template as OfferTemplate));
  } catch (err) {
    next(err);
  }
}

export async function renameOfferTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { templateId } = req.params;
    const nextTitle = normalizeText(req.body?.title);
    if (!nextTitle) {
      return res.fail('Ime template-a je obvezno.', 400);
    }

    const template = await OfferTemplateModel.findById(templateId);
    if (!template) {
      return res.fail('Template ne obstaja.', 404);
    }

    template.title = nextTitle;
    const nextApplyGlobalDiscount =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'applyGlobalDiscount')
        ? Boolean(req.body.applyGlobalDiscount)
        : template.applyGlobalDiscount ?? true;
    const nextApplyPerItemDiscount =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'applyPerItemDiscount')
        ? Boolean(req.body.applyPerItemDiscount)
        : template.applyPerItemDiscount ?? true;
    const nextGlobalDiscountPercent = Math.min(
      100,
      Math.max(0, Number(req.body?.globalDiscountPercent ?? req.body?.discountPercent ?? template.globalDiscountPercent ?? template.discountPercent ?? 0) || 0)
    );
    const nextUseGlobalDiscount =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'useGlobalDiscount')
        ? Boolean(req.body.useGlobalDiscount)
        : template.useGlobalDiscount ?? true;
    const nextUsePerItemDiscount =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'usePerItemDiscount')
        ? Boolean(req.body.usePerItemDiscount)
        : template.usePerItemDiscount ?? false;
    const nextVatMode =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'vatMode')
        ? ((Number(req.body.vatMode) as 0 | 9.5 | 22) || 22)
        : ((template.vatMode as 0 | 9.5 | 22) ?? 22);
    const totals = calculateOfferTotals({
      items: (template.items ?? []) as OfferLineItem[],
      usePerItemDiscount: nextUsePerItemDiscount,
      useGlobalDiscount: nextUseGlobalDiscount,
      globalDiscountPercent: nextGlobalDiscountPercent,
      vatMode: nextVatMode,
    });

    template.applyGlobalDiscount = nextApplyGlobalDiscount;
    template.applyPerItemDiscount = nextApplyPerItemDiscount;
    template.useGlobalDiscount = nextUseGlobalDiscount;
    template.usePerItemDiscount = nextUsePerItemDiscount;
    template.vatMode = nextVatMode;
    template.discountPercent = totals.discountPercent;
    template.globalDiscountPercent = totals.discountPercent;
    template.discountAmount = totals.discountAmount;
    template.totalNetAfterDiscount = totals.totalNetAfterDiscount;
    template.totalGrossAfterDiscount = totals.totalGrossAfterDiscount;
    template.baseWithoutVat = totals.baseWithoutVat ?? totals.totalNet ?? 0;
    template.perItemDiscountAmount = totals.perItemDiscountAmount ?? 0;
    template.globalDiscountAmount = totals.globalDiscountAmount ?? 0;
    template.baseAfterDiscount = totals.baseAfterDiscount ?? totals.totalNetAfterDiscount ?? 0;
    template.vatAmount = totals.vatAmount ?? totals.totalVat ?? 0;
    template.totalWithVat = totals.totalWithVat ?? totals.totalGrossAfterDiscount ?? totals.totalGross ?? 0;
    await template.save();
    return res.success(serializeTemplate(template.toObject() as OfferTemplate));
  } catch (err) {
    next(err);
  }
}

export async function deleteOfferTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { templateId } = req.params;
    const deleted = await OfferTemplateModel.findByIdAndDelete(templateId);
    return res.success(Boolean(deleted));
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
  const variantParam = typeof req.query.variant === 'string' ? req.query.variant.toLowerCase() : '';
  const mode: 'offer' | 'project' | 'both' =
    modeParam === 'project' || modeParam === 'both' ? (modeParam as 'project' | 'both') : 'offer';
  const includeOffer = mode === 'offer' || mode === 'both';
  const includeProject = mode === 'project' || mode === 'both';
  const docType = parseOfferDocType(req.query.docType);

  const offer = await OfferVersionModel.findOne({ _id: offerVersionId, projectId });
  if (!offer) {
    return res.fail('Ponudba ni najdena.', 404);
  }

  if (variantParam === 'descriptions') {
    try {
      const buffer = await generateOfferDescriptionsPdf(offer as OfferVersion);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="product-descriptions-${offer._id}.pdf"`);
      res.end(buffer);
    } catch (error) {
      console.error('Descriptions PDF failed', error);
      res.fail('Izvoz dokumenta ni uspel. Poskusite znova.', 500);
    }
    return;
  }

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

function sanitizeDescriptionForHtml(value: string) {
  const withoutControls = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  const withoutTags = withoutControls.replace(/<[^>]+>/g, '');
  const normalized = withoutTags.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
  let result = lines.join('\n').trim();
  const limit = 1800;
  if (result.length > limit) {
    result = `${result.slice(0, limit).trim()}…`;
  }
  return result;
}

async function buildDescriptionEntries(offer: OfferVersion): Promise<ProductDescriptionEntry[]> {
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

  const entries: ProductDescriptionEntry[] = [];

  for (const item of items) {
    const productId = item.productId ? String(item.productId) : null;
    const product = productId ? productMap.get(productId) : null;
    const title = product?.ime || item.name;
    const description = sanitizeDescriptionForHtml(String(product?.dolgOpis ?? ''));
    const imageUrl = typeof product?.povezavaDoSlike === 'string' ? product.povezavaDoSlike.trim() : '';
    const hasImage = !!imageUrl;
    const hasDesc = !!description;
    if (!hasImage && !hasDesc) {
      continue;
    }
    let imageDataUrl: string | undefined;
    if (hasImage) {
      imageDataUrl = await fetchImageDataUrl(imageUrl);
    }
    const resolvedHasImage = !!imageDataUrl;
    const resolvedHasDesc = !!description;
    if (!resolvedHasImage && !resolvedHasDesc) {
      continue;
    }
    entries.push({
      title,
      description: resolvedHasDesc ? description : undefined,
      imageUrl: resolvedHasImage ? imageDataUrl : undefined,
    });
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

async function fetchImageDataUrl(url: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      client
        .get(url, (response) => {
          if (!response.statusCode || response.statusCode >= 400) {
            response.resume();
            resolve(undefined);
            return;
          }
          const data: Buffer[] = [];
          response.on('data', (chunk) => data.push(chunk as Buffer));
          response.on('end', () => {
            const buffer = Buffer.concat(data);
            const contentType = response.headers['content-type'] ?? 'image/jpeg';
            const base64 = buffer.toString('base64');
            resolve(`data:${contentType};base64,${base64}`);
          });
        })
        .on('error', () => resolve(undefined));
    } catch {
      resolve(undefined);
    }
  });
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

export async function sendOfferVersionStub(_req: Request, res: Response) {
  return res.fail('Legacy send stub disabled.', 410);
}
