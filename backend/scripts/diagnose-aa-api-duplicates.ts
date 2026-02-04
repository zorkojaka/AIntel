import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';

type DuplicateGroup = {
  _id: Record<string, unknown>;
  count: number;
  ids: string[];
};

async function groupByKey(label: string, keyFields: Record<string, unknown>) {
  const groups = (await ProductModel.aggregate([
    { $match: { externalSource: 'aa_api' } },
    {
      $project: {
        _id: 1,
        externalSource: 1,
        externalId: 1,
        externalKey: 1,
        categorySlug: 1,
        categorySlugs: 1,
        slug: {
          $ifNull: ['$categorySlug', { $arrayElemAt: ['$categorySlugs', 0] }],
        },
      },
    },
    {
      $group: {
        _id: keyFields,
        count: { $sum: 1 },
        ids: { $addToSet: { $toString: '$_id' } },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ])) as DuplicateGroup[];

  console.log(`\nDUPLICATES by ${label}: ${groups.length}`);
  groups.slice(0, 50).forEach((group) => {
    const sampleIds = group.ids.slice(0, 5).join(', ');
    console.log(`- key=${JSON.stringify(group._id)} count=${group.count} ids=[${sampleIds}]`);
  });
}

async function main() {
  loadEnvironment();
  await connectToMongo();

  const total = await ProductModel.countDocuments({ externalSource: 'aa_api' });
  console.log(`AA_API total: ${total}`);

  await groupByKey('source+externalId', { externalSource: '$externalSource', externalId: '$externalId' });
  await groupByKey('source+fullCode', { externalSource: '$externalSource', externalKey: '$externalKey' });
  await groupByKey('source+slug', { externalSource: '$externalSource', slug: '$slug' });
}

main()
  .catch((error) => {
    console.error('AA_API duplicate diagnosis failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
