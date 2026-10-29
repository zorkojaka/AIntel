import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../core/app';
import { ProductModel } from '../modules/cenik/product.model';
import { CrmClientModel } from '../modules/crm/schemas/client';
import { EmployeeModel } from '../modules/employees/schemas/employee';
import { ProjectModel } from '../modules/projects/schemas/project';
import { UserModel } from '../modules/users/schemas/user';
import { authCookieName, signSessionToken } from '../modules/auth/services/auth.service';
import { ROLE_ADMIN, ROLE_EXECUTION, ROLE_ORGANIZER, ROLE_SALES } from '../utils/roles';

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

async function createProject(id: string, num: number, clientId: unknown, address: string) {
  return ProjectModel.create({
    id, code: id, projectNumber: num, title: id, status: 'in-progress', createdAt: new Date().toISOString(),
    customer: { name: 'Ekdis d.o.o.', address }, clientId,
  });
}

test('stranke vidijo le vloge s prodajo, financami ali organizacijo; urejanje ne prepiše tuje stranke', async () => {
  process.env.NODE_ENV = 'test';
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_crm_access' });
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
    const sales = await createUser(ROLE_SALES, 'Prodaja');
    const admin = await createUser(ROLE_ADMIN, 'Admin');

    // Monter (tudi zunanji) ne dobi seznama vseh strank in jih ne more urejati.
    assert.equal((await call('GET', '/api/crm/clients', monter.cookie)).status, 403);
    assert.equal((await call('POST', '/api/crm/clients', monter.cookie, { name: 'X', type: 'individual' })).status, 403);
    assert.equal((await call('GET', '/api/crm/clients', organizer.cookie)).status, 200);
    assert.equal((await call('GET', '/api/crm/clients', sales.cookie)).status, 200);

    // Dve stranki z enakim imenom (na produkciji obstajata taka para).
    const a = await CrmClientModel.create({ name: 'Ekdis d.o.o.', type: 'individual', street: 'Stara 1', tags: ['vip'] });
    const b = await CrmClientModel.create({ name: 'Ekdis d.o.o.', type: 'individual', street: 'Druga 2' });
    await createProject('PRJ-1', 1, a._id, 'Stara 1');
    await createProject('PRJ-2', 2, b._id, 'Druga 2');
    await createProject('PRJ-3', 3, null, 'Stara 1');

    const response = await call('PUT', `/api/crm/clients/${a._id}`, sales.cookie, {
      name: 'Ekdis d.o.o.', type: 'individual', street: 'Nova 3', postalCode: '1000', postalCity: 'Ljubljana',
    });
    assert.equal(response.status, 200);

    const address1 = (await ProjectModel.findOne({ id: 'PRJ-1' }).lean())?.customer.address;
    const address2 = (await ProjectModel.findOne({ id: 'PRJ-2' }).lean())?.customer.address;
    const address3 = (await ProjectModel.findOne({ id: 'PRJ-3' }).lean())?.customer.address;
    assert.equal(address1, 'Nova 3, 1000 Ljubljana', 'projekt stranke A dobi nov naslov');
    assert.equal(address2, 'Druga 2', 'projekt druge stranke z istim imenom ostane nespremenjen');
    assert.equal(address3, 'Nova 3, 1000 Ljubljana', 'star projekt brez povezave se še ujema po imenu');
    assert.deepEqual((await CrmClientModel.findById(a._id).lean())?.tags, ['vip'], 'oznake ostanejo, če jih urejanje ne pošlje');

    // Fiksna cena monterja za storitev ne sme biti negativna.
    const service = await ProductModel.create({ ime: 'Montaža', categorySlugs: ['storitve'], prodajnaCena: 50, isService: true });
    const negative = await call('POST', `/api/employee-profiles/${monter.employeeId}/service-rates`, admin.cookie, {
      rates: [{ serviceProductId: String(service._id), defaultPercent: 40, overridePrice: -5 }],
    });
    assert.equal(negative.status, 400);
    const copied = await call('POST', `/api/employee-profiles/${organizer.employeeId}/service-rates/copy-from/${monter.employeeId}`, admin.cookie);
    assert.equal(copied.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
