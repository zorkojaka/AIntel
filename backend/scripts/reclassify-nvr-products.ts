import mongoose from 'mongoose';
import { loadEnvironment } from '../loadEnv';
import { connectToMongo } from '../db/mongo';
import { ProductModel } from '../modules/cenik/product.model';
import { classifyProduct } from '../modules/cenik/sync/classifier';

function toRawProduct(product: any) {
  return {
    id: product.externalId || product.aaData?.productCode || String(product._id),
    name: product.ime ?? '',
    description: product.dolgOpis || product.kratekOpis || product.aaData?.rawDescription || '',
    price: Number(product.prodajnaCena ?? 0),
    category: product.aaData?.category || product.kategorija || '',
    attributes: product.aaData?.attributes ?? [],
  };
}

function sample(products: any[]) {
  return products.slice(0, 3).map((product) => ({
    id: String(product._id),
    ime: product.ime,
    nvrHasPoE: product.classification?.nvrHasPoE === true,
  }));
}

async function main() {
  loadEnvironment();
  await connectToMongo();

  const recorders = await ProductModel.find({
    'classification.productType': 'snemalnik',
    isActive: { $ne: false },
  });

  for (const product of recorders) {
    const nextClassification = classifyProduct(toRawProduct(product));
    product.classification = {
      ...(product.classification ?? {}),
      ...nextClassification,
      productType: 'snemalnik',
    };
    await product.save();
  }

  const updated = await ProductModel.find({
    'classification.productType': 'snemalnik',
    isActive: { $ne: false },
  })
    .select('_id ime classification.nvrHasPoE')
    .sort({ ime: 1 })
    .lean();

  const withPoe = updated.filter((product) => product.classification?.nvrHasPoE === true);
  const withoutPoe = updated.filter((product) => product.classification?.nvrHasPoE !== true);

  console.log(JSON.stringify({
    total: updated.length,
    hasPoETrue: withPoe.length,
    hasPoEFalse: withoutPoe.length,
    examplesTrue: sample(withPoe),
    examplesFalse: sample(withoutPoe),
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
