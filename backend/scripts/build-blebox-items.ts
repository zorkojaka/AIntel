/**
 * ECO-31: Build cenik import items for the "blebox" source.
 *
 * Merges data/cenik/blebox_raw.json (scraped snapshot from blebox.eu, see
 * scripts/scrape-blebox.ts) with Slovenian copy from
 * data/cenik/blebox_prevodi.json into data/cenik/blebox_produkti.json —
 * the same aintel-product-v1 shape the other snapshot sources use.
 *
 * Prices are intentionally NOT part of __providedFields: BleBox has no public
 * price list, so nabavna/prodajna cena are owner-maintained in the cenik and
 * must survive every content re-sync. New products are created with price 0
 * and stay hidden on the website until priced and activated
 * (getWebIzdelki filters isActive + prodajnaCena > 0 + image).
 *
 * Usage: ts-node --transpile-only scripts/build-blebox-items.ts [--image-base <url>]
 */
import fs from 'node:fs';
import path from 'node:path';

import { IMPORT_DEFAULTS } from '../modules/cenik/sync/importDefaults';

const RAW_PATH = path.resolve(__dirname, '..', 'data', 'cenik', 'blebox_raw.json');
const TRANSLATIONS_PATH = path.resolve(__dirname, '..', 'data', 'cenik', 'blebox_prevodi.json');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'cenik', 'blebox_produkti.json');
const DEFAULT_IMAGE_BASE = 'https://inteligent.si/slike/izdelki/blebox';

// Content fields owned by this source. Prices, isActive, ime, dobavitelj,
// casovnaNorma and execution defaults stay owner-managed in the cenik and are
// never synced (ime/dobavitelj still ship in the item for initial creation).
const PROVIDED_FIELDS = [
  'externalSource',
  'externalId',
  'externalKey',
  'kategorija',
  'categorySlugs',
  'kratekOpis',
  'dolgOpis',
  'povezavaDoSlike',
  'povezavaDoProdukta',
  'proizvajalec',
  'isService',
  'aaData',
  'classification',
] as const;

const CATEGORY_MAP: Record<string, { kategorija: string; slugs: string[] }> = {
  'WiFi controllers': { kategorija: 'krmilnik', slugs: ['wifi-krmilniki'] },
  'WiFi controllers - PRO series': { kategorija: 'krmilnik', slugs: ['wifi-krmilniki', 'wifi-krmilniki-pro'] },
  'WiFi controllers - DIN series': { kategorija: 'krmilnik', slugs: ['wifi-krmilniki', 'wifi-krmilniki-din'] },
  'WiFi sensors': { kategorija: 'senzor', slugs: ['wifi-senzorji'] },
  'WiFi sensors - PRO series': { kategorija: 'senzor', slugs: ['wifi-senzorji', 'wifi-senzorji-pro'] },
  'Additional control methods - WiFi & μWiFi': { kategorija: 'upravljalnik', slugs: ['upravljalniki'] },
  'Controllers and sensors without WiFi': { kategorija: 'krmilnik', slugs: ['brez-wifi'] },
  Accessories: { kategorija: 'dodatek', slugs: ['blebox-dodatki'] },
  'Bluetooth controllers': { kategorija: 'krmilnik', slugs: ['bluetooth-krmilniki'] },
};

type RawProduct = {
  slug: string;
  name: string;
  url: string;
  category: string;
  shortDescription: string;
  marketing: string[];
  sections: Array<{ title: string; text: string }>;
  specs: Array<{ attribute: string; term: string }>;
  manuals: Array<{ label: string; url: string }>;
  image: string;
  imageFile?: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  let imageBase = DEFAULT_IMAGE_BASE;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--image-base') {
      imageBase = (args[i + 1] ?? imageBase).replace(/\/$/, '');
      i += 1;
    }
  }
  return { imageBase };
}

function productDisplayName(raw: RawProduct) {
  return /^blebox/i.test(raw.name.replace(/\s+/g, '')) ? raw.name : `BleBox ${raw.name}`;
}

function englishSummary(raw: RawProduct) {
  const parts = [raw.shortDescription, ...raw.sections.map((section) => `${section.title}: ${section.text}`)];
  if (!raw.sections.length) parts.push(...raw.marketing);
  return parts.join('\n').slice(0, 4000);
}

function main() {
  const { imageBase } = parseArgs();
  const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8')) as { products: RawProduct[] };
  const prevodi = JSON.parse(fs.readFileSync(TRANSLATIONS_PATH, 'utf8')) as {
    translations: Record<string, { kratekOpis: string; dolgOpis: string }>;
  };

  const warnings: string[] = [];
  const products = raw.products.map((product) => {
    const translation = prevodi.translations[product.slug];
    if (!translation) warnings.push(`${product.slug}: missing Slovenian translation, using English copy`);
    const category = CATEGORY_MAP[product.category];
    if (!category) warnings.push(`${product.slug}: unmapped category "${product.category}"`);

    return {
      externalSource: 'blebox',
      externalId: product.slug,
      externalKey: `blebox:${product.slug}`,
      ime: productDisplayName(product),
      kategorija: category?.kategorija ?? 'drugo',
      categorySlugs: ['blebox', 'pametni-dom', ...(category?.slugs ?? [])],
      kratekOpis: (translation?.kratekOpis ?? product.shortDescription).slice(0, 200),
      dolgOpis: translation?.dolgOpis ?? englishSummary(product),
      povezavaDoSlike: product.imageFile ? `${imageBase}/${product.imageFile}` : product.image,
      povezavaDoProdukta: product.url,
      proizvajalec: 'BleBox',
      dobavitelj: IMPORT_DEFAULTS.blebox.dobavitelj,
      naslovDobavitelja: IMPORT_DEFAULTS.blebox.naslovDobavitelja,
      isService: false,
      aaData: {
        productCode: product.slug,
        image: product.image,
        category: product.category,
        attributes: product.specs,
        rawDescription: englishSummary(product),
        stock: '',
        lastSyncedAt: new Date().toISOString(),
      },
      classification: {
        productType: 'drugo',
        manufacturer: 'BleBox',
      },
      __providedFields: [...PROVIDED_FIELDS],
    };
  });

  const snapshot = {
    meta: {
      source: 'blebox',
      generatedAt: new Date().toISOString(),
      schema: 'aintel-product-v1',
      imageBase,
      warnings,
    },
    products,
  };
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${products.length} import items to ${OUTPUT_PATH}`);
  if (warnings.length) {
    console.log('Warnings:');
    warnings.forEach((warning) => console.log(`  - ${warning}`));
  }
}

main();
