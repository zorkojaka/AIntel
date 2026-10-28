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
import { EmployeeServiceRateModel } from '../modules/employee-profiles/schemas/employee-service-rate';
import { ROLE_EXECUTION, ROLE_FINANCE, ROLE_ORGANIZER } from '../utils/roles';

async function createUser(role: string | string[], label: string) {
  const employee = await EmployeeModel.create({
    tenantId: 'inteligent', name: label, roles: Array.isArray(role) ? role : [role], active: true, appAccess: true, hourRateWithoutVat: 0,
  });
  const user = await UserModel.create({
    tenantId: 'inteligent', email: `${label.toLowerCase().replace(/\s+/g, '.')}@example.test`, name: label,
    roles: [], status: 'ACTIVE', active: true, employeeId: employee._id,
  });
  const token = signSessionToken({ userId: String(user._id), tenantId: 'inteligent' });
  return { employeeId: String(employee._id), cookie: `${authCookieName}=${token}` };
}

test('monter in organizator ne vidita cen; monter še vidi svoj zaslužek', async () => {
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
    const organizer = await createUser(ROLE_ORGANIZER, 'Organizator');
    const organizerMonter = await createUser([ROLE_EXECUTION, ROLE_ORGANIZER], 'Organizator Monter');
    const finance = await createUser(ROLE_FINANCE, 'Finance');
    await ProductModel.create({ ime: 'Kamera test', categorySlugs: ['kamere'], prodajnaCena: 120, nabavnaCena: 70, isService: false });
    const service = await ProductModel.create({ ime: 'Montaža kamere', categorySlugs: ['storitve'], prodajnaCena: 50, isService: true });
    await EmployeeServiceRateModel.create({ employeeId: monter.employeeId, serviceProductId: service._id, defaultPercent: 40, isActive: true });
    const versionId = new mongoose.Types.ObjectId().toString();
    await ProjectModel.create({
      id: 'PRJ-900', code: 'PRJ-900', projectNumber: 900, title: 'Test', customer: { name: 'Stranka' }, status: 'invoiced',
      createdAt: new Date().toISOString(), assignedEmployeeIds: [monter.employeeId],
      invoiceVersions: [{
        _id: versionId, versionNumber: 1, invoiceNumber: '1-10-2026', status: 'issued', issuedAt: new Date().toISOString(), items: [],
        summary: { baseWithoutVat: 100, discountedBase: 100, vatAmount: 22, totalWithVat: 122 },
      }],
    });

    await ProjectModel.create({
      id: 'PRJ-901', code: 'PRJ-901', projectNumber: 901, title: 'Nedodeljen', customer: { name: 'Druga' }, status: 'in-progress',
      createdAt: new Date().toISOString(), invoiceVersions: [],
    });

    // Monter vidi le dodeljene projekte, organizator (tudi če je monter) vse; cen ne vidi nobeden od njiju.
    const ids = async (cookie: string) => ((await (await get('/api/projects', cookie)).json()) as any).data.map((p: any) => p.id).sort();
    assert.deepEqual(await ids(monter.cookie), ['PRJ-900']);
    assert.deepEqual(await ids(organizerMonter.cookie), ['PRJ-900', 'PRJ-901']);
    assert.equal((await get('/api/projects/PRJ-901', monter.cookie)).status, 403);
    const orgMonterProject = (await (await get('/api/projects/PRJ-900', organizerMonter.cookie)).json()) as any;
    assert.deepEqual(orgMonterProject.data.invoiceVersions, []);
    assert.equal((await get('/api/projects/PRJ-900/invoices', organizerMonter.cookie)).status, 403);

    for (const path of [
      '/api/projects/PRJ-900/invoices',
      `/api/projects/PRJ-900/invoices/${versionId}/pdf`,
      '/api/projects/PRJ-900/offers',
      '/api/projects/PRJ-900/offer',
      '/api/projects/offer-templates',
      '/api/offers/abc/pdf-preview',
      '/api/projects/PRJ-900/communication/feed',
      '/api/projects/PRJ-900/offers/abc/messages',
      `/api/projects/PRJ-900/messages/${new mongoose.Types.ObjectId()}`,
      '/api/projects/PRJ-900/review-link',
    ]) {
      assert.equal((await get(path, monter.cookie)).status, 403, path);
      assert.equal((await get(path, organizer.cookie)).status, 403, `organizator ${path}`);
    }
    assert.equal((await get('/api/projects/PRJ-900/invoices', finance.cookie)).status, 200);
    assert.equal((await get('/api/projects/PRJ-900/communication/feed', finance.cookie)).status, 200);

    const project = (await (await get('/api/projects/PRJ-900', monter.cookie)).json()) as any;
    assert.equal(project.success, true);
    assert.deepEqual(project.data.invoiceVersions, []);

    const organizerProject = (await (await get('/api/projects/PRJ-900', organizer.cookie)).json()) as any;
    assert.deepEqual(organizerProject.data.invoiceVersions, []);
    const organizerList = (await (await get('/api/projects', organizer.cookie)).json()) as any;
    assert.equal(organizerList.data[0].invoiceAmount, 0);

    for (const user of [monter, organizer]) {
      const products = (await (await get('/api/cenik/products', user.cookie)).json()) as any;
      const camera = products.data.find((product: any) => product.ime === 'Kamera test');
      assert.equal(camera.prodajnaCena, 0);
      assert.equal(camera.nabavnaCena, 0);
    }

    // Monterjeva cena do nas ostane: 40 % od 50 € = 20 €, naše prodajne cene pa ne dobi.
    const rates = (await (await get('/api/profile/my-service-rates', monter.cookie)).json()) as any;
    assert.equal(rates.data[0].employeeEarnsAmount, 20);
    assert.equal(rates.data[0].servicePrice, undefined);
    assert.equal((await get('/api/profile/my-project-earnings', monter.cookie)).status, 200);
    assert.equal((await get('/api/finance/my/earnings', monter.cookie)).status, 200);
    const search = (await (await get('/api/price-list/items/search?q=kamera%20test', monter.cookie)).json()) as any;
    assert.equal(search.data[0].unitPrice, 0);
    const financeProducts = (await (await get('/api/cenik/products', finance.cookie)).json()) as any;
    assert.equal(financeProducts.data.find((product: any) => product.ime === 'Kamera test').prodajnaCena, 120);
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
