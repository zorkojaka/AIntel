import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';

type SampleRecord = Record<string, unknown>;

type CountSample = {
  count: number;
  samples: SampleRecord[];
};

const SAMPLE_LIMIT = 10;

function normalizeString(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function simplifySample(doc: SampleRecord, fields: string[]) {
  const out: SampleRecord = { _id: String(doc._id ?? '') };
  for (const field of fields) {
    if (field in doc) {
      out[field] = doc[field];
    }
  }
  return out;
}

async function countAndSample(match: Record<string, unknown>, fields: string[]): Promise<CountSample> {
  const [count, samples] = await Promise.all([
    ProductModel.countDocuments(match),
    ProductModel.find(match).sort({ _id: 1 }).select(fields.join(' ')).limit(SAMPLE_LIMIT).lean()
  ]);

  return {
    count,
    samples: samples.map((doc) => simplifySample(doc as SampleRecord, fields))
  };
}

async function buildDuplicateReport() {
  const dupExternalKeyGroups = await ProductModel.aggregate([
    { $match: { externalKey: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$externalKey', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  const dupExternalSourceIdGroups = await ProductModel.aggregate([
    {
      $match: {
        $or: [
          { externalKey: { $exists: false } },
          { externalKey: '' },
          { externalKey: null }
        ]
      }
    },
    { $match: { externalId: { $type: 'string', $ne: '' } } },
    {
      $group: {
        _id: { source: '$externalSource', externalId: '$externalId' },
        count: { $sum: 1 },
        ids: { $push: '$_id' }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { '_id.source': 1, '_id.externalId': 1 } }
  ]);

  const dupNameGroups = await ProductModel.aggregate([
    {
      $match: {
        $or: [
          { externalKey: { $exists: false } },
          { externalKey: '' },
          { externalKey: null }
        ]
      }
    },
    {
      $match: {
        $or: [
          { externalId: { $exists: false } },
          { externalId: '' },
          { externalId: null }
        ]
      }
    },
    {
      $addFields: {
        normIme: { $toLower: { $trim: { input: { $ifNull: ['$ime', ''] } } } },
        normProizvajalec: { $toLower: { $trim: { input: { $ifNull: ['$proizvajalec', ''] } } } },
        normDobavitelj: { $toLower: { $trim: { input: { $ifNull: ['$dobavitelj', ''] } } } }
      }
    },
    { $match: { normIme: { $ne: '' } } },
    {
      $group: {
        _id: {
          ime: '$normIme',
          proizvajalec: '$normProizvajalec',
          dobavitelj: '$normDobavitelj'
        },
        count: { $sum: 1 },
        ids: { $push: '$_id' }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { '_id.ime': 1, '_id.proizvajalec': 1, '_id.dobavitelj': 1 } }
  ]);

  return {
    externalKey: {
      groupCount: dupExternalKeyGroups.length,
      groups: dupExternalKeyGroups.map((group) => ({
        key: group._id,
        count: group.count,
        ids: (group.ids as unknown[]).slice(0, SAMPLE_LIMIT).map((id) => String(id))
      }))
    },
    externalSourceExternalId: {
      groupCount: dupExternalSourceIdGroups.length,
      groups: dupExternalSourceIdGroups.map((group) => ({
        source: group._id?.source ?? '',
        externalId: group._id?.externalId ?? '',
        count: group.count,
        ids: (group.ids as unknown[]).slice(0, SAMPLE_LIMIT).map((id) => String(id))
      }))
    },
    nameManufacturerSupplier: {
      groupCount: dupNameGroups.length,
      groups: dupNameGroups.map((group) => ({
        ime: group._id?.ime ?? '',
        proizvajalec: group._id?.proizvajalec ?? '',
        dobavitelj: group._id?.dobavitelj ?? '',
        count: group.count,
        ids: (group.ids as unknown[]).slice(0, SAMPLE_LIMIT).map((id) => String(id))
      }))
    }
  };
}

async function buildMissingFieldsReport() {
  const missingIme = await countAndSample(
    {
      $or: [
        { ime: { $exists: false } },
        { ime: '' },
        { $expr: { $ne: [{ $type: '$ime' }, 'string'] } }
      ]
    },
    ['externalKey', 'externalSource', 'externalId', 'ime']
  );

  const missingNabavna = await countAndSample(
    {
      $or: [
        { nabavnaCena: { $exists: false } },
        { nabavnaCena: null },
        { $expr: { $not: [{ $isNumber: '$nabavnaCena' }] } }
      ]
    },
    ['externalKey', 'externalSource', 'externalId', 'ime', 'nabavnaCena']
  );

  const missingProdajna = await countAndSample(
    {
      $or: [
        { prodajnaCena: { $exists: false } },
        { prodajnaCena: null },
        { $expr: { $not: [{ $isNumber: '$prodajnaCena' }] } }
      ]
    },
    ['externalKey', 'externalSource', 'externalId', 'ime', 'prodajnaCena']
  );

  const missingDobavitelj = await countAndSample(
    {
      $and: [
        { $or: [{ dobavitelj: { $exists: false } }, { dobavitelj: '' }, { dobavitelj: null }] },
        { $or: [{ naslovDobavitelja: { $exists: false } }, { naslovDobavitelja: '' }, { naslovDobavitelja: null }] }
      ]
    },
    ['externalKey', 'externalSource', 'externalId', 'ime', 'dobavitelj', 'naslovDobavitelja']
  );

  const missingNaslovDobavitelja = await countAndSample(
    {
      $or: [
        { naslovDobavitelja: { $exists: false } },
        { naslovDobavitelja: '' },
        { naslovDobavitelja: null }
      ]
    },
    ['externalKey', 'externalSource', 'externalId', 'ime', 'dobavitelj', 'naslovDobavitelja']
  );

  const missingIsService = await countAndSample(
    {
      $or: [
        { isService: { $exists: false } },
        { isService: null },
        { $expr: { $ne: [{ $type: '$isService' }, 'bool'] } }
      ]
    },
    ['externalKey', 'externalSource', 'externalId', 'ime', 'isService']
  );

  const missingCategorySlugs = await countAndSample(
    {
      $or: [
        { categorySlugs: { $exists: false } },
        { categorySlugs: { $size: 0 } }
      ]
    },
    ['externalKey', 'externalSource', 'externalId', 'ime', 'categorySlugs']
  );

  return {
    ime: missingIme,
    nabavnaCena: missingNabavna,
    prodajnaCena: missingProdajna,
    dobavitelj: missingDobavitelj,
    naslovDobavitelja: missingNaslovDobavitelja,
    isService: missingIsService,
    categorySlugs: missingCategorySlugs
  };
}

async function buildPriceAnomaliesReport() {
  const prodajnaNonPositive = await countAndSample(
    { $expr: { $and: [{ $isNumber: '$prodajnaCena' }, { $lte: ['$prodajnaCena', 0] }] } },
    ['externalKey', 'externalSource', 'externalId', 'ime', 'prodajnaCena', 'nabavnaCena']
  );

  const nabavnaNegative = await countAndSample(
    { $expr: { $and: [{ $isNumber: '$nabavnaCena' }, { $lt: ['$nabavnaCena', 0] }] } },
    ['externalKey', 'externalSource', 'externalId', 'ime', 'prodajnaCena', 'nabavnaCena']
  );

  const prodajnaBelowNabavna = await countAndSample(
    {
      $expr: {
        $and: [
          { $isNumber: '$prodajnaCena' },
          { $isNumber: '$nabavnaCena' },
          { $lt: ['$prodajnaCena', '$nabavnaCena'] }
        ]
      }
    },
    ['externalKey', 'externalSource', 'externalId', 'ime', 'prodajnaCena', 'nabavnaCena']
  );

  return {
    prodajnaCenaNonPositive: prodajnaNonPositive,
    nabavnaCenaNegative: nabavnaNegative,
    prodajnaBelowNabavna: prodajnaBelowNabavna
  };
}

async function runAudit() {
  loadEnvironment();
  await connectToMongo();

  const totalProducts = await ProductModel.countDocuments();
  const countsBySource = await ProductModel.aggregate([
    { $group: { _id: { $ifNull: ['$externalSource', ''] }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  const duplicates = await buildDuplicateReport();
  const missingFields = await buildMissingFieldsReport();
  const priceAnomalies = await buildPriceAnomaliesReport();

  const report = {
    totals: {
      products: totalProducts
    },
    countsBySource: countsBySource.map((entry) => ({
      source: normalizeString(entry._id),
      count: entry.count
    })),
    duplicates,
    missingFields,
    priceAnomalies
  };

  console.log(JSON.stringify(report, null, 2));
}

runAudit()
  .catch((error) => {
    console.error('Product audit failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
