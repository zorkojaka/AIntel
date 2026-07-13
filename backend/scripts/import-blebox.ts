/**
 * ECO-31: Import BleBox content items into the cenik (draft-first).
 *
 * BleBox publishes no public prices, so blebox_produkti.json carries content
 * only (no prices, no isActive) and prices stay owner-managed in the cenik.
 * Because the shared import pipeline requires prices when CREATING a product,
 * this script splits the work:
 *
 *   - existing blebox products (matched by externalKey) are UPDATED through
 *     applyProductImportFromItems — content fields refresh, owner-managed
 *     fields (prices, isActive, casovnaNorma, ...) are untouched because they
 *     are not in __providedFields;
 *   - curated matches from blebox_povezave.json are ADOPTED first: the
 *     existing manually-created product (found by exact ime) gets
 *     externalKey blebox:<slug>, so it keeps owner prices/activity/name and
 *     receives synced content from then on;
 *   - new items are CREATED here as inactive drafts (isActive=false,
 *     prices 0). The owner sets prices and activates them in the cenik.
 *     A name-collision check against existing non-blebox products reports
 *     potential duplicates instead of creating them.
 *
 * Default mode is a dry-run analyze (no writes). Use --apply to write.
 *
 * Usage:
 *   ts-node --transpile-only scripts/import-blebox.ts            # analyze only
 *   ts-node --transpile-only scripts/import-blebox.ts --apply    # apply
 */
import fs from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';
import {
  analyzeProductImportFromItems,
  applyProductImportFromItems,
} from '../modules/cenik/services/product-sync.service';

const INPUT_PATH = path.resolve(__dirname, '..', 'data', 'cenik', 'blebox_produkti.json');
const LINKS_PATH = path.resolve(__dirname, '..', 'data', 'cenik', 'blebox_povezave.json');
const SOURCE = 'blebox';

type BleboxItem = Record<string, unknown> & {
  externalKey: string;
  externalId: string;
  ime: string;
};

function loadItems(): BleboxItem[] {
  const parsed = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8')) as { products?: unknown };
  if (!Array.isArray(parsed.products)) {
    throw new Error('blebox_produkti.json must contain a "products" array.');
  }
  return parsed.products as BleboxItem[];
}

function weakNameKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

type Links = { adopt: Record<string, string>; skipCreate: string[]; ownerReview?: string[] };

function loadLinks(): Links {
  const parsed = JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8')) as Partial<Links>;
  return { adopt: parsed.adopt ?? {}, skipCreate: parsed.skipCreate ?? [], ownerReview: parsed.ownerReview ?? [] };
}

async function adoptCuratedMatches(items: BleboxItem[], links: Links, apply: boolean) {
  for (const [slug, existingIme] of Object.entries(links.adopt)) {
    const item = items.find((candidate) => candidate.externalId === slug);
    if (!item) {
      console.log(`ADOPT-WARN: ${slug} not present in blebox_produkti.json`);
      continue;
    }
    const alreadyLinked = await ProductModel.findOne({ externalKey: item.externalKey }).select({ _id: 1 }).lean();
    if (alreadyLinked) continue;
    const matches = await ProductModel.find({ ime: existingIme, externalSource: { $ne: SOURCE } })
      .select({ _id: 1, ime: 1, externalSource: 1 })
      .lean();
    if (matches.length !== 1) {
      console.log(`ADOPT-WARN: ${slug} -> "${existingIme}" matched ${matches.length} products, skipping`);
      continue;
    }
    if (apply) {
      await ProductModel.updateOne(
        { _id: matches[0]._id },
        { $set: { externalSource: SOURCE, externalId: slug, externalKey: item.externalKey } },
      );
      console.log(`ADOPTED: "${existingIme}" -> ${item.externalKey} (keeps price/activity/name)`);
    } else {
      console.log(`WOULD ADOPT: "${existingIme}" -> ${item.externalKey}`);
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  loadEnvironment();
  await connectToMongo();

  const allItems = loadItems();
  const links = loadLinks();
  const skip = new Set(links.skipCreate);

  await adoptCuratedMatches(allItems, links, apply);

  const items = allItems;
  const keys = items.map((item) => item.externalKey);
  const existing = await ProductModel.find({ externalKey: { $in: keys } })
    .select({ externalKey: 1 })
    .lean();
  const existingKeys = new Set(existing.map((doc) => doc.externalKey));

  const updateItems = items.filter((item) => existingKeys.has(item.externalKey));
  const createItems = items.filter(
    (item) => !existingKeys.has(item.externalKey) && !skip.has(item.externalId),
  );

  // Name-collision check: a scraped product may already exist in the cenik as
  // a manually created entry (e.g. configurator smart-home modules). Those are
  // reported for manual linking, never auto-created as duplicates.
  const candidates = await ProductModel.find({ isService: { $ne: true } })
    .select({ ime: 1, externalKey: 1, externalSource: 1 })
    .lean();
  const collisions = createItems.filter((item) => {
    const key = weakNameKey(item.ime);
    return candidates.some(
      (doc) => doc.externalKey !== item.externalKey && weakNameKey(String(doc.ime ?? '')) === key,
    );
  });
  const collisionKeys = new Set(collisions.map((item) => item.externalKey));
  const safeCreateItems = createItems.filter((item) => !collisionKeys.has(item.externalKey));

  console.log(`${apply ? 'APPLY' : 'ANALYZE'} source=${SOURCE}`);
  console.log(`TOTAL_SOURCE_ROWS: ${items.length}`);
  console.log(`SKIPPED_BY_CURATION: ${[...skip].join(', ') || 'none'}`);
  console.log(`TO_UPDATE (existing blebox products): ${updateItems.length}`);
  console.log(`TO_CREATE (new drafts, isActive=false, price 0): ${safeCreateItems.length}`);
  console.log(`NAME_COLLISIONS (skipped, resolve manually): ${collisions.length}`);
  collisions.forEach((item) => {
    const matches = candidates
      .filter((doc) => weakNameKey(String(doc.ime ?? '')) === weakNameKey(item.ime))
      .map((doc) => `${doc.ime} [${doc.externalSource ?? 'ročno'}]`);
    console.log(`  - ${item.externalId} "${item.ime}" ~ existing: ${matches.join('; ')}`);
  });

  if (!apply) {
    if (updateItems.length > 0) {
      const plan = await analyzeProductImportFromItems({ source: SOURCE, items: updateItems });
      console.log(
        `UPDATE_PLAN: update=${plan.summary.toUpdateCount} skip=${plan.summary.toSkipCount} conflicts=${plan.summary.conflictCount} invalid=${plan.summary.invalidCount}`,
      );
    }
    console.log('Dry run only — nothing written. Run with --apply to import.');
    return;
  }

  if (updateItems.length > 0) {
    const result = await applyProductImportFromItems({ source: SOURCE, items: updateItems });
    console.log(`UPDATED: ${result.applied.updatedCount}, SKIPPED (unchanged): ${result.applied.skippedCount}`);
    result.conflicts.slice(0, 20).forEach((row) => {
      console.log(`CONFLICT (excluded, resolve in cenik UI): ${row.rowId} ${row.ime} -> ${row.reason}`);
    });
  }

  let created = 0;
  for (const item of safeCreateItems) {
    const { __providedFields, ...fields } = item;
    await ProductModel.create({
      ...fields,
      purchasePriceWithoutVat: 0,
      nabavnaCena: 0,
      prodajnaCena: 0,
      isActive: false,
    });
    created += 1;
  }
  console.log(`CREATED (inactive drafts): ${created}`);
  (links.ownerReview ?? []).forEach((note) => console.log(`OWNER-REVIEW: ${note}`));
}

main()
  .catch((error) => {
    console.error('BleBox import failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
