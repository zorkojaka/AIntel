/**
 * Poveže obstoječe projekte s CRM stranko (project.clientId).
 *
 * Zakaj: clientId se je začel polniti šele s spletnimi povpraševanji (ECO-27),
 * zato starejši projekti nimajo vezi na stranko. Brez nje se interni zapisi o
 * stranki nimajo kam zbirati — ista stranka mora imeti vse svoje projekte na
 * enem mestu.
 *
 * Ujemanje je NAMENOMA konservativno: projekt se poveže SAMO, če se normalizirano
 * ime iz project.customer.name ujema z natanko ENO stranko. Dvoumni (več strank
 * z istim imenom) in neujemajoči se izpišejo in ostanejo nedotaknjeni — te je
 * treba povezati ročno.
 *
 *   npx tsx scripts/backfill-project-client-links.ts            # suhi tek (nič ne piše)
 *   npx tsx scripts/backfill-project-client-links.ts --apply
 */
import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { CrmClientModel } from '../modules/crm/schemas/client';
import { ProjectModel } from '../modules/projects/schemas/project';

const APPLY = process.argv.includes('--apply');

function normalizeName(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '');
}

async function main() {
  loadEnvironment();
  await connectToMongo();

  const clients = await CrmClientModel.find({}).select({ _id: 1, name: 1 }).lean();
  const byName = new Map<string, Array<{ _id: unknown; name: string }>>();
  for (const client of clients) {
    const key = normalizeName(client.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(client as any);
  }

  const projects = await ProjectModel.find({ $or: [{ clientId: null }, { clientId: { $exists: false } }] })
    .select({ id: 1, code: 1, 'customer.name': 1 })
    .lean();

  const povezani: string[] = [];
  const dvoumni: string[] = [];
  const brezUjema: string[] = [];

  for (const project of projects) {
    const name = (project as any).customer?.name;
    const matches = byName.get(normalizeName(name)) ?? [];
    if (matches.length === 1) {
      povezani.push(`${project.code} "${name}" -> ${matches[0]._id}`);
      if (APPLY) {
        await ProjectModel.updateOne({ _id: (project as any)._id }, { $set: { clientId: matches[0]._id } });
      }
    } else if (matches.length > 1) {
      dvoumni.push(`${project.code} "${name}" -> ${matches.length} strank: ${matches.map((m) => m._id).join(', ')}`);
    } else {
      brezUjema.push(`${project.code} "${name}"`);
    }
  }

  console.log(`Projektov brez vezi: ${projects.length}`);
  console.log(`  povezanih (1 zadetek): ${povezani.length}${APPLY ? ' [ZAPISANO]' : ' [suhi tek]'}`);
  console.log(`  dvoumnih (rocno):      ${dvoumni.length}`);
  console.log(`  brez ujemanja (rocno): ${brezUjema.length}`);
  if (dvoumni.length) {
    console.log('\nDVOUMNI — poveži ročno:');
    dvoumni.forEach((line) => console.log('  ' + line));
  }
  if (brezUjema.length) {
    console.log('\nBREZ UJEMANJA — stranka ne obstaja:');
    brezUjema.forEach((line) => console.log('  ' + line));
  }
  if (!APPLY) {
    console.log('\n(suhi tek — za zapis dodaj --apply)');
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
