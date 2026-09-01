import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { EmployeeModel } from '../modules/employees/schemas/employee';
import { ProjectModel } from '../modules/projects/schemas/project';
import { WorkOrderModel } from '../modules/projects/schemas/work-order';
import {
  acceptInstallerAssignmentByToken,
  acceptInstallerAssignmentInSystem,
  confirmAllInstallerAssignmentsByAdmin,
  ensureInstallerAcceptanceTokens,
  InstallerAcceptanceError,
} from '../modules/projects/services/installer-acceptance.service';

let mongod: MongoMemoryServer;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'aintel_installer_acceptance' });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await Promise.all([
    EmployeeModel.deleteMany({}),
    ProjectModel.deleteMany({}),
    WorkOrderModel.deleteMany({}),
  ]);
});

async function createInstaller(name: string) {
  return EmployeeModel.create({
    tenantId: 'inteligent',
    name,
    roles: ['EXECUTION'],
    hourRateWithoutVat: 20,
  });
}

test('vsak dodeljeni monter lahko projekt sprejme v sistemu ali prek svojega email žetona', async () => {
  const miha = await createInstaller('Miha');
  const ana = await createInstaller('Ana');
  await ProjectModel.create({
    id: 'PRJ-ACCEPT',
    code: 'PRJ-ACCEPT',
    projectNumber: 501,
    title: 'Projekt za sprejem',
    customer: { name: 'Testna stranka' },
    status: 'ordered',
    createdAt: new Date().toISOString(),
  });
  const workOrder = await WorkOrderModel.create({
    projectId: 'PRJ-ACCEPT',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [],
    assignedEmployeeIds: [miha._id, ana._id],
    status: 'issued',
  });

  const entries = await ensureInstallerAcceptanceTokens(workOrder);
  assert.equal(entries.length, 2);
  assert.notEqual(entries[0].token, entries[1].token);

  await acceptInstallerAssignmentInSystem({
    projectId: 'PRJ-ACCEPT',
    workOrderId: String(workOrder._id),
    employeeId: String(miha._id),
  });
  assert.equal((await WorkOrderModel.findById(workOrder._id).lean())?.status, 'issued');
  const anaEntry = entries.find((entry) => String(entry.employeeId) === String(ana._id));
  assert.ok(anaEntry?.token);
  await acceptInstallerAssignmentByToken(anaEntry.token);

  const updated = await WorkOrderModel.findById(workOrder._id).lean();
  assert.equal(updated?.installerAcceptances?.length, 2);
  assert.equal(updated?.installerAcceptances?.find((entry) => String(entry.employeeId) === String(miha._id))?.acceptedVia, 'system');
  assert.equal(updated?.installerAcceptances?.find((entry) => String(entry.employeeId) === String(ana._id))?.acceptedVia, 'email');
  assert.ok(updated?.installerAcceptances?.every((entry) => entry.acceptedAt));
  assert.equal(updated?.status, 'confirmed');
  assert.equal((await ProjectModel.findOne({ id: 'PRJ-ACCEPT' }).lean())?.status, 'ordered');
});

test('monter, ki ni dodeljen delovnemu nalogu, projekta ne more sprejeti', async () => {
  const miha = await createInstaller('Miha');
  const ana = await createInstaller('Ana');
  const workOrder = await WorkOrderModel.create({
    projectId: 'PRJ-OTHER',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [],
    assignedEmployeeIds: [miha._id],
  });

  await assert.rejects(
    acceptInstallerAssignmentInSystem({
      projectId: 'PRJ-OTHER',
      workOrderId: String(workOrder._id),
      employeeId: String(ana._id),
    }),
    (error: unknown) => error instanceof InstallerAcceptanceError && error.statusCode === 403,
  );
});

test('administrator lahko ročno potrdi vse še nepotrjene dodeljene monterje', async () => {
  const miha = await createInstaller('Miha');
  const ana = await createInstaller('Ana');
  await ProjectModel.create({
    id: 'PRJ-ADMIN-ACCEPT',
    code: 'PRJ-ADMIN-ACCEPT',
    projectNumber: 502,
    title: 'Projekt za ročno potrditev',
    customer: { name: 'Testna stranka' },
    status: 'ordered',
    createdAt: new Date().toISOString(),
  });
  const workOrder = await WorkOrderModel.create({
    projectId: 'PRJ-ADMIN-ACCEPT',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [],
    assignedEmployeeIds: [miha._id, ana._id],
    status: 'issued',
  });

  const result = await confirmAllInstallerAssignmentsByAdmin({
    projectId: 'PRJ-ADMIN-ACCEPT',
    workOrderId: String(workOrder._id),
    actorName: 'Administrator',
  });
  assert.equal(result.confirmedEmployeeIds.length, 2);

  const updated = await WorkOrderModel.findById(workOrder._id).lean();
  assert.ok(updated?.installerAcceptances?.every((entry) => entry.acceptedAt));
  assert.ok(updated?.installerAcceptances?.every((entry) => entry.acceptedVia === 'admin'));
  assert.equal(updated?.status, 'confirmed');
});

test('stari že potrjeni nalog brez statusa sprejet se popravi brez migracije', async () => {
  const miha = await createInstaller('Miha');
  const acceptedAt = new Date('2026-01-10T10:00:00.000Z');
  const workOrder = await WorkOrderModel.create({
    projectId: 'PRJ-LEGACY-ACCEPT',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [],
    assignedEmployeeIds: [miha._id],
    installerAcceptances: [{
      employeeId: miha._id,
      token: 'a'.repeat(48),
      acceptedAt,
      acceptedVia: 'system',
    }],
    status: 'issued',
  });

  const result = await confirmAllInstallerAssignmentsByAdmin({
    projectId: 'PRJ-LEGACY-ACCEPT',
    workOrderId: String(workOrder._id),
    actorName: 'Administrator',
  });

  assert.deepEqual(result.confirmedEmployeeIds, []);
  assert.equal((await WorkOrderModel.findById(workOrder._id).lean())?.status, 'confirmed');
});
