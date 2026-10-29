import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import publicRoutes from '../modules/web-inquiries/public.routes';

test('slike k neobstoječemu povpraševanju se ne zapišejo na disk', async () => {
  const previousKey = process.env.AINTEL_WEB_INQUIRY_API_KEY;
  process.env.AINTEL_WEB_INQUIRY_API_KEY = 'widget-key';
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_photo_guard' });
  const app = express();
  app.use('/api/public', publicRoutes);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const id = String(new mongoose.Types.ObjectId());
    const form = new FormData();
    form.append('photos', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'a.png');
    const response = await fetch(`${baseUrl}/api/public/inquiries/${id}/photos`, {
      method: 'POST', headers: { 'X-API-Key': 'widget-key' }, body: form,
    });
    assert.equal(response.status, 404);
    assert.equal(fs.existsSync(`/var/www/aintel/uploads/web-inquiries/${id}`), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
    if (previousKey === undefined) delete process.env.AINTEL_WEB_INQUIRY_API_KEY;
    else process.env.AINTEL_WEB_INQUIRY_API_KEY = previousKey;
  }
});
