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

test('monter odpre logistiko, nalog in PDF le na dodeljenem projektu; podpis mu ne vrne cen', async () => {
  process.env.NODE_ENV = 'test';
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_execution_project_access' });
  const server = await new Promise<http.Server>((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const call = (method: string, path: string, cookie: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  try {
    const monter = await createUser(ROLE_EXECUTION, 'Monter');
    const organizer = await createUser(ROLE_ORGANIZER, 'Organizator');
    const offerVersionId = new mongoose.Types.ObjectId().toString();
    await ProjectModel.create({
      id: 'PRJ-910', code: 'PRJ-910', projectNumber: 910, title: 'Dodeljen', customer: { name: 'Stranka' }, status: 'in-progress',
      createdAt: new Date().toISOString(),
      invoiceVersions: [{
        _id: new mongoose.Types.ObjectId().toString(), versionNumber: 1, invoiceNumber: '1-10-2026', status: 'issued',
        issuedAt: new Date().toISOString(), items: [], summary: { baseWithoutVat: 100, discountedBase: 100, vatAmount: 22, totalWithVat: 122 },
      }],
    });
    await ProjectModel.create({
      id: 'PRJ-911', code: 'PRJ-911', projectNumber: 911, title: 'Tuj', customer: { name: 'Druga' }, status: 'in-progress',
      createdAt: new Date().toISOString(),
    });
    const ownOrder = await WorkOrderModel.create({
      projectId: 'PRJ-910', offerVersionId, items: [], status: 'in-progress', assignedEmployeeIds: [monter.employeeId],
    });
    const foreignOrder = await WorkOrderModel.create({ projectId: 'PRJ-911', offerVersionId, items: [], status: 'in-progress' });

    for (const [method, path] of [
      ['GET', '/api/projects/PRJ-911/logistics'],
      ['GET', '/api/projects/PRJ-911/execution-definition'],
      ['PUT', '/api/projects/PRJ-911/execution-definition'],
      ['GET', '/api/projects/PRJ-911/client-notes'],
      ['GET', `/api/projects/PRJ-911/work-orders/${foreignOrder._id}/pdf`],
      ['POST', `/api/projects/PRJ-911/work-orders/${foreignOrder._id}/start-correction`],
      ['POST', `/api/projects/PRJ-911/work-orders/${foreignOrder._id}/send-confirmation`],
    ]) {
      assert.equal((await call(method, path, monter.cookie, method === 'GET' ? undefined : {})).status, 403, `${method} ${path}`);
    }
    assert.equal((await call('GET', '/api/projects/PRJ-910/logistics', monter.cookie)).status, 200);
    assert.equal((await call('GET', '/api/projects/PRJ-911/logistics', organizer.cookie)).status, 200);

    const signed = (await (await call('POST', '/api/projects/PRJ-910/signature', monter.cookie, {
      signerName: 'Stranka', signature: 'data:image/png;base64,AAAA', workOrderId: String(ownOrder._id),
    })).json()) as any;
    assert.equal(signed.success, true);
    assert.deepEqual(signed.data.invoiceVersions, []);
    assert.equal((await WorkOrderModel.findById(ownOrder._id).lean())?.confirmationState, 'signed_active');
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
