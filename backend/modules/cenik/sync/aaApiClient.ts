import type { AAProductRaw } from './types';

const DEFAULT_AA_API_URL = 'https://api.alarmautomatika.com/b2b/GetProducts';
const DEFAULT_AA_COUNTRY = 'si';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAAApiUrl() {
  const apiKey = process.env.AA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('AA_API_KEY is missing. Add it to backend/.env before running AA sync.');
  }

  const baseUrl = process.env.AA_API_URL?.trim() || DEFAULT_AA_API_URL;
  const country = process.env.AA_API_COUNTRY?.trim() || DEFAULT_AA_COUNTRY;
  const url = new URL(baseUrl);
  url.searchParams.set('country', country);
  url.searchParams.set('api_key', apiKey);
  return url.toString();
}

function isRetryable(error: unknown) {
  if (!(error instanceof Error)) return true;
  return !/^AA API error: 4\d\d/.test(error.message);
}

function normalizeAAProduct(input: unknown): AAProductRaw | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const id = typeof row.id === 'string' || typeof row.id === 'number' ? String(row.id).trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!id || !name) return null;

  const attributes = Array.isArray(row.attributes)
    ? row.attributes
        .map((attr) => {
          if (typeof attr !== 'object' || attr === null || Array.isArray(attr)) return null;
          const value = attr as Record<string, unknown>;
          const attribute = typeof value.attribute === 'string' ? value.attribute.trim() : '';
          const term = typeof value.term === 'string' || typeof value.term === 'number' ? String(value.term).trim() : '';
          return attribute && term ? { attribute, term } : null;
        })
        .filter((attr): attr is { attribute: string; term: string } => Boolean(attr))
    : [];

  return {
    id,
    name,
    description: typeof row.description === 'string' ? row.description : '',
    price: typeof row.price === 'number' && Number.isFinite(row.price) ? row.price : Number(row.price ?? 0) || 0,
    currency: typeof row.currency === 'string' ? row.currency : undefined,
    discount:
      typeof row.discount === 'number' && Number.isFinite(row.discount)
        ? row.discount
        : Number(row.discount ?? 0) || 0,
    vat: typeof row.vat === 'number' && Number.isFinite(row.vat) ? row.vat : Number(row.vat ?? 0) || undefined,
    stock: typeof row.stock === 'string' || typeof row.stock === 'number' ? String(row.stock) : '',
    image: typeof row.image === 'string' ? row.image : '',
    category: typeof row.category === 'string' ? row.category : '',
    attributes,
  };
}

function parseProductsPayload(payload: unknown) {
  const products = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null
      ? ((payload as Record<string, unknown>).Products ?? (payload as Record<string, unknown>).products)
      : undefined;

  if (!Array.isArray(products)) {
    throw new Error('AA API returned invalid response. Expected array or { Products: [] }.');
  }

  const normalized = products.map(normalizeAAProduct).filter((item): item is AAProductRaw => Boolean(item));
  if (normalized.length === 0) {
    throw new Error('AA API returned no valid products.');
  }
  return normalized;
}

export async function fetchAAProducts(): Promise<AAProductRaw[]> {
  const url = buildAAApiUrl();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt < 3) {
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`AA API error: ${response.status} ${response.statusText}`);
      }

      return parseProductsPayload(await response.json());
    } catch (error) {
      if (attempt === 3 || !isRetryable(error)) {
        throw error;
      }
      await sleep(1000 * Math.pow(2, attempt));
    }
  }

  throw new Error('AA API fetch failed after 3 attempts.');
}
