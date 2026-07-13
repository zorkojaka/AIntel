/**
 * ECO-35: derive product sales statistics from ACCEPTED offer versions.
 *
 * Source of truth: offerversions with status 'accepted' (a customer said yes).
 * Per product we compute:
 *   - soldQty / soldQty365: summed quantities (all time / last 365 days)
 *   - offersCount: number of accepted offers containing the product
 *   - salesRank: 1..N ordered by soldQty desc (ties by offersCount)
 *   - boughtWith: top 5 co-occurring products in the same accepted offers
 *
 * Results are written to products.salesStats — a derived field that import
 * syncs never touch. Re-runnable any time (idempotent by construction):
 *   npm run stats:products            # dry run (prints table)
 *   npm run stats:products -- --apply
 */
import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';

type OfferItem = { productId?: string | null; name?: string; quantity?: number };
type OfferVersion = { status?: string; createdAt?: Date; items?: OfferItem[] };

type ProductStats = {
  soldQty: number;
  soldQty365: number;
  offersCount: number;
  ime: string;
  pairs: Map<string, number>;
};

async function main() {
  const apply = process.argv.includes('--apply');
  loadEnvironment();
  await connectToMongo();

  const offers = (await mongoose.connection
    .collection('offerversions')
    .find({ status: 'accepted' }, { projection: { status: 1, createdAt: 1, 'items.productId': 1, 'items.name': 1, 'items.quantity': 1 } })
    .toArray()) as unknown as OfferVersion[];

  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const stats = new Map<string, ProductStats>();

  for (const offer of offers) {
    const items = (offer.items ?? []).filter((item) => typeof item.productId === 'string' && item.productId);
    const inYear = offer.createdAt ? new Date(offer.createdAt).getTime() >= yearAgo : true;
    const seenInOffer = new Set<string>();

    for (const item of items) {
      const id = item.productId as string;
      const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      const entry = stats.get(id) ?? { soldQty: 0, soldQty365: 0, offersCount: 0, ime: item.name ?? '', pairs: new Map() };
      entry.soldQty += qty;
      if (inYear) entry.soldQty365 += qty;
      if (!seenInOffer.has(id)) {
        entry.offersCount += 1;
        seenInOffer.add(id);
      }
      if (!entry.ime && item.name) entry.ime = item.name;
      stats.set(id, entry);
    }

    const uniqueIds = [...seenInOffer];
    for (const a of uniqueIds) {
      for (const b of uniqueIds) {
        if (a === b) continue;
        const entry = stats.get(a)!;
        entry.pairs.set(b, (entry.pairs.get(b) ?? 0) + 1);
      }
    }
  }

  const ranked = [...stats.entries()].sort(
    ([, a], [, b]) => b.soldQty - a.soldQty || b.offersCount - a.offersCount,
  );

  console.log(`Accepted offers: ${offers.length}; distinct products sold: ${ranked.length}`);
  const computedAt = new Date();
  let rank = 0;
  let written = 0;
  for (const [productId, entry] of ranked) {
    rank += 1;
    const boughtWith = [...entry.pairs.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([pairId, count]) => ({ productId: pairId, ime: stats.get(pairId)?.ime ?? '', count }));

    if (rank <= 15) {
      console.log(
        `#${rank} ${entry.ime} — kosov: ${entry.soldQty} (365d: ${entry.soldQty365}), ponudb: ${entry.offersCount}, skupaj z: ${boughtWith
          .slice(0, 3)
          .map((pair) => pair.ime)
          .join(' · ')}`,
      );
    }

    if (apply && mongoose.isValidObjectId(productId)) {
      const result = await ProductModel.updateOne(
        { _id: productId },
        {
          $set: {
            salesStats: {
              soldQty: entry.soldQty,
              soldQty365: entry.soldQty365,
              offersCount: entry.offersCount,
              salesRank: rank,
              boughtWith,
              computedAt,
            },
          },
        },
      );
      if (result.matchedCount > 0) written += 1;
    }
  }

  if (apply) {
    // Products no longer present in any accepted offer lose stale stats.
    const currentIds = ranked
      .map(([productId]) => productId)
      .filter((id) => mongoose.isValidObjectId(id));
    const cleared = await ProductModel.updateMany(
      { salesStats: { $exists: true }, _id: { $nin: currentIds } },
      { $unset: { salesStats: '' } },
    );
    console.log(`Written: ${written}, stale stats cleared: ${cleared.modifiedCount}`);
  } else {
    console.log('Dry run — run with --apply to write salesStats.');
  }
}

main()
  .catch((error) => {
    console.error('Sales stats computation failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
