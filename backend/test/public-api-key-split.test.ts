import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import publicRoutes from '../modules/web-inquiries/public.routes';
import { CrmClientModel } from '../modules/crm/schemas/client';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { ProjectModel } from '../modules/projects/schemas/project';

const WEB_KEY = 'browser-key-for-tests';
const INTERNAL_KEY = 'internal-key-for-tests';

function createPublicServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/public', publicRoutes);
  return http.createServer(app);
}

async function listen(server: http.Server) {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.notEqual(address, null);
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

async function close(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('AIN-P0-01 /clients/equipment rejects the browser key and accepts only the internal key', async () => {
  const previousWebKey = process.env.AINTEL_WEB_INQUIRY_API_KEY;
  const previousInternalKey = process.env.AINTEL_INTERNAL_API_KEY;
  process.env.AINTEL_WEB_INQUIRY_API_KEY = WEB_KEY;
  process.env.AINTEL_INTERNAL_API_KEY = INTERNAL_KEY;

  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_public_key_split' });
  const server = createPublicServer();

  try {
    const client = await CrmClientModel.create({
      name: 'Portal Client d.o.o.',
      type: 'company',
      email: 'portal-client@example.test',
      tags: [],
      isActive: true,
    });
    const offer = await OfferVersionModel.create({
      projectId: 'PRJ-P0-01',
      baseTitle: 'Portal equipment',
      versionNumber: 1,
      title: 'Portal equipment',
      status: 'confirmed',
      items: [
        {
          id: 'item-camera',
          productId: 'camera',
          name: 'Kamera',
          quantity: 2,
          unit: 'kos',
          unitPrice: 100,
          vatRate: 22,
          totalNet: 200,
          totalVat: 44,
          totalGross: 244,
        },
        {
          id: 'item-service',
          productId: 'install',
          name: 'Montaža',
          quantity: 1,
          unit: 'storitev',
          unitPrice: 50,
          vatRate: 22,
          totalNet: 50,
          totalVat: 11,
          totalGross: 61,
        },
      ],
    });
    await ProjectModel.create({
      id: 'PRJ-P0-01',
      code: 'PRJ-P0-01',
      projectNumber: 1,
      clientId: client._id,
      title: 'Portal equipment project',
      customer: { name: client.name },
      status: 'ordered',
      createdAt: '2026-07-07',
      confirmedOfferVersionId: String(offer._id),
      categories: ['videonadzor'],
    });

    const baseUrl = await listen(server);
    const path = '/api/public/clients/equipment?email=portal-client@example.test';

    const browserResponse = await fetch(`${baseUrl}${path}`, { headers: { 'X-API-Key': WEB_KEY } });
    assert.equal(browserResponse.status, 401);

    const internalResponse = await fetch(`${baseUrl}${path}`, { headers: { 'X-API-Key': INTERNAL_KEY } });
    assert.equal(internalResponse.status, 200);
    const payload = await internalResponse.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.projects.length, 1);
    assert.equal(payload.projects[0].projectId, 'PRJ-P0-01');
    assert.deepEqual(payload.projects[0].items, [{ name: 'Kamera', quantity: 2 }]);
  } finally {
    await close(server);
    await mongoose.disconnect();
    await mongo.stop();
    if (previousWebKey === undefined) {
      delete process.env.AINTEL_WEB_INQUIRY_API_KEY;
    } else {
      process.env.AINTEL_WEB_INQUIRY_API_KEY = previousWebKey;
    }
    if (previousInternalKey === undefined) {
      delete process.env.AINTEL_INTERNAL_API_KEY;
    } else {
      process.env.AINTEL_INTERNAL_API_KEY = previousInternalKey;
    }
  }
});

test('AIN-P0-01 browser public routes still use the browser key', async () => {
  const previousWebKey = process.env.AINTEL_WEB_INQUIRY_API_KEY;
  const previousInternalKey = process.env.AINTEL_INTERNAL_API_KEY;
  process.env.AINTEL_WEB_INQUIRY_API_KEY = WEB_KEY;
  process.env.AINTEL_INTERNAL_API_KEY = INTERNAL_KEY;

  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_public_browser_key' });
  const server = createPublicServer();

  try {
    const baseUrl = await listen(server);

    const internalResponse = await fetch(`${baseUrl}/api/public/options`, { headers: { 'X-API-Key': INTERNAL_KEY } });
    assert.equal(internalResponse.status, 401);

    const browserResponse = await fetch(`${baseUrl}/api/public/options`, { headers: { 'X-API-Key': WEB_KEY } });
    assert.equal(browserResponse.status, 200);
    const payload = await browserResponse.json();
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.enabled, 'boolean');
  } finally {
    await close(server);
    await mongoose.disconnect();
    await mongo.stop();
    if (previousWebKey === undefined) {
      delete process.env.AINTEL_WEB_INQUIRY_API_KEY;
    } else {
      process.env.AINTEL_WEB_INQUIRY_API_KEY = previousWebKey;
    }
    if (previousInternalKey === undefined) {
      delete process.env.AINTEL_INTERNAL_API_KEY;
    } else {
      process.env.AINTEL_INTERNAL_API_KEY = previousInternalKey;
    }
  }
});
