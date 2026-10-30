import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { deleteProject } from '../modules/projects/controllers/project.controller';
import { ProjectModel } from '../modules/projects/schemas/project';
import { CommunicationEventModel } from '../modules/communication/schemas/event';
import { CommunicationMessageModel } from '../modules/communication/schemas/message';
import { ZahtevaModel } from '../modules/zahteve/zahteva.model';
import { PhotoModel } from '../modules/photos/schemas/photo';

function createResponse() {
  const result: { ok: boolean; statusCode: number; data?: any; error?: string } = { ok: false, statusCode: 0 };
  const res = {
    success(data?: unknown, statusCode = 200) {
      result.ok = true;
      result.statusCode = statusCode;
      result.data = data;
      return res;
    },
    fail(error?: string, statusCode = 500) {
      result.ok = false;
      result.statusCode = statusCode;
      result.error = error;
      return res;
    },
  };
  return { res, result };
}

test('deleteProject removes requests, photos and communication but leaves other projects alone', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_project_delete' });

  try {
    const deletedId = new mongoose.Types.ObjectId();
    const keptId = new mongoose.Types.ObjectId();
    await ProjectModel.collection.insertMany([
      { _id: deletedId, id: 'PRJ-901', title: 'Brisan' },
      { _id: keptId, id: 'PRJ-902', title: 'Ostane' },
    ]);
    for (const [objectId, key] of [
      [deletedId, 'PRJ-901'],
      [keptId, 'PRJ-902'],
    ] as const) {
      await ZahtevaModel.collection.insertOne({ projectId: objectId });
      await PhotoModel.collection.insertOne({ projectId: objectId, phase: 'execution' });
      await CommunicationEventModel.collection.insertOne({ projectId: key });
      await CommunicationMessageModel.collection.insertOne({ projectId: key });
    }

    const { res, result } = createResponse();
    await deleteProject({ params: { id: 'PRJ-901' } } as any, res as any);
    assert.equal(result.ok, true);

    for (const model of [ZahtevaModel, PhotoModel] as const) {
      assert.equal(await (model as any).countDocuments({ projectId: deletedId }), 0);
      assert.equal(await (model as any).countDocuments({ projectId: keptId }), 1);
    }
    for (const model of [CommunicationEventModel, CommunicationMessageModel] as const) {
      assert.equal(await (model as any).countDocuments({ projectId: 'PRJ-901' }), 0);
      assert.equal(await (model as any).countDocuments({ projectId: 'PRJ-902' }), 1);
    }
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
