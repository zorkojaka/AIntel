import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../core/app';
import { EmployeeModel } from '../modules/employees/schemas/employee';
import { FinanceSnapshotModel } from '../modules/finance/schemas/finance-snapshot';
import { UserModel } from '../modules/users/schemas/user';
import { authCookieName, signSessionToken } from '../modules/auth/services/auth.service';
import { ROLE_ADMIN, ROLE_EXECUTION, ROLE_FINANCE } from '../utils/roles';

type TestUser = {
  userId: string;
  employeeId: string;
  cookie: string;
};

function listen(app: ReturnType<typeof createApp>) {
  return new Promise<http.Server>((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function baseUrl(server: http.Server) {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function requestJson<T>(server: http.Server, path: string, cookie: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl(server)}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Cookie: cookie,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json()) as T;
  return { response, payload };
}

async function createUser(role: string, label: string): Promise<TestUser> {
  const employee = await EmployeeModel.create({
    tenantId: 'inteligent',
    name: label,
    roles: [role],
    active: true,
    appAccess: true,
    hourRateWithoutVat: 0,
  });
  const user = await UserModel.create({
    tenantId: 'inteligent',
    email: `${label.toLowerCase().replace(/\s+/g, '.')}@example.test`,
    name: label,
    roles: [],
    status: 'ACTIVE',
    active: true,
    employeeId: employee._id,
  });
  const token = signSessionToken({ userId: String(user._id), tenantId: 'inteligent' });
  return {
    userId: String(user._id),
    employeeId: String(employee._id),
    cookie: `${authCookieName}=${token}`,
  };
}

async function seedSnapshot(employeeA: TestUser, employeeB: TestUser) {
  return FinanceSnapshotModel.create({
    projectId: 'PRJ-AUTH',
    invoiceVersionId: 'invoice-auth-1',
    invoiceNumber: 'RA-001',
    issuedAt: new Date('2026-07-01T00:00:00.000Z'),
    customer: { name: 'Auth Test', taxId: '', address: '' },
    items: [
      {
        productId: 'service-1',
        name: 'Montaža',
        unit: 'kos',
        quantity: 1,
        unitPriceSale: 100,
        unitPricePurchase: 40,
        vatPercent: 22,
        totalSale: 100,
        totalPurchase: 40,
        margin: 60,
        isService: true,
        categorySlugs: [],
        type: 'Osnovno',
      },
    ],
    summary: {
      totalSaleWithoutVat: 100,
      totalPurchase: 40,
      totalMargin: 60,
      totalVat: 22,
      totalSaleWithVat: 122,
    },
    assignedEmployeeIds: [employeeA.employeeId, employeeB.employeeId],
    employeeEarnings: [
      { employeeId: employeeA.employeeId, earnings: 30, isPaid: false, paidAt: null, paidBy: null },
      { employeeId: employeeB.employeeId, earnings: 10, isPaid: false, paidAt: null, paidBy: null },
    ],
    offerVersionId: 'offer-auth-1',
    salesUserId: null,
    snapshotVersion: 1,
    correctedFromSnapshotId: null,
    superseded: false,
  });
}

test('AIN-P0-02 finance and settings authorization gates sensitive routes', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_auth' });
  const server = await listen(createApp());

  try {
    const executionUser = await createUser(ROLE_EXECUTION, 'Execution User');
    const financeUser = await createUser(ROLE_FINANCE, 'Finance User');
    const adminUser = await createUser(ROLE_ADMIN, 'Admin User');
    const snapshot = await seedSnapshot(executionUser, financeUser);

    const executionInvoices = await requestJson<any>(server, '/api/finance/invoices', executionUser.cookie);
    assert.equal(executionInvoices.response.status, 403);

    const executionEmployees = await requestJson<any>(server, '/api/finance/employees-summary', executionUser.cookie);
    assert.equal(executionEmployees.response.status, 403);

    const ownEarnings = await requestJson<any>(server, '/api/finance/my/earnings', executionUser.cookie);
    assert.equal(ownEarnings.response.status, 200);
    assert.equal(ownEarnings.payload.success, true);
    assert.equal(ownEarnings.payload.data.items.length, 1);
    assert.deepEqual(
      ownEarnings.payload.data.items[0].employeeEarnings.map((entry: any) => entry.employeeId),
      [executionUser.employeeId],
    );
    assert.equal(ownEarnings.payload.data.items[0].summary.totalSaleWithVat, 0);
    assert.equal(ownEarnings.payload.data.items[0].items.length, 0);

    const ownDetail = await requestJson<any>(
      server,
      `/api/finance/employees/${executionUser.employeeId}/snapshots/${String(snapshot._id)}/earnings`,
      executionUser.cookie,
    );
    assert.equal(ownDetail.response.status, 200);
    assert.equal(ownDetail.payload.data.totalEarnings, 30);

    const otherDetail = await requestJson<any>(
      server,
      `/api/finance/employees/${financeUser.employeeId}/snapshots/${String(snapshot._id)}/earnings`,
      executionUser.cookie,
    );
    assert.equal(otherDetail.response.status, 403);

    const executionPayment = await requestJson<any>(
      server,
      `/api/finance/employees/${executionUser.employeeId}/snapshots/${String(snapshot._id)}/payment`,
      executionUser.cookie,
      { method: 'PATCH', body: JSON.stringify({ isPaid: true }) },
    );
    assert.equal(executionPayment.response.status, 403);

    const settingsWrites = await Promise.all([
      requestJson<any>(server, '/api/settings', executionUser.cookie, { method: 'PUT', body: JSON.stringify({ companyName: 'X', address: 'Y' }) }),
      requestJson<any>(server, '/api/settings/company', executionUser.cookie, { method: 'PUT', body: JSON.stringify({ companyName: 'X', address: 'Y' }) }),
      requestJson<any>(server, '/api/settings/pdf-documents?docType=OFFER', executionUser.cookie, { method: 'PUT', body: JSON.stringify({}) }),
      requestJson<any>(server, '/api/settings/communication', executionUser.cookie, { method: 'PUT', body: JSON.stringify({}) }),
    ]);
    settingsWrites.forEach(({ response }) => assert.equal(response.status, 403));

    const financeInvoices = await requestJson<any>(server, '/api/finance/invoices', financeUser.cookie);
    assert.equal(financeInvoices.response.status, 200);

    const financeEmployees = await requestJson<any>(server, '/api/finance/employees-summary', financeUser.cookie);
    assert.equal(financeEmployees.response.status, 200);
    assert.equal(financeEmployees.payload.data.length, 2);

    const financePayment = await requestJson<any>(
      server,
      `/api/finance/employees/${executionUser.employeeId}/snapshots/${String(snapshot._id)}/payment`,
      financeUser.cookie,
      { method: 'PATCH', body: JSON.stringify({ isPaid: true }) },
    );
    assert.equal(financePayment.response.status, 200);
    assert.equal(financePayment.payload.data.isPaid, true);
    assert.equal(financePayment.payload.data.paidBy, financeUser.userId);

    const adminSettings = await requestJson<any>(server, '/api/settings', adminUser.cookie, {
      method: 'PUT',
      body: JSON.stringify({ companyName: 'AIntel Test', address: 'Testna 1' }),
    });
    assert.equal(adminSettings.response.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await mongoose.disconnect();
    await mongo.stop();
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
