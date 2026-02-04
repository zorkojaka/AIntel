import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';

const SUPPLIER = 'Alarm automatika d.o.o.';

async function main() {
  loadEnvironment();
  await connectToMongo();

  const totalProductsBefore = await ProductModel.countDocuments({ dobavitelj: SUPPLIER });

  const groups = (await ProductModel.aggregate([
    { $match: { dobavitelj: SUPPLIER } },
    {
      $group: {
        _id: '$ime',
        ids: { $addToSet: { $toString: '$_id' } },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ])) as Array<{ _id: string; ids: string[]; count: number }>;

  let totalDeleted = 0;
  let numberOfDedupedNames = 0;

  for (const group of groups) {
    const sortedIds = [...group.ids].sort().reverse();
    const keepId = sortedIds[0];
    const deleteIds = sortedIds.slice(1);
    if (deleteIds.length === 0) continue;
    const result = await ProductModel.deleteMany({ _id: { $in: deleteIds } });
    totalDeleted += result.deletedCount ?? 0;
    numberOfDedupedNames += 1;
  }

  const totalProductsAfter = await ProductModel.countDocuments({ dobavitelj: SUPPLIER });

  console.log(
    JSON.stringify(
      {
        totalProductsBefore,
        totalProductsAfter,
        totalDeleted,
        numberOfDedupedNames,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('Deduplication failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
