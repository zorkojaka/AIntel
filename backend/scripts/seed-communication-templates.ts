import mongoose from 'mongoose';

import { loadEnvironment } from '../loadEnv';
import { connectToMongo } from '../db/mongo';
import { CommunicationTemplateModel } from '../modules/communication/schemas/template';

// Privzeti predlogi za maila, ki sta imela do zdaj besedilo fiksno v kodi:
// email monterju (priprava) in vabilo stranki k izbiri termina. Ustvari ju
// samo, ce kategorija se nima nobene predloge — obstojecih ne prepisuje.
// Suhi tek privzeto; zapis sele z --apply.

const DEFAULTS = [
  {
    key: 'monter-priprava-privzeta',
    name: 'Email monterju — priprava montaže',
    category: 'installer_preparation_send',
    subjectTemplate: 'Priprava montaže: {{workOrder.identifier}}',
    bodyTemplate: [
      'Pozdravljen {{installer.name}},',
      '',
      'pošiljamo podatke za pripravo na montažo in potrditev termina za projekt {{project.name}}.',
      '',
      '{{workOrder.details}}',
      '',
      'Delovni nalog je priložen v PDF priponki.',
      '',
      'Lep pozdrav',
    ].join('\n'),
    defaultAttachments: ['work_order_pdf'],
  },
  {
    key: 'vabilo-termin-privzeta',
    name: 'Vabilo stranki k izbiri termina',
    category: 'booking_invite_send',
    subjectTemplate: 'Izbira termina montaže — {{project.name}}',
    bodyTemplate: [
      'Spoštovani {{customer.name}},',
      '',
      'vaša montaža je pripravljena. Prosimo, izberite dan, ki vam najbolj ustreza — na spodnji povezavi so samo dnevi, ko je naša ekipa res na voljo:',
      '',
      '{{booking.link}}',
      '',
      'Predvideno trajanje izvedbe: približno {{booking.duration}}.',
      'Z izbiro dneva je termin potrjen; če vam noben termin ne ustreza, nas pokličite.',
      '',
      'Lep pozdrav',
    ].join('\n'),
    defaultAttachments: [],
  },
  {
    key: 'potrditev-termina-privzeta',
    name: 'Potrditev izbranega termina (stranki)',
    category: 'booking_confirmation_send',
    subjectTemplate: 'Termin montaže potrjen — {{workOrder.schedule}}',
    bodyTemplate: [
      'Spoštovani {{customer.name}},',
      '',
      'potrjujemo termin montaže: {{workOrder.schedule}}.',
      'Naša ekipa pride k vam; pred prihodom vas pokličemo.',
      '',
      'Termin si lahko s spodnjim gumbom dodate v svoj koledar.',
      'Če vam termin ne ustreza, nas pokličite in ga prestavimo.',
      '',
      'Lep pozdrav',
    ].join('\n'),
    defaultAttachments: [],
  },
] as const;

async function seed() {
  const apply = process.argv.includes('--apply');
  loadEnvironment();
  await connectToMongo();

  for (const template of DEFAULTS) {
    const existing = await CommunicationTemplateModel.countDocuments({ category: template.category });
    if (existing > 0) {
      console.log(`- ${template.category}: kategorija ima že ${existing} predlog(o) — preskočim.`);
      continue;
    }
    if (!apply) {
      console.log(`- ${template.category}: bi ustvaril "${template.name}" (suhi tek, dodaj --apply).`);
      continue;
    }
    await CommunicationTemplateModel.create({ ...template, defaultAttachments: [...template.defaultAttachments], isActive: true });
    console.log(`- ${template.category}: ustvarjena predloga "${template.name}".`);
  }
}

seed()
  .catch((error) => {
    console.error('Napaka pri sejanju predlog:', error);
    process.exitCode = 1;
  })
  .finally(() => void mongoose.disconnect());
