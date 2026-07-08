/**
 * ECO-32: customer-friendly copy for flagship Ajax products.
 *
 * The AA API stays the source of truth for the Ajax range (prices, stock,
 * assortment) — we order Ajax through Alarm Automatika. This module only
 * rewrites the sales-facing texts: data/cenik/ajax_vsebine.json holds
 * Slovenian customer-friendly kratekOpis/dolgOpis (and optionally the
 * official ajax.systems product link), keyed by name-matching rules so color
 * variants share content. Applied inside the AA product mapper, so every AA
 * re-sync re-applies the copy; the technical AA description always stays in
 * aaData.rawDescription.
 *
 * Fail-open: if the file is missing or invalid, products pass through
 * unchanged (a warning is logged once).
 */
import fs from 'node:fs';
import path from 'node:path';

type AjaxContentRule = {
  match: string;
  kratekOpis?: string;
  dolgOpis?: string;
  povezavaDoProdukta?: string;
};

type CompiledRule = Omit<AjaxContentRule, 'match'> & { match: RegExp };

const CONTENT_PATH = path.resolve(__dirname, '..', '..', '..', 'data', 'cenik', 'ajax_vsebine.json');

let cachedRules: CompiledRule[] | null = null;

function loadRules(): CompiledRule[] {
  if (cachedRules) return cachedRules;
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8')) as { rules?: AjaxContentRule[] };
    cachedRules = (parsed.rules ?? [])
      .filter((rule) => typeof rule.match === 'string' && rule.match.trim() !== '')
      .map((rule) => ({ ...rule, match: new RegExp(rule.match, 'i') }));
  } catch (error) {
    console.warn(
      `[ajax-content-overrides] Could not load ${CONTENT_PATH}: ${error instanceof Error ? error.message : error}`,
    );
    cachedRules = [];
  }
  return cachedRules;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function findAjaxContentRule(ime: unknown): CompiledRule | null {
  if (typeof ime !== 'string') return null;
  const name = normalizeName(ime);
  if (!name.startsWith('ajax')) return null;
  return loadRules().find((rule) => rule.match.test(name)) ?? null;
}

// EOL/discontinued notes from AA carry sales-critical info ("NADOMEŠČA GA:
// ..."); never bury them under marketing copy.
export function hasEolMarker(...texts: Array<string | undefined>) {
  return texts.some((text) => typeof text === 'string' && /\bEOL\b/i.test(text));
}

export function applyAjaxContentOverride<
  T extends { ime?: unknown; isService?: unknown; kratekOpis?: string; dolgOpis?: string; povezavaDoProdukta?: string },
>(product: T): T {
  if (product.isService === true) return product;
  if (hasEolMarker(product.kratekOpis, product.dolgOpis)) return product;
  const rule = findAjaxContentRule(product.ime);
  if (!rule) return product;

  return {
    ...product,
    ...(rule.kratekOpis ? { kratekOpis: rule.kratekOpis.slice(0, 200) } : {}),
    ...(rule.dolgOpis ? { dolgOpis: rule.dolgOpis } : {}),
    ...(rule.povezavaDoProdukta ? { povezavaDoProdukta: rule.povezavaDoProdukta } : {}),
  };
}
