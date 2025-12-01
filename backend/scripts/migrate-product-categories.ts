import 'dotenv/config';
import mongoose from 'mongoose';
import { connectToMongo } from '../db/mongo';
import { ProductModel } from '../modules/cenik/product.model';
import { CategoryModel } from '../modules/categories/schema';
import { normalizeSlug } from '../modules/categories/utils/slug';

const LEGACY_FIELD = 'kategorija';
const SKIP_SLUGS = new Set(['a', 'aab']);

async function migrateLegacyCategories() {
  console.log('Connecting to MongoDB…');
  await connectToMongo();

  try {
    console.log('Using legacy field:', LEGACY_FIELD);
    const legacyProducts = await ProductModel.find({
      [LEGACY_FIELD]: { $type: 'string', $ne: '' }
    }).lean();

    const totalLegacyProducts = legacyProducts.length;
    console.log(`Products with legacy field populated: ${totalLegacyProducts}`);

    const slugCandidates = new Map<string, string>();
    for (const product of legacyProducts) {
      const raw = product.kategorija;
      if (!raw || typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const slug = normalizeSlug(trimmed);
      if (!slug || SKIP_SLUGS.has(slug)) continue;
      if (!slugCandidates.has(slug)) {
        slugCandidates.set(slug, trimmed);
      }
    }

    const uniqueLegacyCount = slugCandidates.size;
    console.log(`Found ${uniqueLegacyCount} unique legacy category value(s).`);

    if (uniqueLegacyCount === 0) {
      console.log('No legacy categories to migrate. Exiting.');
      return;
    }

    const existingCategories = await CategoryModel.find({ slug: { $in: Array.from(slugCandidates.keys()) } });
    const existingSlugs = new Set(existingCategories.map((category) => category.slug));
    const currentCount = await CategoryModel.countDocuments();
    let orderCounter = currentCount + 1;
    let createdCount = 0;

    for (const [slug, name] of slugCandidates) {
      if (existingSlugs.has(slug)) continue;
      console.log(`Creating Category for: "${name}" → ${slug}`);
      await CategoryModel.create({ name, slug, order: orderCounter++ });
      createdCount += 1;
    }

    console.log(`Created ${createdCount} new Category document(s).`);

    const categoriesSnapshot = await CategoryModel.find({ slug: { $in: Array.from(slugCandidates.keys()) } });
    const slugsToApply = new Set(categoriesSnapshot.map((category) => category.slug));

    let updatedProducts = 0;
    for (const product of legacyProducts) {
      const raw = product.kategorija;
      if (!raw || typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const slug = normalizeSlug(trimmed);
      if (!slug || !slugsToApply.has(slug)) continue;

      const currentSlugs = Array.isArray(product.categories) ? product.categories.slice() : [];
      const normalizedSet = new Set(currentSlugs);
      if (normalizedSet.has(slug)) continue;
      normalizedSet.add(slug);

      await ProductModel.updateOne({ _id: product._id }, { $set: { categories: Array.from(normalizedSet) } });
      updatedProducts += 1;
    }

    console.log(`Updated ${updatedProducts} product(s) with slugs.`);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

migrateLegacyCategories()
  .then(() => {
    console.log('Migration finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

// Run with:
// pnpm ts-node backend/scripts/migrate-product-categories.ts
