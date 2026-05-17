import mongoose from 'mongoose';
import { loadEnvironment } from '../loadEnv';
import { connectToMongo } from '../db/mongo';

function toStatus(value: unknown) {
  return value === 'koncana' ? 'koncana' : 'osnutek';
}

function toVideonadzorSystem(doc: any) {
  const old = doc?.videonadzor ?? {};
  const asortima = Array.isArray(old.kosarica)
    ? old.kosarica.map((entry: any, index: number) => ({
        id: String(entry.id ?? String.fromCharCode(65 + index)),
        kameraProductId: entry.kameraProductId,
        nosilecProductId: entry.nosilecProductId ?? null,
      })).filter((entry: any) => entry.kameraProductId)
    : [];

  const lokacije = Array.isArray(old.lokacije)
    ? old.lokacije.map((entry: any, index: number) => ({
        id: String(entry.id ?? `loc-${index + 1}`),
        ime: String(entry.ime ?? `Lokacija ${index + 1}`),
        asortimaIdAssigned: entry.kameraId ?? null,
      }))
    : [];

  return {
    id: 'sys-1',
    tip: 'videonadzor',
    steviloLokacij: Math.max(1, lokacije.length),
    videonadzor: {
      asortima,
      lokacije: lokacije.length > 0 ? lokacije : [{ id: 'loc-1', ime: 'Lokacija 1', asortimaIdAssigned: null }],
      snemalnik: { productId: old.snemalnik?.productId ?? null },
      poeSwitch: { productId: old.poeSwitch?.productId ?? null },
      disk: {
        productId: old.disk?.productId ?? null,
        dniSnemanja: Number(old.disk?.dniSnemanja) || 30,
        motionRecord: Boolean(old.disk?.motionRecord),
      },
      dodatnaOprema: Array.isArray(old.dodatnaOprema) ? old.dodatnaOprema : [],
      montaza: {
        vkljuceno: Boolean(old.montaza?.vkljuceno),
        napeljava: Boolean(old.montaza?.napeljava),
        metrov: Number(old.montaza?.metrov) || 0,
        zascitniMaterial: old.montaza?.zascitniMaterial ?? null,
      },
    },
  };
}

async function main() {
  loadEnvironment();
  await connectToMongo();
  const collection = mongoose.connection.collection('zahteve');
  const docs = await collection.find({ $or: [{ sistemi: { $exists: false } }, { videonadzor: { $exists: true } }] }).toArray();

  let migrated = 0;
  for (const doc of docs) {
    const sistemi = Array.isArray((doc as any).sistemi) && (doc as any).sistemi.length > 0
      ? (doc as any).sistemi
      : [toVideonadzorSystem(doc)];

    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          status: toStatus((doc as any).status),
          sistemi,
        },
        $unset: {
          tipProjekta: '',
          pot: '',
          videonadzor: '',
          alarm: '',
          domofon: '',
          pametnaHisa: '',
        },
      }
    );
    migrated += 1;
  }

  console.log(JSON.stringify({ migrated }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
