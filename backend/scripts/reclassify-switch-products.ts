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

function isSwitchCandidate(product: any) {
  const text = `${product.ime ?? ''} ${product.kratekOpis ?? ''} ${product.dolgOpis ?? ''} ${product.aaData?.category ?? ''} ${product.aaData?.rawDescription ?? ''}`;
  return /poe/i.test(text) && /(switch|stikalo|stikala|DS-3E01)/i.test(text);
}

async function main() {
  loadEnvironment();
  await connectToMongo();

  const candidates = await ProductModel.find({
    isActive: { $ne: false },
    $or: [
      { 'classification.productType': 'switch' },
      { ime: /DS-3E01/i },
      { kratekOpis: /(poe.*stikal|stikal.*poe|poe.*switch|switch.*poe)/i },
      { 'aaData.category': /(poe.*stikal|stikal.*poe|poe.*switch|switch.*poe)/i },
      { 'aaData.rawDescription': /(poe.*stikal|stikal.*poe|poe.*switch|switch.*poe)/i },
    ],
  });

  let updatedCount = 0;
  for (const product of candidates) {
    if (!isSwitchCandidate(product)) continue;
    const nextClassification = classifyProduct(toRawProduct(product));
    if (nextClassification.productType !== 'switch') continue;
    const classification = {
      ...nextClassification,
      productType: 'switch',
    };
    await ProductModel.collection.updateOne({ _id: product._id }, { $set: { classification } });
    updatedCount += 1;
  }

  const switches = await ProductModel.find({
    'classification.productType': 'switch',
    isActive: { $ne: false },
  })
    .select('_id ime classification aaData.category kratekOpis')
    .sort({ ime: 1 })
    .lean();

  const poePortPositive = switches.filter((product) => Number(product.classification?.poePortCount ?? 0) > 0);
  console.log(JSON.stringify({
    candidates: candidates.length,
    updated: updatedCount,
    productTypeSwitch: switches.length,
    poePortPositive: poePortPositive.length,
    examples: poePortPositive.slice(0, 3).map((product) => ({
      id: String(product._id),
      ime: product.ime,
      classification: product.classification,
    })),
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
