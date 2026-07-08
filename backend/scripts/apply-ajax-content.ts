/**
 * ECO-32: One-off application of customer-friendly Ajax copy to existing
 * aa_api products. Future AA syncs re-apply the same rules automatically via
 * applyAjaxContentOverride in aaProductMapper; this script just avoids
 * waiting for the next full AA sync.
 *
 * Prices, stock, isActive and everything else stay untouched — only
 * kratekOpis/dolgOpis (and povezavaDoProdukta when the rule provides the
 * official ajax.systems link) are rewritten. The technical AA description
 * remains available in aaData.rawDescription.
 *
 * Usage:
 *   ts-node --transpile-only scripts/apply-ajax-content.ts            # dry run
 *   ts-node --transpile-only scripts/apply-ajax-content.ts --apply
 */
import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';
import { findAjaxContentRule, hasEolMarker } from '../modules/cenik/services/ajax-content-overrides';

async function main() {
  const apply = process.argv.includes('--apply');
  loadEnvironment();
  await connectToMongo();

  const products = await ProductModel.find({
    externalSource: 'aa_api',
    isService: { $ne: true },
    ime: /^\s*ajax/i,
  })
    .select({ ime: 1, kratekOpis: 1, dolgOpis: 1, povezavaDoProdukta: 1 })
    .lean();

  let matched = 0;
  let changed = 0;
  let eolSkipped = 0;
  for (const product of products) {
    const rule = findAjaxContentRule(product.ime);
    if (!rule) continue;
    matched += 1;
    if (hasEolMarker(product.kratekOpis ?? undefined, product.dolgOpis ?? undefined)) {
      eolSkipped += 1;
      console.log(`SKIP (EOL note preserved): ${product.ime}`);
      continue;
    }

    const update: Record<string, string> = {};
    if (rule.kratekOpis && rule.kratekOpis.slice(0, 200) !== product.kratekOpis) {
      update.kratekOpis = rule.kratekOpis.slice(0, 200);
    }
    if (rule.dolgOpis && rule.dolgOpis !== product.dolgOpis) update.dolgOpis = rule.dolgOpis;
    if (rule.povezavaDoProdukta && rule.povezavaDoProdukta !== product.povezavaDoProdukta) {
      update.povezavaDoProdukta = rule.povezavaDoProdukta;
    }
    if (Object.keys(update).length === 0) continue;
    changed += 1;
    console.log(`${apply ? 'UPDATE' : 'WOULD UPDATE'}: ${product.ime} [${Object.keys(update).join(', ')}]`);
    if (apply) {
      await ProductModel.updateOne({ _id: product._id }, { $set: update });
    }
  }

  console.log(`Ajax aa_api products scanned: ${products.length}, matched by rules: ${matched}, EOL skipped: ${eolSkipped}, ${apply ? 'updated' : 'would update'}: ${changed}`);
  if (!apply) console.log('Dry run only — run with --apply to write.');
}

main()
  .catch((error) => {
    console.error('Ajax content apply failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
