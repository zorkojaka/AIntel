/**
 * ECO-31: BleBox content scraper.
 *
 * Reads the public blebox.eu catalogue (we are an authorized BleBox reseller)
 * and writes a raw content snapshot to data/cenik/blebox_raw.json. The snapshot
 * is the input for scripts/build-blebox-items.ts, which merges Slovenian copy
 * from data/cenik/blebox_prevodi.json into cenik import items.
 *
 * Usage:
 *   ts-node --transpile-only scripts/scrape-blebox.ts [--images-dir <dir>] [--limit N]
 *
 * --images-dir downloads each product's main image as <slug>.<ext> into <dir>
 * (intended target: the inteligent-si repo, slike/izdelki/blebox/).
 */
import fs from 'node:fs';
import path from 'node:path';

const LISTING_URL = 'https://blebox.eu/en/products/';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'cenik', 'blebox_raw.json');
const FETCH_DELAY_MS = 700;

type SpecEntry = { attribute: string; term: string };
type ProductSection = { title: string; text: string };

type RawProduct = {
  slug: string;
  name: string;
  url: string;
  category: string;
  shortDescription: string;
  marketing: string[];
  sections: ProductSection[];
  specs: SpecEntry[];
  manuals: Array<{ label: string; url: string }>;
  image: string;
  imageFile?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(fragment: string) {
  const withoutScripts = fragment
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  return decodeEntities(withoutScripts.replace(/<[^>]+>/g, '\n'))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizeSlugText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function fetchPage(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'InteligentCatalogBot/1.0 (authorized reseller; kontakt@inteligent.si)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

type ListingEntry = { slug: string; name: string; url: string; category: string; shortDescription: string };

function parseListing(html: string): ListingEntry[] {
  const body = html.slice(html.indexOf('<body'));
  // Token stream of h2 headings and product links, in document order. A h2
  // whose normalized text matches the next product link's slug is a product
  // card title; any other h2 is a category section heading.
  const tokenPattern = /<h2[^>]*>([\s\S]*?)<\/h2>|href="(https:\/\/blebox\.eu\/en\/product\/[^"]+)"/g;
  const tokens: Array<{ kind: 'heading' | 'link'; value: string; index: number }> = [];
  for (let match = tokenPattern.exec(body); match; match = tokenPattern.exec(body)) {
    if (match[1] !== undefined) {
      const text = stripTags(match[1]).join(' ').trim();
      if (text) tokens.push({ kind: 'heading', value: text, index: match.index });
    } else {
      tokens.push({ kind: 'link', value: match[2], index: match.index });
    }
  }

  const entries: ListingEntry[] = [];
  let category = '';
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.kind !== 'heading') continue;
    const next = tokens[i + 1];
    const slug = next && next.kind === 'link' ? next.value.replace(/\/$/, '').split('/product/')[1] : '';
    const isProduct = Boolean(slug) && normalizeSlugText(token.value).includes(normalizeSlugText(slug).slice(0, 6));
    if (!isProduct || !next) {
      category = token.value;
      continue;
    }
    // Short description: card text between this heading and the next card's
    // heading (the image link sits between the heading and the description).
    const nextHeading = tokens.slice(i + 1).find((candidate) => candidate.kind === 'heading');
    const between = body.slice(token.index, nextHeading ? nextHeading.index : token.index + 4000);
    const nameNormalized = normalizeSlugText(token.value);
    const lines = stripTags(between).filter((line) => {
      if (line === 'See more' || line.startsWith('<')) return false;
      const normalized = normalizeSlugText(line);
      return !(normalized.length > 0 && normalized.length <= nameNormalized.length && nameNormalized.includes(normalized));
    });
    if (!entries.some((entry) => entry.slug === slug)) {
      entries.push({
        slug,
        name: token.value,
        url: next.value,
        category: category || 'Uncategorized',
        shortDescription: lines.join(' ').trim(),
      });
    }
  }
  return entries;
}

const FOOTER_MARKERS = ['Zapytania ofertowe', 'Company’s data:', 'Site navigation:'];
const SECTION_STOP = 'About the product';

function parseProductPage(html: string, entry: ListingEntry): Omit<RawProduct, 'imageFile'> {
  const body = html.slice(html.indexOf('<body'));
  const ogImage = /property="og:image" content="([^"]+)"/.exec(html)?.[1] ?? '';

  const manuals: Array<{ label: string; url: string }> = [];
  const manualPattern = /<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (let match = manualPattern.exec(body); match; match = manualPattern.exec(body)) {
    const label = stripTags(match[2]).join(' ').trim();
    if (label && !manuals.some((manual) => manual.url === match![1])) {
      manuals.push({ label, url: match[1] });
    }
  }

  const lines = stripTags(body);
  const footerIndex = lines.findIndex((line) => FOOTER_MARKERS.some((marker) => line.startsWith(marker)));
  const contentLines = footerIndex > 0 ? lines.slice(0, footerIndex) : lines;

  // Specification: "Key:" / "value" line pairs after "About the product".
  const specs: SpecEntry[] = [];
  const aboutIndex = contentLines.findIndex((line) => line === SECTION_STOP);
  if (aboutIndex >= 0) {
    for (let i = aboutIndex + 1; i < contentLines.length - 1; i += 1) {
      const line = contentLines[i];
      if (/^.{2,60}[):]:?$/.test(line) && line.endsWith(':')) {
        specs.push({ attribute: line.replace(/:$/, ''), term: contentLines[i + 1] });
        i += 1;
      }
    }
  }

  // Marketing copy: everything after the breadcrumb up to "About the product".
  // Pages with ALL-CAPS section titles get structured sections; the filtered
  // line list (marketing) covers newer layouts without CAPS titles.
  const isCapsTitle = (line: string) => line.length >= 8 && line === line.toUpperCase() && /[A-Z]{3}/.test(line);
  const nameNormalized = normalizeSlugText(entry.name);
  const isJunkLine = (line: string) => {
    if (/^(Manuals associated|\(Please pay attention|Schematics|wBox app|View -|Home$|Produkty$|>>$|<|×)/.test(line)) return true;
    const normalized = normalizeSlugText(line);
    // Fragments of the product name rendered as separate spans ("gate", "Box").
    return normalized.length > 0 && normalized.length <= nameNormalized.length && nameNormalized.includes(normalized);
  };
  const breadcrumbEnd = contentLines.lastIndexOf('>>', 25);
  const marketingStart = breadcrumbEnd >= 0 ? breadcrumbEnd : 0;
  const marketingEnd = aboutIndex >= 0 ? aboutIndex : contentLines.length;

  const marketing: string[] = [];
  const sections: ProductSection[] = [];
  let currentSection: ProductSection | null = null;
  for (let i = marketingStart; i < marketingEnd; i += 1) {
    const line = contentLines[i];
    if (isJunkLine(line)) continue;
    if (isCapsTitle(line)) {
      currentSection = { title: line, text: '' };
      sections.push(currentSection);
      continue;
    }
    if (currentSection) {
      currentSection.text = currentSection.text ? `${currentSection.text} ${line}` : line;
    } else {
      marketing.push(line.replace(/[;]$/, ''));
    }
  }

  return {
    slug: entry.slug,
    name: entry.name,
    url: entry.url,
    category: entry.category,
    shortDescription: entry.shortDescription,
    marketing,
    sections: sections.filter((section) => section.text),
    specs,
    manuals,
    image: ogImage,
  };
}

async function downloadImage(url: string, dir: string, slug: string) {
  const extension = (/\.(png|jpe?g|webp)(?:\?|$)/i.exec(url)?.[1] ?? 'png').toLowerCase();
  const fileName = `${slug}.${extension}`;
  const target = path.join(dir, fileName);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`Image fetch failed ${response.status} for ${url}`);
  }
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  return fileName;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let imagesDir: string | undefined;
  let limit = Number.POSITIVE_INFINITY;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--images-dir') {
      imagesDir = args[i + 1];
      i += 1;
    }
    if (args[i] === '--limit') {
      limit = Number(args[i + 1]) || limit;
      i += 1;
    }
  }
  return { imagesDir, limit };
}

async function main() {
  const { imagesDir, limit } = parseArgs();
  if (imagesDir) fs.mkdirSync(imagesDir, { recursive: true });

  console.log(`Fetching listing ${LISTING_URL} ...`);
  const listing = parseListing(await fetchPage(LISTING_URL));
  console.log(`Found ${listing.length} products in ${new Set(listing.map((entry) => entry.category)).size} categories.`);

  const products: RawProduct[] = [];
  const warnings: string[] = [];
  for (const entry of listing.slice(0, limit)) {
    await sleep(FETCH_DELAY_MS);
    try {
      const product: RawProduct = parseProductPage(await fetchPage(entry.url), entry);
      if (!product.specs.length) warnings.push(`${entry.slug}: no specs parsed`);
      if (!product.sections.length && !product.marketing.length) warnings.push(`${entry.slug}: no marketing copy parsed`);
      if (imagesDir && product.image) {
        try {
          product.imageFile = await downloadImage(product.image, imagesDir, entry.slug);
        } catch (error) {
          warnings.push(`${entry.slug}: image download failed (${error instanceof Error ? error.message : error})`);
        }
      }
      products.push(product);
      console.log(`  ${entry.slug}: specs=${product.specs.length} sections=${product.sections.length} marketing=${product.marketing.length}${product.imageFile ? ` image=${product.imageFile}` : ''}`);
    } catch (error) {
      warnings.push(`${entry.slug}: page scrape failed (${error instanceof Error ? error.message : error})`);
    }
  }

  const snapshot = {
    meta: {
      source: 'blebox',
      listingUrl: LISTING_URL,
      generatedAt: new Date().toISOString(),
      schema: 'blebox-raw-v1',
      warnings,
    },
    products,
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${products.length} products to ${OUTPUT_PATH}`);
  if (warnings.length) {
    console.log('Warnings:');
    warnings.forEach((warning) => console.log(`  - ${warning}`));
  }
}

main().catch((error) => {
  console.error('BleBox scrape failed:', error);
  process.exitCode = 1;
});
