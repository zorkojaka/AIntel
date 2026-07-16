import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { CrmClientModel } from '../modules/crm/schemas/client';
import { CrmNoteModel } from '../modules/crm/schemas/note';
import { ProjectModel } from '../modules/projects/schemas/project';
import {
  ClientNoteError,
  addClientNote,
  addClientNoteFromProject,
  listClientNotes,
  listClientNotesForProject,
} from '../modules/crm/services/client-notes.service';

const MONTER = { userId: new mongoose.Types.ObjectId().toString(), name: 'Miha Monter' };
const PRODAJNIK = { userId: new mongoose.Types.ObjectId().toString(), name: 'Jaka Zorko' };

async function createClient(name = 'Testna stranka') {
  return CrmClientModel.create({ name, type: 'individual' });
}

async function createProject(id: string, clientId: mongoose.Types.ObjectId | null, num: number) {
  return ProjectModel.create({
    id,
    code: id,
    projectNumber: num,
    title: `${id}: Videonadzor`,
    customer: { name: 'Testna stranka' },
    status: 'in-progress',
    createdAt: new Date().toISOString(),
    clientId,
  });
}

async function withMongo(fn: () => Promise<void>) {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_client_notes' });
  try {
    await fn();
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

test('zapisi o stranki se zbirajo cez vec projektov, najnovejsi prvi', async () => {
  await withMongo(async () => {
    const client = await createClient();
    await createProject('PRJ-1', client._id as any, 1);
    await createProject('PRJ-2', client._id as any, 2);

    await addClientNoteFromProject({ projectId: 'PRJ-1', content: 'Pes na dvoriscu, grize.', author: MONTER });
    await addClientNoteFromProject({ projectId: 'PRJ-2', content: 'Omarica je v kleti za vrati.', author: MONTER });
    await addClientNote({ clientId: String(client._id), content: 'Stranka placuje redno.', author: PRODAJNIK });

    const notes = await listClientNotes(String(client._id));
    assert.equal(notes.length, 3, 'zapisi z razlicnih projektov so na isti stranki');
    assert.equal(notes[0].content, 'Stranka placuje redno.', 'najnovejsi je prvi');
    assert.equal(notes[0].projectId, null, 'zapis brez projekta je dovoljen');
    assert.equal(notes[0].createdByName, 'Jaka Zorko');

    const izProjekta = notes.find((note) => note.projectId === 'PRJ-2');
    assert.equal(izProjekta?.projectTitle, 'PRJ-2: Videonadzor', 'vidi se, s katerega projekta je zapis');
    assert.equal(izProjekta?.createdByName, 'Miha Monter');
  });
});

test('monter iz delovnega naloga vidi vse zapise stranke, tudi s tujih projektov', async () => {
  await withMongo(async () => {
    const client = await createClient();
    await createProject('PRJ-10', client._id as any, 10);
    await createProject('PRJ-11', client._id as any, 11);
    await addClientNoteFromProject({ projectId: 'PRJ-10', content: 'Lani zamenjana centrala.', author: PRODAJNIK });

    // Monter odpre DRUG projekt iste stranke in mora videti prejsnji zapis.
    const { clientId, notes } = await listClientNotesForProject('PRJ-11');
    assert.equal(clientId, String(client._id));
    assert.equal(notes.length, 1);
    assert.equal(notes[0].content, 'Lani zamenjana centrala.');
    assert.equal(notes[0].projectId, 'PRJ-10');
  });
});

test('zapis se veze na stranko, ne na projekt — projekt je samo izvor', async () => {
  await withMongo(async () => {
    const client = await createClient();
    await createProject('PRJ-20', client._id as any, 20);
    const note = await addClientNoteFromProject({ projectId: 'PRJ-20', content: 'Posebnost na terenu.', author: MONTER });

    const shranjen = await CrmNoteModel.findById(note._id).lean();
    assert.equal(shranjen?.entity_type, 'client');
    assert.equal(String(shranjen?.entity_id), String(client._id));
    assert.equal(shranjen?.projectId, 'PRJ-20');
    assert.equal(shranjen?.created_by_name, 'Miha Monter');
  });
});

test('prazen ali predolg zapis se zavrne, projekt brez stranke pa pojasni zakaj', async () => {
  await withMongo(async () => {
    const client = await createClient();
    await createProject('PRJ-30', client._id as any, 30);
    await createProject('PRJ-31', null, 31);

    await assert.rejects(
      () => addClientNote({ clientId: String(client._id), content: '   ', author: MONTER }),
      /Zapis je prazen/,
    );
    await assert.rejects(
      () => addClientNote({ clientId: String(client._id), content: 'x'.repeat(5001), author: MONTER }),
      /predolg/,
    );
    await assert.rejects(
      () => addClientNoteFromProject({ projectId: 'PRJ-31', content: 'Nekaj', author: MONTER }),
      (error: unknown) => error instanceof ClientNoteError && error.statusCode === 409,
      'projekt brez stranke vrne razumljivo napako',
    );
    await assert.rejects(() => listClientNotes('ni-objectid'), /Neveljaven ID stranke/);
  });
});
