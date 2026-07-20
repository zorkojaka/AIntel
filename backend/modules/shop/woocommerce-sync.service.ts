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

// ── Filtri trgovine: rešitev + proizvajalec (product_cat, dve nadkategoriji) ──
// Rešitev = kot meni glavne strani; slikamo iz product.categorySlugs. Otroci
// nadkategorije 'resitev'; proizvajalec pa otroci nadkategorije 'proizvajalec'.
export const SHOP_PARENT_RESITEV = 'resitev';
export const SHOP_PARENT_PROIZVAJALEC = 'proizvajalec';

const RESITVE: Array<{ slug: string; label: string; match: string[] }> = [
  { slug: 'videonadzor', label: 'Videonadzor', match: ['videonadzor', 'videonadzorni-sistemi', 'kamere', 'kamera', 'ip-kamera', 'wifi-kamera', 'wifi-kamere', 'ptz-kamera', 'ptz-kamere', 'dome', 'bullet', 'vandal-proof', 'snemalnik', 'snemalniki', 'disk', 'trdi-diski', 'dodatki-sistema-videonadzora', 'poe-stikala', 'ptz-tipkovnice'] },
  { slug: 'alarm', label: 'Alarm', match: ['alarm', 'alarm-komponenta', 'alarmne-centrale', 'protivlomni-sistemi', 'detekcija-stanja-okolice', 'detekcija-v-prostoru', 'detekcija-v-tocki', 'detektorji-kovin', 'perimeterska-detekcija', 'signalizacija', 'sistemi-zamegljevanja', 'komunikatorji'] },
  { slug: 'domofon', label: 'Domofon', match: ['domofon', 'domofoni', 'domofoni-in-video-domofoni', 'notranje-enote', 'zunanje-enote', 'dodatki-za-notranje-enote', 'dodatki-za-zunanje-enote', 'moduli-za-zunanje-enote'] },
  { slug: 'pametni-dom', label: 'Pametni dom', match: ['pametni-dom', 'pametna-hisa', 'pametne-hise', 'smarthome', 'smartlife', 'blebox', 'blebox-dodatki', 'wifi-krmilniki', 'wifi-krmilniki-din', 'wifi-krmilniki-pro', 'wifi-senzorji', 'wifi-senzorji-pro', 'bluetooth-krmilniki'] },
  { slug: 'pametne-kljucavnice', label: 'Pametne ključavnice', match: ['pametna-kljucavnica', 'pametne-kljucavnice', 'yale', 'assa-abloy', 'geze'] },
];

// Kanonična imena proizvajalcev (podatek je nedosleden: Ajax/AJAX, Hikvision/HIKVISION …).
const PROIZVAJALEC_KANON: Record<string, string> = {
  ajax: 'Ajax', hikvision: 'Hikvision', dvc: 'DVC', blebox: 'BleBox', reolink: 'Reolink',
  paradox: 'Paradox', dsc: 'DSC', inout: 'INOut', smartlife: 'SmartLife', dahua: 'Dahua',
  vivotek: 'Vivotek', crow: 'Crow', inim: 'Inim', jantar: 'Jantar', yale: 'Yale',
};

export function mapSolutions(categorySlugs: string[]): string[] {
  const set = new Set((categorySlugs ?? []).map((s) => String(s).toLowerCase()));
  const out: string[] = [];
  for (const r of RESITVE) if (r.match.some((m) => set.has(m))) out.push(r.slug);
  return out;
}

// Kuracija trgovine: rešitev "Pametni dom" prikazuje samo pametni dom teh znamk
// (Blebox, SmartLife, Yale). Ajaxova linija LightCore nosi generično oznako
// 'pametne-hise' — enako kot Yale — zato izbire ne moremo narediti po oznaki,
// ampak po znamki. Ajax v trgovini sodi pod alarm, ne pod pametni dom; brez
// pametni-dom obdrži alarm (preverjeno: 0 produktov ostane brez rešitve).
const PAMETNI_DOM_IZKLJUCENE_ZNAMKE = new Set(['ajax']);

export function curateSolutions(solutions: string[], brandSlug: string | null): string[] {
  if (brandSlug && PAMETNI_DOM_IZKLJUCENE_ZNAMKE.has(brandSlug)) {
    return solutions.filter((s) => s !== 'pametni-dom');
  }
  return solutions;
}

export function normalizeBrand(proizvajalec: unknown): { slug: string; label: string } | null {
  const raw = String(proizvajalec ?? '').trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const label = PROIZVAJALEC_KANON[key] ?? raw.replace(/\b\w/g, (c) => c.toUpperCase());
  const slug = katalogSlug(label);
  return slug ? { slug, label } : null;
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

export function buildProductPayload(product: any, slug: string, menuOrder: number): ShopProductPayload {
  const brand = normalizeBrand(product?.proizvajalec);
  const solutions = curateSolutions(mapSolutions(product?.categorySlugs ?? []), brand?.slug ?? null);
  const categoryKeys = [...solutions];
  if (brand) categoryKeys.push(brand.slug);
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
    categoryKeys,
  };
}

// Ista upravičenost, razvrščanje in slugi kot spletni katalog (getWebKatalog),
// da se povezave /izdelki/<slug> in /trgovina/izdelek/<slug> ujemajo.
export async function buildShopCatalog(): Promise<{
  payloads: ShopProductPayload[];
  categories: Map<string, { label: string; parent: string | null }>;
}> {
  const payloads: ShopProductPayload[] = [];
  const categories = neededShopCategories(); // nadkategoriji + rešitve; proizvajalce dodamo sproti
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
        categorySlugs: 1,
        proizvajalec: 1,
      })
      .lean();
    const sorted = [...candidates].sort(compareForDisplay);
    for (const product of sorted) {
      const sku = `${SKU_PREFIX}${String((product as any)._id)}`;
      if (bySku.has(sku)) continue; // produkt je lahko v več skupinah — kategorije so že izpeljane iz njega
      let slug = katalogSlug(String((product as any).ime ?? '')) || String((product as any)._id);
      while (slugsSeen.has(slug)) slug = `${slug}-2`;
      slugsSeen.add(slug);
      const payload = buildProductPayload(product, slug, menuOrder);
      const brand = normalizeBrand((product as any).proizvajalec);
      if (brand && !categories.has(brand.slug)) categories.set(brand.slug, { label: brand.label, parent: SHOP_PARENT_PROIZVAJALEC });
      bySku.set(sku, payload);
      payloads.push(payload);
      menuOrder += 1;
    }
  }
  return { payloads, categories };
}

// Nadkategoriji + rešitve (fiksne); proizvajalce doda buildShopCatalog sproti.
export function neededShopCategories(): Map<string, { label: string; parent: string | null }> {
  const map = new Map<string, { label: string; parent: string | null }>();
  map.set(SHOP_PARENT_RESITEV, { label: 'Rešitev', parent: null });
  map.set(SHOP_PARENT_PROIZVAJALEC, { label: 'Proizvajalec', parent: null });
  for (const r of RESITVE) map.set(r.slug, { label: r.label, parent: SHOP_PARENT_RESITEV });
  return map;
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

async function ensureCategories(
  settings: ShopSettingsDocument,
  needed: Map<string, { label: string; parent: string | null }>,
): Promise<Map<string, number>> {
  const byKey = new Map<string, number>();
  const existing = new Map<string, { id: number; parent: number; name: string }>();
  let page = 1;
  for (;;) {
    const rows: Array<{ id: number; slug: string; parent?: number; name?: string }> = await wooFetch(
      settings,
      'GET',
      `/products/categories?per_page=100&page=${page}`,
    );
    for (const row of rows) {
      byKey.set(row.slug, row.id);
      existing.set(row.slug, { id: row.id, parent: Number(row.parent ?? 0), name: String(row.name ?? '') });
    }
    if (rows.length < 100) break;
    page += 1;
  }
  // Najprej nadkategorije (parent=null), da so otroci lahko vezani nanje.
  const ordered = [...needed.entries()].sort((a, b) => Number(a[1].parent !== null) - Number(b[1].parent !== null));
  for (const [slug, def] of ordered) {
    const parentId = def.parent ? byKey.get(def.parent) ?? 0 : 0;
    const ex = existing.get(slug);
    if (ex) {
      // Samopopravek: če star zapis (npr. skupina 'ajax') visi na napačnem starševstvu
      // ali ima staro ime, ga uskladimo (sicer proizvajalec pristane izven 'Proizvajalec').
      if ((def.parent && ex.parent !== parentId) || (def.label && ex.name !== def.label)) {
        await wooFetch(settings, 'PUT', `/products/categories/${ex.id}`, { parent: parentId, name: def.label });
      }
      continue;
    }
    const created: { id: number } = await wooFetch(settings, 'POST', '/products/categories', {
      name: def.label,
      slug,
      ...(parentId ? { parent: parentId } : {}),
    });
    byKey.set(slug, created.id);
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
    const { payloads: catalog, categories: neededCats } = await buildShopCatalog();
    state.total = catalog.length;
    await saveSyncState(state);

    const categories = await ensureCategories(settings, neededCats);
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
