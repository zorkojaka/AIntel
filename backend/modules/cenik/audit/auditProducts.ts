import { ProductModel } from '../product.model';

type SampleRecord = Record<string, unknown>;

type CountSample = {
  count: number;
  samples: SampleRecord[];
};

export type AuditReport = {
  totals: {
    products: number;
  };
  countsBySource: Array<{
    source: string;
    count: number;
  }>;
  duplicates: {
    externalKey: { groupCount: number };
    externalSourceExternalId: { groupCount: number };
    nameManufacturerSupplier: { groupCount: number };
  };
  missingFields: {
    ime: CountSample;
    nabavnaCena: CountSample;
    prodajnaCena: CountSample;
    dobavitelj: CountSample;
    naslovDobavitelja: CountSample;
    isService: CountSample;
    categorySlugs: CountSample;
  };
  priceAnomalies: {
    prodajnaCenaNonPositive: CountSample;
    nabavnaCenaNegative: CountSample;
    prodajnaBelowNabavna: CountSample;
  };
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
      groupCount: dupExternalKeyGroups.length
    },
    externalSourceExternalId: {
      groupCount: dupExternalSourceIdGroups.length
    },
    nameManufacturerSupplier: {
      groupCount: dupNameGroups.length
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

export async function auditProducts(): Promise<AuditReport> {
  const totalProducts = await ProductModel.countDocuments();
  const countsBySource = await ProductModel.aggregate([
    { $group: { _id: { $ifNull: ['$externalSource', ''] }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  const duplicates = await buildDuplicateReport();
  const missingFields = await buildMissingFieldsReport();
  const priceAnomalies = await buildPriceAnomaliesReport();

  return {
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
}
