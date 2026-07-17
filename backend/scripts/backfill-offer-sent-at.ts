import mongoose from 'mongoose';

import { loadEnvironment } from '../loadEnv';
import { connectToMongo } from '../db/mongo';
import { ProjectModel } from '../modules/projects/schemas/project';
import { CommunicationMessageModel } from '../modules/communication/schemas/message';

// Enkratna uskladitev z novim pravilom "projekt je v Ponudbah sele od POSLANE
// ponudbe": (1) offerSentAt se napolni iz zadnjega poslanega maila s ponudbo,
// (2) projekti s statusom 'offered' BREZ poslane ponudbe se vrnejo v 'draft'
// (stolpec Zahteve). Suhi tek privzeto; zapis sele z --apply.

async function run() {
  const apply = process.argv.includes('--apply');
  loadEnvironment();
  await connectToMongo();

  // Zadnji poslani mail s ponudbo po projektu (ponudba ima offerId, ni pa
  // interne poste, potrdila naloga ali racuna).
  const sent = await CommunicationMessageModel.aggregate([
    {
      $match: {
        status: 'sent',
        offerId: { $nin: [null, ''] },
        $and: [
          { $or: [{ workOrderId: null }, { workOrderId: { $exists: false } }] },
          { $or: [{ invoiceVersionId: null }, { invoiceVersionId: { $exists: false } }] },
          { $or: [{ audience: { $ne: 'internal' } }, { audience: { $exists: false } }] },
        ],
      },
    },
    { $group: { _id: '$projectId', lastSentAt: { $max: '$sentAt' } } },
  ]);
  const lastSentByProject = new Map<string, Date>(
    sent.filter((entry) => entry._id && entry.lastSentAt).map((entry) => [String(entry._id), new Date(entry.lastSentAt)]),
  );

  const projects = await ProjectModel.find({}).select({ id: 1, status: 1, offerSentAt: 1, title: 1 }).lean();
  let fillCount = 0;
  let demoteCount = 0;

  for (const project of projects) {
    const lastSent = lastSentByProject.get(project.id);

    if (lastSent && !project.offerSentAt) {
      fillCount += 1;
      console.log(`- ${project.id}: offerSentAt ← ${lastSent.toISOString().slice(0, 10)} (${project.title ?? ''})`);
      if (apply) await ProjectModel.updateOne({ id: project.id }, { $set: { offerSentAt: lastSent } });
    }

    if (!lastSent && project.status === 'offered') {
      demoteCount += 1;
      console.log(`- ${project.id}: 'offered' brez poslane ponudbe → 'draft' (${project.title ?? ''})`);
      if (apply) await ProjectModel.updateOne({ id: project.id, status: 'offered' }, { $set: { status: 'draft' } });
    }
  }

  console.log(`\n${apply ? 'ZAPISANO' : 'SUHI TEK (dodaj --apply)'}: offerSentAt=${fillCount}, vrnjenih v Zahteve=${demoteCount}.`);
}

run()
  .catch((error) => {
    console.error('Napaka:', error);
    process.exitCode = 1;
  })
  .finally(() => void mongoose.disconnect());
