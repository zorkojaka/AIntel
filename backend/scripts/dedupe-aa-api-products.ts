import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { WorkOrderModel } from '../modules/projects/schemas/work-order';
import { MaterialOrderModel } from '../modules/projects/schemas/material-order';
import { ProjectModel } from '../modules/projects/schemas/project';

type ProductDoc = {
  _id: string;
  externalSource?: string;
  externalId?: string;
  updatedAt?: Date;
  createdAt?: Date;
};

type DuplicateGroup = {
  _id: { externalSource: string; externalId: string };
  ids: string[];
};

function sortByNewest(a: ProductDoc, b: ProductDoc) {
  const aTime = (a.updatedAt ?? a.createdAt ?? new Date(0)).getTime();
  const bTime = (b.updatedAt ?? b.createdAt ?? new Date(0)).getTime();
  return bTime - aTime;
}

async function countReferences(productIds: string[]) {
  const counts = new Map<string, number>();
  productIds.forEach((id) => counts.set(id, 0));

  const offerVersions = await OfferVersionModel.find({ 'items.productId': { $in: productIds } })
    .select({ items: 1 })
    .lean();
  offerVersions.forEach((offer) => {
    (offer.items ?? []).forEach((item: { productId?: string | null }) => {
      if (item?.productId && counts.has(item.productId)) {
        counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
      }
    });
  });

  const workOrders = await WorkOrderModel.find({ 'items.productId': { $in: productIds } })
    .select({ items: 1 })
    .lean();
  workOrders.forEach((order) => {
    (order.items ?? []).forEach((item: { productId?: string | null }) => {
      if (item?.productId && counts.has(item.productId)) {
        counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
      }
    });
  });

  const materialOrders = await MaterialOrderModel.find({ 'items.productId': { $in: productIds } })
    .select({ items: 1 })
    .lean();
  materialOrders.forEach((order) => {
    (order.items ?? []).forEach((item: { productId?: string | null }) => {
      if (item?.productId && counts.has(item.productId)) {
        counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
      }
    });
  });

  const projects = await ProjectModel.find({ 'offers.items.productId': { $in: productIds } })
    .select({ offers: 1 })
    .lean();
  projects.forEach((project) => {
    (project.offers ?? []).forEach((offer: { items?: Array<{ productId?: string }> }) => {
      (offer.items ?? []).forEach((item) => {
        if (item?.productId && counts.has(item.productId)) {
          counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
        }
      });
    });
  });

  return counts;
}

async function replaceReferences(oldId: string, newId: string) {
  await OfferVersionModel.updateMany(
    { 'items.productId': oldId },
    { $set: { 'items.$[item].productId': newId } },
    { arrayFilters: [{ 'item.productId': oldId }] },
  );

  await WorkOrderModel.updateMany(
    { 'items.productId': oldId },
    { $set: { 'items.$[item].productId': newId } },
    { arrayFilters: [{ 'item.productId': oldId }] },
  );

  await MaterialOrderModel.updateMany(
    { 'items.productId': oldId },
    { $set: { 'items.$[item].productId': newId } },
    { arrayFilters: [{ 'item.productId': oldId }] },
  );

  await ProjectModel.updateMany(
    { 'offers.items.productId': oldId },
    { $set: { 'offers.$[].items.$[item].productId': newId } },
    { arrayFilters: [{ 'item.productId': oldId }] },
  );
}

async function main() {
  loadEnvironment();
  await connectToMongo();

  const groups = (await ProductModel.aggregate([
    { $match: { externalSource: 'aa_api', externalId: { $ne: '' } } },
    {
      $group: {
        _id: { externalSource: '$externalSource', externalId: '$externalId' },
        ids: { $addToSet: { $toString: '$_id' } },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ])) as DuplicateGroup[];

  if (groups.length === 0) {
    console.log('No AA_API duplicate groups found.');
    return;
  }

  console.log(`Duplicate groups: ${groups.length}`);
  let removedTotal = 0;

  for (const group of groups) {
    const ids = group.ids;
    const docs = await ProductModel.find({ _id: { $in: ids } })
      .select({ _id: 1, externalSource: 1, externalId: 1, updatedAt: 1, createdAt: 1 })
      .lean();

    const referenceCounts = await countReferences(ids);
    const sortedByRefs = [...docs].sort((a, b) => {
      const aRefs = referenceCounts.get(String(a._id)) ?? 0;
      const bRefs = referenceCounts.get(String(b._id)) ?? 0;
      if (aRefs !== bRefs) return bRefs - aRefs;
      return sortByNewest(a as ProductDoc, b as ProductDoc);
    });

    const keep = sortedByRefs[0];
    const keepId = String(keep._id);
    const toRemove = ids.filter((id) => id !== keepId);

    for (const oldId of toRemove) {
      await replaceReferences(oldId, keepId);
    }

    const deleteResult = await ProductModel.deleteMany({ _id: { $in: toRemove } });
    removedTotal += deleteResult.deletedCount ?? 0;
  }

  console.log(`Removed duplicates: ${removedTotal}`);
}

main()
  .catch((error) => {
    console.error('AA_API dedupe failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
