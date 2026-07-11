import { ProductModel } from '../cenik/product.model';
import { IZDELKI_SKUPINE, compareForDisplay, katalogSlug } from '../web-inquiries/web-inquiry.service';
import { ShopSettingsModel, type ShopSettingsDocument, type ShopSyncState } from './shop-settings.model';

const SETTINGS_KEY = 'woocommerce';
const BATCH_SIZE = 10;
const SKU_PREFIX = 'aintel-';

export interface ShopProductPayload {
  sku: string;
  slug: string;
  name: string;
  regularPrice: string;
  shortDescription: string;
  description: string;
  imageSrc: string;
  featured: boolean;
  menuOrder: number;
  categoryKeys: string[];
}

export async function getShopSettings(): Promise<ShopSettingsDocument | null> {
  return ShopSettingsModel.findOne({ key: SETTINGS_KEY });
}

export async function upsertShopSettings(input: {
  baseUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
}): Promise<ShopSettingsDocument> {
  const existing = await ShopSettingsModel.findOne({ key: SETTINGS_KEY });
  if (existing) {
    if (typeof input.baseUrl === 'string' && input.baseUrl.trim()) existing.baseUrl = input.baseUrl.trim().replace(/\/$/, '');
    if (typeof input.consumerKey === 'string' && input.consumerKey.trim()) existing.consumerKey = input.consumerKey.trim();
    if (typeof input.consumerSecret === 'string' && input.consumerSecret.trim()) existing.consumerSecret = input.consumerSecret.trim();
    await existing.save();
    return existing;
  }
  if (!input.baseUrl?.trim() || !input.consumerKey?.trim() || !input.consumerSecret?.trim()) {
    throw new Error('Za prvo nastavitev trgovine so obvezni baseUrl, consumerKey in consumerSecret.');
  }
  return ShopSettingsModel.create({
    key: SETTINGS_KEY,
    baseUrl: input.baseUrl.trim().replace(/\/$/, ''),
    consumerKey: input.consumerKey.trim(),
    consumerSecret: input.consumerSecret.trim(),
  });
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Opisi v ceniku so golo besedilo; trgovina jih prikaže kot HTML odstavke.
export function textToHtml(value: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export function buildProductPayload(product: any, slug: string, menuOrder: number, categoryKey: string): ShopProductPayload {
  return {
    sku: `${SKU_PREFIX}${String(product._id)}`,
    slug,
    name: String(product.ime ?? ''),
    regularPrice: Number(product.prodajnaCena ?? 0).toFixed(2),
    shortDescription: textToHtml(String(product.kratekOpis ?? '').slice(0, 300)),
    description: textToHtml(String(product.dolgOpis ?? '') || String(product.kratekOpis ?? '')),
    imageSrc: String(product.povezavaDoSlike || product?.aaData?.image || ''),
    featured: Boolean(product?.merchandising?.featured),
    menuOrder,
    categoryKeys: [categoryKey],
  };
}

// Ista upravičenost, razvrščanje in slugi kot spletni katalog (getWebKatalog),
// da se povezave /izdelki/<slug> in /trgovina/izdelek/<slug> ujemajo.
export async function buildShopCatalog(): Promise<ShopProductPayload[]> {
  const payloads: ShopProductPayload[] = [];
  // Produkt je lahko v več skupinah (npr. Ajax kamera v kamere + ajax):
  // en zapis z več kategorijami, sicer Woo zavrne podvojen SKU.
  const bySku = new Map<string, ShopProductPayload>();
  const slugsSeen = new Set<string>();
  let menuOrder = 0;
  for (const skupina of IZDELKI_SKUPINE) {
    const candidates = await ProductModel.find({
      ...skupina.query,
      isActive: true,
      prodajnaCena: { $gt: 0 },
      'merchandising.published': { $ne: false },
      $or: [{ povezavaDoSlike: { $nin: [null, ''] } }, { 'aaData.image': { $nin: [null, ''] } }],
    })
      .select({
        ime: 1,
        kratekOpis: 1,
        dolgOpis: 1,
        prodajnaCena: 1,
        povezavaDoSlike: 1,
        'aaData.image': 1,
        merchandising: 1,
        'salesStats.soldQty': 1,
      })
      .lean();
    const sorted = [...candidates].sort(compareForDisplay);
    for (const product of sorted) {
      const sku = `${SKU_PREFIX}${String((product as any)._id)}`;
      const existing = bySku.get(sku);
      if (existing) {
        if (!existing.categoryKeys.includes(skupina.key)) existing.categoryKeys.push(skupina.key);
        continue;
      }
      let slug = katalogSlug(String((product as any).ime ?? '')) || String((product as any)._id);
      while (slugsSeen.has(slug)) slug = `${slug}-2`;
      slugsSeen.add(slug);
      const payload = buildProductPayload(product, slug, menuOrder, skupina.key);
      bySku.set(sku, payload);
      payloads.push(payload);
      menuOrder += 1;
    }
  }
  return payloads;
}

async function wooFetch(
  settings: ShopSettingsDocument,
  method: string,
  apiPath: string,
  body?: unknown,
  timeoutMs = 30000,
): Promise<any> {
  const url = `${settings.baseUrl.replace(/\/$/, '')}/wp-json/wc/v3${apiPath}`;
  const auth = Buffer.from(`${settings.consumerKey}:${settings.consumerSecret}`).toString('base64');
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`WooCommerce ${method} ${apiPath} → ${response.status}: ${text.slice(0, 300)}`);
  }
  return response.json();
}

async function ensureCategories(settings: ShopSettingsDocument): Promise<Map<string, number>> {
  const byKey = new Map<string, number>();
  let page = 1;
  for (;;) {
    const rows: Array<{ id: number; slug: string }> = await wooFetch(
      settings,
      'GET',
      `/products/categories?per_page=100&page=${page}`,
    );
    for (const row of rows) byKey.set(row.slug, row.id);
    if (rows.length < 100) break;
    page += 1;
  }
  for (const skupina of IZDELKI_SKUPINE) {
    if (byKey.has(skupina.key)) continue;
    const created: { id: number } = await wooFetch(settings, 'POST', '/products/categories', {
      name: skupina.label,
      slug: skupina.key,
    });
    byKey.set(skupina.key, created.id);
  }
  return byKey;
}

interface ExistingWooProduct {
  id: number;
  sku: string;
  status: string;
  imageSrc: string;
}

async function listExistingProducts(settings: ShopSettingsDocument): Promise<Map<string, ExistingWooProduct>> {
  const bySku = new Map<string, ExistingWooProduct>();
  let page = 1;
  for (;;) {
    const rows: Array<{
      id: number;
      sku?: string;
      status?: string;
      meta_data?: Array<{ key: string; value: unknown }>;
    }> = await wooFetch(settings, 'GET', `/products?per_page=100&page=${page}&status=any&orderby=id&order=asc`, undefined, 60000);
    for (const row of rows) {
      const sku = String(row.sku ?? '');
      if (!sku.startsWith(SKU_PREFIX)) continue;
      const meta = (row.meta_data ?? []).find((entry) => entry.key === '_aintel_image_src');
      bySku.set(sku, {
        id: row.id,
        sku,
        status: String(row.status ?? ''),
        imageSrc: typeof meta?.value === 'string' ? meta.value : '',
      });
    }
    if (rows.length < 100) break;
    page += 1;
  }
  return bySku;
}

function toWooBody(payload: ShopProductPayload, categoryIds: number[], withImage: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: payload.name,
    slug: payload.slug,
    type: 'simple',
    status: 'publish',
    sku: payload.sku,
    regular_price: payload.regularPrice,
    short_description: payload.shortDescription,
    description: payload.description,
    featured: payload.featured,
    menu_order: payload.menuOrder,
    manage_stock: false,
    categories: categoryIds.map((id) => ({ id })),
    meta_data: [{ key: '_aintel_image_src', value: payload.imageSrc }],
  };
  if (withImage && payload.imageSrc) {
    body.images = [{ src: payload.imageSrc, name: payload.name }];
  }
  return body;
}

async function saveSyncState(patch: Partial<ShopSyncState>): Promise<void> {
  const settings = await ShopSettingsModel.findOne({ key: SETTINGS_KEY });
  if (!settings) return;
  const previous = (settings.lastSync as unknown as { toObject?: () => ShopSyncState })?.toObject?.() ?? settings.lastSync ?? {};
  settings.lastSync = { status: 'idle', ...previous, ...patch } as ShopSyncState;
  settings.markModified('lastSync');
  await settings.save();
}

export async function runShopSync(): Promise<ShopSyncState> {
  const settings = await getShopSettings();
  if (!settings) throw new Error('Trgovina ni nastavljena (manjkajo WooCommerce nastavitve).');

  const state: ShopSyncState = {
    status: 'running',
    startedAt: new Date(),
    processed: 0,
    created: 0,
    updated: 0,
    archived: 0,
    errors: [],
  };
  await saveSyncState(state);

  try {
    const catalog = await buildShopCatalog();
    state.total = catalog.length;
    await saveSyncState(state);

    const categories = await ensureCategories(settings);
    const existing = await listExistingProducts(settings);
    const currentSkus = new Set(catalog.map((item) => item.sku));

    for (let index = 0; index < catalog.length; index += BATCH_SIZE) {
      const chunk = catalog.slice(index, index + BATCH_SIZE);
      const create: Array<Record<string, unknown>> = [];
      const update: Array<Record<string, unknown>> = [];
      for (const payload of chunk) {
        const categoryIds = payload.categoryKeys
          .map((key) => categories.get(key))
          .filter((id): id is number => typeof id === 'number');
        const found = existing.get(payload.sku);
        if (!found) {
          create.push(toWooBody(payload, categoryIds, true));
        } else {
          const imageChanged = payload.imageSrc !== found.imageSrc;
          update.push({ id: found.id, ...toWooBody(payload, categoryIds, imageChanged) });
        }
      }
      const result: {
        create?: Array<{ id?: number; error?: { message?: string } }>;
        update?: Array<{ id?: number; error?: { message?: string } }>;
      } = await wooFetch(settings, 'POST', '/products/batch', { create, update }, 280000);
      for (const row of result.create ?? []) {
        if (row.error) state.errors!.push(`create: ${row.error.message ?? 'napaka'}`);
        else state.created! += 1;
      }
      for (const row of result.update ?? []) {
        if (row.error) state.errors!.push(`update: ${row.error.message ?? 'napaka'}`);
        else state.updated! += 1;
      }
      state.processed = Math.min(index + chunk.length, catalog.length);
      await saveSyncState(state);
    }

    // Produkti, ki niso več objavljeni v ceniku, gredo v osnutek (ne brišemo).
    const toArchive: number[] = [];
    for (const [sku, row] of existing) {
      if (!currentSkus.has(sku) && row.status === 'publish') toArchive.push(row.id);
    }
    for (let index = 0; index < toArchive.length; index += 50) {
      const ids = toArchive.slice(index, index + 50);
      await wooFetch(settings, 'POST', '/products/batch', { update: ids.map((id) => ({ id, status: 'draft' })) }, 120000);
      state.archived! += ids.length;
    }

    state.status = 'done';
    state.finishedAt = new Date();
    state.message = `Prenesenih ${state.created} novih, posodobljenih ${state.updated}, arhiviranih ${state.archived}.`;
    if (state.errors!.length > 0) state.message += ` Napak: ${state.errors!.length}.`;
    await saveSyncState(state);
    return state;
  } catch (error) {
    state.status = 'failed';
    state.finishedAt = new Date();
    state.message = error instanceof Error ? error.message : 'Neznana napaka.';
    await saveSyncState(state);
    return state;
  }
}

let syncPromise: Promise<ShopSyncState> | null = null;

export function startShopSyncInBackground(): { started: boolean; reason?: string } {
  if (syncPromise) return { started: false, reason: 'Sinhronizacija že teče.' };
  syncPromise = runShopSync().finally(() => {
    syncPromise = null;
  });
  return { started: true };
}

export function isShopSyncRunning(): boolean {
  return syncPromise !== null;
}
