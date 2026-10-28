import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { CommunicationSenderSettingsModel } from '../modules/communication/schemas/sender-settings';
import { sendInvoiceCommunicationEmail } from '../modules/communication/services/communication.service';
import { ProjectModel } from '../modules/projects/schemas/project';

test('stranki se pošlje le izdan račun, ki ni interni obračun', async () => {
  process.env.NODE_ENV = 'test';
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_invoice_send_guard' });
  try {
    await CommunicationSenderSettingsModel.create({ senderName: 'Inteligent', senderEmail: 'info@example.test', enabled: true });
    const summary = { baseWithoutVat: 100, discountedBase: 100, vatAmount: 22, totalWithVat: 122 };
    const version = (id: string, status: string, internal = false) => ({
      _id: id, versionNumber: 1, invoiceNumber: `${id}-10-2026`, status, internal, items: [], summary,
    });
    await ProjectModel.create({
      id: 'PRJ-950', code: 'PRJ-950', projectNumber: 950, title: 'Test', customer: { name: 'Stranka' }, status: 'invoiced',
      createdAt: new Date().toISOString(),
      invoiceVersions: [version('1', 'cancelled'), version('2', 'draft'), version('3', 'issued', true)],
    });
    // Odloženo pošiljanje lahko steče, ko je račun že preklican ali popravljen.
    for (const invoiceVersionId of ['1', '2', '3']) {
      await assert.rejects(
        sendInvoiceCommunicationEmail({ projectId: 'PRJ-950', invoiceVersionId, to: ['stranka@example.test'] }),
        /le izdan račun/,
        invoiceVersionId,
      );
    }
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
