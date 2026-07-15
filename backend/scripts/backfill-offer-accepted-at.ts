/**
 * Zapolni offerversions.acceptedAt za ponudbe, ki so bile potrjene, preden je
 * polje obstajalo.
 *
 * Datum potrditve se je doslej belezil samo kot dogodek v casovnici projekta
 * ("Ponudba potrjena"), ki je zato prvi vir. Ce dogodka ni, vzamemo updatedAt
 * ponudbe kot priblizek — to je oznaceno v izpisu, ker updatedAt spremeni tudi
 * poznejse urejanje.
 *
 *   npx tsx scripts/backfill-offer-accepted-at.ts            # suhi tek
 *   npx tsx scripts/backfill-offer-accepted-at.ts --apply
 */
import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { ProjectModel } from '../modules/projects/schemas/project';

const APPLY = process.argv.includes('--apply');
const POTRJENA = /ponudba (ponovno )?potrjena/i;

async function main() {
  loadEnvironment();
  await connectToMongo();

  const offers = await OfferVersionModel.find({
    status: 'accepted',
    $or: [{ acceptedAt: null }, { acceptedAt: { $exists: false } }],
  })
    .select({ _id: 1, projectId: 1, title: 1, updatedAt: 1 })
    .lean();

  const projectIds = Array.from(new Set(offers.map((offer) => offer.projectId)));
  const projects = projectIds.length
    ? await ProjectModel.find({ id: { $in: projectIds } }).select({ id: 1, timeline: 1 }).lean()
    : [];
  const timelineByProject = new Map(projects.map((project) => [project.id, project.timeline ?? []]));

  let izCasovnice = 0;
  let izUpdatedAt = 0;

  for (const offer of offers) {
    const events = (timelineByProject.get(offer.projectId) ?? []).filter(
      (event: any) => POTRJENA.test(String(event?.title ?? '')) && event?.timestamp,
    );
    // Zadnja potrditev na projektu je tista, ki velja za trenutno potrjeno ponudbo.
    const latest = events
      .map((event: any) => new Date(event.timestamp))
      .filter((date: Date) => !Number.isNaN(date.getTime()))
      .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];

    const acceptedAt = latest ?? ((offer as any).updatedAt ? new Date((offer as any).updatedAt) : null);
    if (!acceptedAt) continue;

    if (latest) izCasovnice++;
    else izUpdatedAt++;

    if (APPLY) {
      await OfferVersionModel.updateOne({ _id: offer._id }, { $set: { acceptedAt } });
    }
  }

  console.log(`Potrjenih ponudb brez datuma: ${offers.length}`);
  console.log(`  datum iz casovnice projekta: ${izCasovnice}`);
  console.log(`  priblizek iz updatedAt:      ${izUpdatedAt}`);
  console.log(APPLY ? '[ZAPISANO]' : '(suhi tek — za zapis dodaj --apply)');

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
