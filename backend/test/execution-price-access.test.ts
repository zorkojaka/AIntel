import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../core/app';
import { ProductModel } from '../modules/cenik/product.model';
import { EmployeeModel } from '../modules/employees/schemas/employee';
import { ProjectModel } from '../modules/projects/schemas/project';
import { UserModel } from '../modules/users/schemas/user';
import { authCookieName, signSessionToken } from '../modules/auth/services/auth.service';
import { ROLE_EXECUTION, ROLE_FINANCE } from '../utils/roles';

async function createUser(role: string, label: string) {
  const employee = await EmployeeModel.create({
    tenantId: 'inteligent', name: label, roles: [role], active: true, appAccess: true, hourRateWithoutVat: 0,
  });
  const user = await UserModel.create({
    tenantId: 'inteligent', email: `${label.toLowerCase().replace(/\s+/g, '.')}@example.test`, name: label,
    roles: [], status: 'ACTIVE', active: true, employeeId: employee._id,
  });
  const token = signSessionToken({ userId: String(user._id), tenantId: 'inteligent' });
  return { employeeId: String(employee._id), cookie: `${authCookieName}=${token}` };
}

test('monter ne vidi cen: računi, ponudbe in cene v ceniku so zaprti', async () => {
  process.env.NODE_ENV = 'test';
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_execution_prices' });
  const server = await new Promise<http.Server>((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const get = (path: string, cookie: string) =>
    fetch(`http://127.0.0.1:${address.port}${path}`, { headers: { Accept: 'application/json', Cookie: cookie } });

  try {
    const monter = await createUser(ROLE_EXECUTION, 'Monter');
    const finance = await createUser(ROLE_FINANCE, 'Finance');
    await ProductModel.create({ ime: 'Kamera test', categorySlugs: ['kamere'], prodajnaCena: 120, nabavnaCena: 70, isService: false });
    const versionId = new mongoose.Types.ObjectId().toString();
    await ProjectModel.create({
      id: 'PRJ-900', code: 'PRJ-900', projectNumber: 900, title: 'Test', customer: { name: 'Stranka' }, status: 'invoiced',
      createdAt: new Date().toISOString(), assignedEmployeeIds: [monter.employeeId],
      invoiceVersions: [{
        _id: versionId, versionNumber: 1, invoiceNumber: '1-10-2026', status: 'issued', issuedAt: new Date().toISOString(), items: [],
        summary: { baseWithoutVat: 100, discountedBase: 100, vatAmount: 22, totalWithVat: 122 },
      }],
    });

    for (const path of [
      '/api/projects/PRJ-900/invoices',
      `/api/projects/PRJ-900/invoices/${versionId}/pdf`,
      '/api/projects/PRJ-900/offers',
      '/api/projects/PRJ-900/offer',
      '/api/projects/offer-templates',
      '/api/offers/abc/pdf-preview',
    ]) {
      assert.equal((await get(path, monter.cookie)).status, 403, path);
    }
    assert.equal((await get('/api/projects/PRJ-900/invoices', finance.cookie)).status, 200);

    const project = (await (await get('/api/projects/PRJ-900', monter.cookie)).json()) as any;
    assert.equal(project.success, true);
    assert.deepEqual(project.data.invoiceVersions, []);

    const products = (await (await get('/api/cenik/products', monter.cookie)).json()) as any;
    assert.equal(products.data[0].ime, 'Kamera test');
    assert.equal(products.data[0].prodajnaCena, 0);
    assert.equal(products.data[0].nabavnaCena, 0);
    const search = (await (await get('/api/price-list/items/search?q=kamera', monter.cookie)).json()) as any;
    assert.equal(search.data[0].unitPrice, 0);
    const financeProducts = (await (await get('/api/cenik/products', finance.cookie)).json()) as any;
    assert.equal(financeProducts.data[0].prodajnaCena, 120);
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
