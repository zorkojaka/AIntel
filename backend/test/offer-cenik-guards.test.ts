import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../core/app';
import { ProductModel } from '../modules/cenik/product.model';
import { EmployeeModel } from '../modules/employees/schemas/employee';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { ProjectModel } from '../modules/projects/schemas/project';
import { WorkOrderModel } from '../modules/projects/schemas/work-order';
import { UserModel } from '../modules/users/schemas/user';
import { authCookieName, signSessionToken } from '../modules/auth/services/auth.service';
import { ROLE_ADMIN, ROLE_ORGANIZER, ROLE_SALES } from '../utils/roles';

async function createUser(role: string, label: string) {
  const employee = await EmployeeModel.create({
    tenantId: 'inteligent', name: label, roles: [role], active: true, appAccess: true, hourRateWithoutVat: 0,
  });
  const user = await UserModel.create({
    tenantId: 'inteligent', email: `${label.toLowerCase()}@example.test`, name: label,
    roles: [], status: 'ACTIVE', active: true, employeeId: employee._id,
  });
  const token = signSessionToken({ userId: String(user._id), tenantId: 'inteligent' });
  return `${authCookieName}=${token}`;
}

test('cenik in ponudba: marže le admin, nabavna cena enotna, potrjena ponudba zaščitena', async () => {
  process.env.NODE_ENV = 'test';
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_offer_cenik_guards' });
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
    const admin = await createUser(ROLE_ADMIN, 'Admin');
    const sales = await createUser(ROLE_SALES, 'Prodaja');
    const organizer = await createUser(ROLE_ORGANIZER, 'Organizator');

    // Marže kategorij preračunajo prodajne cene, zato jih organizator ne vidi in ne ureja.
    assert.equal((await call('GET', '/api/cenik/category-settings', organizer)).status, 403);
    assert.equal((await call('PUT', '/api/cenik/category-settings/bulk', organizer, { updates: [] })).status, 403);
    assert.equal((await call('GET', '/api/cenik/category-settings', admin)).status, 200);

    // Obrazec pošlje novo nabavnaCena in staro purchasePriceWithoutVat; obe morata postati novi.
    const product = await ProductModel.create({
      ime: 'Kamera', categorySlugs: ['kamere'], nabavnaCena: 70, purchasePriceWithoutVat: 70, prodajnaCena: 120,
    });
    const updated = await call('PUT', `/api/cenik/products/${product._id}`, sales, {
      ime: 'Kamera', categorySlugs: ['kamere'], nabavnaCena: 80, purchasePriceWithoutVat: 70, prodajnaCena: 120,
    });
    assert.equal(updated.status, 200);
    const stored = await ProductModel.findById(product._id).lean();
    assert.equal(stored?.nabavnaCena, 80);
    assert.equal(stored?.purchasePriceWithoutVat, 80);

    await ProjectModel.create({
      id: 'PRJ-950', code: 'PRJ-950', projectNumber: 950, title: 'Test', customer: { name: 'Stranka' }, status: 'offered',
      createdAt: new Date().toISOString(),
    });
    const offerBody = {
      title: 'Kamere',
      items: [{ id: 'i1', name: 'Kamera', quantity: 2, unit: 'kos', unitPrice: 100, vatRate: 22 }],
      useGlobalDiscount: false,
      usePerItemDiscount: false,
      vatMode: 22,
      status: 'accepted',
    };

    // Status ponudbe ne pride iz telesa zahteve: nova ponudba je vedno osnutek.
    const created = (await (await call('POST', '/api/projects/PRJ-950/offers', sales, offerBody)).json()) as any;
    const offerId = String(created.data._id);
    assert.equal(created.data.status, 'draft');

    // Osnutek je mogoče izbrisati, potrjene pa ne.
    const draft = (await (await call('POST', '/api/projects/PRJ-950/offers', sales, offerBody)).json()) as any;
    assert.equal((await call('DELETE', `/api/projects/PRJ-950/offers/${draft.data._id}`, sales)).status, 200);

    // Tudi neodpoklican delovni nalog brani brisanje, če status ponudbe ni »potrjena« (PRJ-088).
    const withWorkOrder = (await (await call('POST', '/api/projects/PRJ-950/offers', sales, offerBody)).json()) as any;
    await WorkOrderModel.create({ projectId: 'PRJ-950', offerVersionId: String(withWorkOrder.data._id), items: [] });
    assert.equal((await call('DELETE', `/api/projects/PRJ-950/offers/${withWorkOrder.data._id}`, sales)).status, 409);

    await OfferVersionModel.updateOne({ _id: offerId }, { $set: { status: 'accepted', acceptedAt: new Date() } });
    await ProjectModel.updateOne({ id: 'PRJ-950' }, { $set: { confirmedOfferVersionId: offerId, quotedTotalWithVat: 244 } });
    assert.equal((await call('DELETE', `/api/projects/PRJ-950/offers/${offerId}`, sales)).status, 409);
    assert.ok(await OfferVersionModel.exists({ _id: offerId }));

    // Popravek potrjene ponudbe uskladi znesek projekta in ne spremeni statusa.
    const edited = await call('PUT', `/api/projects/PRJ-950/offers/${offerId}`, sales, {
      ...offerBody,
      items: [{ id: 'i1', name: 'Kamera', quantity: 3, unit: 'kos', unitPrice: 100, vatRate: 22 }],
      status: 'draft',
    });
    assert.equal(edited.status, 200);
    const offer = await OfferVersionModel.findById(offerId).lean();
    assert.equal(offer?.status, 'accepted');
    assert.equal(offer?.totalWithVat, 366);
    const project = await ProjectModel.findOne({ id: 'PRJ-950' }).lean();
    assert.equal(project?.quotedTotalWithVat, 366);
    assert.equal(project?.offerAmount, 366);

    // Brez nastavitev v telesu seštevki uporabijo shranjene (DDV 9,5 %), ne privzetih 22 %.
    await OfferVersionModel.updateOne({ _id: offerId }, { $set: { vatMode: 9.5 } });
    await call('PUT', `/api/projects/PRJ-950/offers/${offerId}`, sales, {
      title: 'Kamere',
      items: [{ id: 'i1', name: 'Kamera', quantity: 1, unit: 'kos', unitPrice: 100, vatRate: 22 }],
    });
    const lowVat = await OfferVersionModel.findById(offerId).lean();
    assert.equal(lowVat?.vatMode, 9.5);
    assert.equal(lowVat?.totalWithVat, 109.5);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
