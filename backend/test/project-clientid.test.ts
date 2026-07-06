import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { CrmClientModel } from '../modules/crm/schemas/client';
import { createProject } from '../modules/projects/controllers/project.controller';
import { ProjectModel } from '../modules/projects/schemas/project';
import { analyzeProjectClientIdBackfill } from '../scripts/project-clientid-backfill-report';

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

test('AIN-P1-07 createProject stores selected CRM clientId on Project', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_project_clientid' });

  try {
    const client = await CrmClientModel.create({
      name: 'Client Linked d.o.o.',
      type: 'company',
      vat_number: 'SI87654321',
      address: 'Testna 2',
      email: 'linked@example.test',
      tags: [],
      isActive: true,
    });

    const { res, result } = createResponse();
    await createProject(
      {
        body: {
          title: 'Client linked project',
          clientId: String(client._id),
          customer: {
            name: client.name,
            taxId: client.vat_number,
            address: client.address,
            paymentTerms: '30 dni',
          },
          categories: [],
          requirements: '',
          items: [],
          templates: [],
        },
      } as any,
      res as any,
    );

    assert.equal(result.ok, true, result.error);
    assert.equal(result.statusCode, 201);
    assert.equal(result.data.client.id, String(client._id));

    const created = await ProjectModel.findOne({ id: result.data.id }).lean();
    assert.equal(String(created?.clientId), String(client._id));
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('AIN-P1-07 backfill report matches only unambiguous Project customer to CrmClient candidates', () => {
  const report = analyzeProjectClientIdBackfill(
    [
      { id: 'PRJ-001', clientId: 'existing-client', customer: { name: 'Existing', taxId: '' } },
      { id: 'PRJ-002', customer: { name: 'By Vat', taxId: 'SI11111111' } },
      { id: 'PRJ-003', customer: { name: 'Duplicate Name', taxId: '' } },
      { id: 'PRJ-004', customer: { name: 'Missing', taxId: '' } },
    ],
    [
      { id: 'client-vat', name: 'Different Name', vatNumber: 'SI11111111' },
      { id: 'client-a', name: 'Duplicate Name' },
      { id: 'client-b', name: 'Duplicate Name' },
    ],
  );

  assert.deepEqual(report.totals, {
    projects: 4,
    alreadyLinked: 1,
    matches: 1,
    ambiguous: 1,
    noMatch: 1,
  });
  assert.equal(report.rows[1].status, 'match');
  assert.equal(report.rows[1].matchReason, 'taxId');
  assert.equal(report.rows[2].status, 'ambiguous');
  assert.equal(report.rows[3].status, 'no_match');
});
