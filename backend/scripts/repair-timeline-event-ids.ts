/**
 * Popravi zapise casovnice brez `id`.
 *
 * Zakaj: modul Poste (in naročila dobaviteljem) sta dogodek dodajala z
 * updateOne($push) BREZ id. $push sheme ne preveri, zato se je zapis tiho
 * shranil — od tedaj naprej pa je vsak `project.save()` padel z
 * "timeline.N.id: Path `id` is required", ker save validira CEL dokument.
 * Posledica: projekta ni bilo mogoce urejati — ne shraniti delovnega naloga,
 * ne narediti racuna.
 *
 * Koda je popravljena (newTimelineEventId), ta skripta pa zaceli ze obstojece
 * zapise. Idempotentna: dotakne se samo zapisov brez id.
 *
 *   npx tsx scripts/repair-timeline-event-ids.ts            # suhi tek
 *   npx tsx scripts/repair-timeline-event-ids.ts --apply
 */
import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProjectModel, newTimelineEventId } from '../modules/projects/schemas/project';

const APPLY = process.argv.includes('--apply');

async function main() {
  loadEnvironment();
  await connectToMongo();

  const projects = await ProjectModel.find({ 'timeline.0': { $exists: true } })
    .select({ id: 1, code: 1, timeline: 1 })
    .lean();

  let popravljenihProjektov = 0;
  let popravljenihZapisov = 0;

  for (const project of projects) {
    const timeline = (project.timeline ?? []) as Array<Record<string, unknown>>;
    const brezId = timeline.filter((event) => !event.id);
    if (brezId.length === 0) continue;

    popravljenihProjektov++;
    popravljenihZapisov += brezId.length;
    console.log(`${project.code}: ${brezId.length} zapisov brez id — ${brezId.map((e) => e.title).join(' | ')}`);

    if (!APPLY) continue;

    const popravljena = timeline.map((event) => (event.id ? event : { ...event, id: newTimelineEventId() }));
    // updateOne (ne save): dokument je trenutno neveljaven, zato ga save ne bi spustil skozi.
    await ProjectModel.updateOne({ _id: (project as any)._id }, { $set: { timeline: popravljena } });
  }

  console.log(`\nProjektov s pokvarjeno casovnico: ${popravljenihProjektov} (zapisov: ${popravljenihZapisov})`);
  console.log(APPLY ? '[ZAPISANO]' : '(suhi tek — za zapis dodaj --apply)');

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
