import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ProjectModel, addTimeline, newTimelineEventId } from '../modules/projects/schemas/project';

async function withMongo(fn: () => Promise<void>) {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_timeline' });
  try {
    await fn();
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

async function createProject(id = 'PRJ-1') {
  return ProjectModel.create({
    id,
    code: id,
    projectNumber: 1,
    title: 'Testni projekt',
    customer: { name: 'Stranka' },
    status: 'in-progress',
    createdAt: new Date().toISOString(),
  });
}

test('zapis casovnice brez id onemogoci VSAKO shranjevanje projekta', async () => {
  await withMongo(async () => {
    await createProject();
    // Tako je pisal modul Poste: $push sheme ne preveri, zato se zapis shrani …
    await ProjectModel.updateOne(
      { id: 'PRJ-1' },
      { $push: { timeline: { type: 'edit', title: 'Prejet e-mail', description: 'x', timestamp: 'zdaj', user: 'Pošta' } as any } },
    );

    // … a projekt je od tedaj naprej nemogoce shraniti (velja za del. nalog in racun).
    const project = await ProjectModel.findOne({ id: 'PRJ-1' });
    project!.status = 'completed';
    await assert.rejects(() => project!.save(), /timeline\.0\.id: Path `id` is required/);
  });
});

test('zapis z newTimelineEventId ne podre shranjevanja', async () => {
  await withMongo(async () => {
    await createProject('PRJ-2');
    await ProjectModel.updateOne(
      { id: 'PRJ-2' },
      {
        $push: {
          timeline: {
            id: newTimelineEventId(),
            type: 'edit',
            title: 'Prejet e-mail',
            description: 'x',
            timestamp: 'zdaj',
            user: 'Pošta',
          } as any,
        },
      },
    );

    const project = await ProjectModel.findOne({ id: 'PRJ-2' });
    project!.status = 'completed';
    await project!.save();

    const reread = await ProjectModel.findOne({ id: 'PRJ-2' }).lean();
    assert.equal(reread?.status, 'completed');
    assert.equal(reread?.timeline?.length, 1);
    assert.ok(reread?.timeline?.[0].id, 'zapis ima id');
  });
});

test('newTimelineEventId je enolicen tudi znotraj iste milisekunde', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newTimelineEventId()));
  assert.equal(ids.size, 500, 'brez podvojitev');
});

test('addTimeline doda id in postavi dogodek na vrh', async () => {
  await withMongo(async () => {
    const project = await createProject('PRJ-3');
    addTimeline(project, { type: 'edit', title: 'Prvi', description: 'prvi opis', timestamp: 'a', user: 'test' } as any);
    addTimeline(project, { type: 'edit', title: 'Drugi', description: 'drugi opis', timestamp: 'b', user: 'test' } as any);
    await project.save();

    const reread = await ProjectModel.findOne({ id: 'PRJ-3' }).lean();
    assert.equal(reread?.timeline?.[0].title, 'Drugi', 'najnovejsi je prvi');
    assert.ok(reread?.timeline?.every((event) => !!event.id));
  });
});
