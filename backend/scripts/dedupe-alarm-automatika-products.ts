import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { WorkOrderModel } from '../modules/projects/schemas/work-order';
import { MaterialOrderModel } from '../modules/projects/schemas/material-order';

const SUPPLIER = 'Alarm automatika d.o.o.';

type ProductDoc = {
  _id: string;
  ime: string;
  dobavitelj?: string;
  updatedAt?: Date;
  createdAt?: Date;
};

type ReferenceCounts = {
  offers: number;
  workOrders: number;
  materialOrders: number;
  total: number;
};

type ReportEntry = {
  _id: string;
  naziv: string;
  referenceCounts?: ReferenceCounts;
};

function normalizeName(value?: string | null) {
  return (value ?? '').trim();
}

function sortByNewest(a: ProductDoc, b: ProductDoc) {
  const aTime = (a.updatedAt ?? a.createdAt ?? new Date(0)).getTime();
  const bTime = (b.updatedAt ?? b.createdAt ?? new Date(0)).getTime();
  if (aTime !== bTime) return bTime - aTime;
  return String(b._id).localeCompare(String(a._id));
}

async function countReferences(productIds: string[]) {
  const counts = new Map<string, ReferenceCounts>();
  productIds.forEach((id) => {
    counts.set(id, { offers: 0, workOrders: 0, materialOrders: 0, total: 0 });
  });

  const offerVersions = await OfferVersionModel.find({ 'items.productId': { $in: productIds } })
    .select({ items: 1 })
    .lean();
  offerVersions.forEach((offer) => {
    (offer.items ?? []).forEach((item: { productId?: string | null }) => {
      if (item?.productId && counts.has(item.productId)) {
        const current = counts.get(item.productId)!;
        current.offers += 1;
        current.total += 1;
      }
    });
  });

  const workOrders = await WorkOrderModel.find({ 'items.productId': { $in: productIds } })
    .select({ items: 1 })
    .lean();
  workOrders.forEach((order) => {
    (order.items ?? []).forEach((item: { productId?: string | null }) => {
      if (item?.productId && counts.has(item.productId)) {
        const current = counts.get(item.productId)!;
        current.workOrders += 1;
        current.total += 1;
      }
    });
  });

  const materialOrders = await MaterialOrderModel.find({ 'items.productId': { $in: productIds } })
    .select({ items: 1 })
    .lean();
  materialOrders.forEach((order) => {
    (order.items ?? []).forEach((item: { productId?: string | null }) => {
      if (item?.productId && counts.has(item.productId)) {
        const current = counts.get(item.productId)!;
        current.materialOrders += 1;
        current.total += 1;
      }
    });
  });

  return counts;
}

async function main() {
  loadEnvironment();
  await connectToMongo();

  const products = (await ProductModel.find({ dobavitelj: SUPPLIER })
    .select({ _id: 1, ime: 1, dobavitelj: 1, updatedAt: 1, createdAt: 1 })
    .lean()) as ProductDoc[];

  const groups = new Map<string, ProductDoc[]>();
  products.forEach((product) => {
    const key = normalizeName(product.ime);
    if (!key) return;
    const existing = groups.get(key);
    if (existing) {
      existing.push(product);
    } else {
      groups.set(key, [product]);
    }
  });

  const deletedProducts: ReportEntry[] = [];
  const skippedBecauseReferenced: ReportEntry[] = [];
  const unresolvedDuplicates: Array<{ naziv: string; productIds: string[] }> = [];

  for (const [nameKey, group] of groups.entries()) {
    if (group.length <= 1) continue;

    const ids = group.map((doc) => String(doc._id));
    const referenceCounts = await countReferences(ids);
    const referenced = ids.filter((id) => (referenceCounts.get(id)?.total ?? 0) > 0);
    const unreferenced = ids.filter((id) => (referenceCounts.get(id)?.total ?? 0) === 0);

    if (referenced.length > 0 && unreferenced.length > 0) {
      for (const id of referenced) {
        const doc = group.find((item) => String(item._id) === id);
        skippedBecauseReferenced.push({
          _id: id,
          naziv: doc?.ime ?? nameKey,
          referenceCounts: referenceCounts.get(id),
        });
      }
      for (const id of unreferenced) {
        const doc = group.find((item) => String(item._id) === id);
        await ProductModel.deleteOne({ _id: id });
        deletedProducts.push({ _id: id, naziv: doc?.ime ?? nameKey });
      }
      continue;
    }

    if (referenced.length === 0) {
      const sorted = [...group].sort(sortByNewest);
      const keep = sorted[0];
      const keepId = String(keep._id);
      for (const doc of sorted.slice(1)) {
        await ProductModel.deleteOne({ _id: doc._id });
        deletedProducts.push({ _id: String(doc._id), naziv: doc.ime });
      }
      skippedBecauseReferenced.push({
        _id: keepId,
        naziv: keep.ime,
        referenceCounts: { offers: 0, workOrders: 0, materialOrders: 0, total: 0 },
      });
      continue;
    }

    unresolvedDuplicates.push({
      naziv: nameKey,
      productIds: ids,
    });
    referenced.forEach((id) => {
      const doc = group.find((item) => String(item._id) === id);
      skippedBecauseReferenced.push({
        _id: id,
        naziv: doc?.ime ?? nameKey,
        referenceCounts: referenceCounts.get(id),
      });
    });
  }

  const report = {
    deletedProducts,
    skippedBecauseReferenced,
    unresolvedDuplicates,
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error('Deduplication failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
