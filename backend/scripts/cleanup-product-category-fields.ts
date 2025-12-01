import { connectToMongo } from '../db/mongo';
import { ProductModel } from '../modules/cenik/product.model';
import { normalizeSlug } from '../modules/categories/utils/slug';

async function cleanup() {
  await connectToMongo();
  const cursor = ProductModel.find().cursor();
  let processed = 0;
  let updated = 0;
  let legacyCleared = 0;

  for await (const product of cursor) {
    processed += 1;
    const slugs = new Set<string>();
    const pushNormalized = (value: unknown) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        const normalized = normalizeSlug(value);
        if (normalized) {
          slugs.add(normalized);
        }
      }
    };

    (product.categorySlugs ?? []).forEach((slug) => pushNormalized(slug));
    (product.categories ?? []).forEach((slug) => pushNormalized(slug));
    pushNormalized(product.categorySlug);
    pushNormalized(product.kategorija);

    const finalSlugs = Array.from(slugs).sort();
    const existingSlugs = (product.categorySlugs ?? []).map((value) => normalizeSlug(value)).filter(Boolean);
    const needsUpdate =
      finalSlugs.length !== existingSlugs.length ||
      finalSlugs.some((value, index) => value !== existingSlugs[index]) ||
      !!(product.categories || product.categorySlug || product.kategorija);

    if (needsUpdate) {
      await ProductModel.updateOne(
        { _id: product._id },
        {
          $set: { categorySlugs: finalSlugs },
          $unset: { categories: '', categorySlug: '', kategorija: '' }
        }
      );
      updated += 1;
      if (product.categories || product.categorySlug || product.kategorija) {
        legacyCleared += 1;
      }
    }
  }

  console.log('Products processed:', processed);
  console.log('Products updated:', updated);
  console.log('Legacy fields cleared:', legacyCleared);
  process.exit(0);
}

cleanup().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
