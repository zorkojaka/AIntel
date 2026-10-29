import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../core/app';
import { EmployeeModel } from '../modules/employees/schemas/employee';
import { ProjectModel } from '../modules/projects/schemas/project';
import { WorkOrderModel } from '../modules/projects/schemas/work-order';
import { UserModel } from '../modules/users/schemas/user';
import { authCookieName, signSessionToken } from '../modules/auth/services/auth.service';
import { ROLE_EXECUTION, ROLE_ORGANIZER } from '../utils/roles';

async function createUser(role: string, label: string) {
  const employee = await EmployeeModel.create({
    tenantId: 'inteligent', name: label, roles: [role], active: true, appAccess: true, hourRateWithoutVat: 0,
  });
  const user = await UserModel.create({
    tenantId: 'inteligent', email: `${label.toLowerCase()}@example.test`, name: label,
    roles: [], status: 'ACTIVE', active: true, employeeId: employee._id,
  });
  const token = signSessionToken({ userId: String(user._id), tenantId: 'inteligent' });
  return { employeeId: String(employee._id), cookie: `${authCookieName}=${token}` };
}

test('nadzorna plošča: monter vidi le svoje naloge brez cen, urnik podjetja le vodstvo', async () => {
  process.env.NODE_ENV = 'test';
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_dashboard_access' });
  const server = await new Promise<http.Server>((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const get = (path: string, cookie: string) =>
    fetch(`http://127.0.0.1:${address.port}${path}`, { headers: { Accept: 'application/json', Cookie: cookie } });

  try {
    const monter = await createUser(ROLE_EXECUTION, 'Monter');
    const other = await createUser(ROLE_EXECUTION, 'Drugi');
    const organizer = await createUser(ROLE_ORGANIZER, 'Organizator');
    await ProjectModel.create({
      id: 'PRJ-950', code: 'PRJ-950', projectNumber: 950, title: 'Test', customer: { name: 'Stranka' }, status: 'ordered',
      createdAt: new Date().toISOString(),
    });
    const item = { id: 'i1', name: 'Kamera', quantity: 1, unit: 'kos', price: 120, totalPrice: 120, casovnaNorma: 1 };
    const offerVersionId = new mongoose.Types.ObjectId().toString();
    await WorkOrderModel.create({
      projectId: 'PRJ-950', offerVersionId, status: 'issued', scheduledAt: '2026-11-02T08:00:00',
      assignedEmployeeIds: [monter.employeeId], items: [item],
    });
    await WorkOrderModel.create({
      projectId: 'PRJ-950', offerVersionId, status: 'issued', scheduledAt: '2026-11-03T08:00:00',
      assignedEmployeeIds: [other.employeeId], items: [item],
    });

    const installer = (await (await get('/api/dashboard/installer', monter.cookie)).json()) as any;
    assert.equal(installer.data.myWorkOrders.length, 1);
    assert.doesNotMatch(JSON.stringify(installer.data.myWorkOrders), /price|total|cena/i);
    assert.equal((await get('/api/dashboard/company', monter.cookie)).status, 403);

    const company = (await (await get('/api/dashboard/company', organizer.cookie)).json()) as any;
    assert.equal(company.data.workOrders.length, 2);
    assert.doesNotMatch(JSON.stringify(company.data), /price|total|cena/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
