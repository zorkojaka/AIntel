import mongoose from 'mongoose';
import { loadEnvironment } from '../loadEnv';
import { connectToMongo } from '../db/mongo';

function executionFromLegacyMontaza(montaza: any) {
  const metrov = Math.max(0, Number(montaza?.metrov) || 0);
  if (!montaza?.vkljuceno) {
    return { scenarioType: 'posiljanje', estimates: { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0 } };
  }
  if (!montaza?.napeljava) {
    return { scenarioType: 'izvedba', estimates: { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0 } };
  }
  return {
    scenarioType: 'izvedba_napeljava',
    estimates: {
      napeljavaUr: 0,
      utpKabelMetrov: metrov,
      kanalMetrov: montaza?.zascitniMaterial === 'kanal' ? metrov : 0,
    },
  };
}

async function main() {
  loadEnvironment();
  await connectToMongo();
  const collection = mongoose.connection.collection('zahteve');
  const docs = await collection
    .find({
      $or: [
        { execution: { $exists: true } },
        { 'sistemi.videonadzor.montaza': { $exists: true } },
      ],
    })
    .toArray();

  let migrated = 0;
  for (const doc of docs) {
    const topLevelExecution = (doc as any).execution;
    const sistemi = Array.isArray((doc as any).sistemi)
      ? (doc as any).sistemi.map((sistem: any) => {
          const legacyMontaza = sistem?.videonadzor?.montaza;
          const { montaza: _montaza, ...videonadzor } = sistem?.videonadzor ?? {};
          return {
            ...sistem,
            videonadzor: sistem?.videonadzor ? videonadzor : sistem?.videonadzor,
            execution: sistem?.execution ?? (legacyMontaza ? executionFromLegacyMontaza(legacyMontaza) : topLevelExecution),
          };
        })
      : [];

    await collection.updateOne(
      { _id: doc._id },
      {
        $set: { sistemi },
        $unset: { execution: '' },
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
