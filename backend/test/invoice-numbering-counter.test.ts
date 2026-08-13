import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  generateInvoiceSequentialNumber,
  getInvoiceSequentialCounterState,
  setInvoiceSequentialCounter,
} from '../modules/projects/services/document-numbering.service';

test('invoice counter can be viewed, changed manually and continues with +1', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'invoice_counter_test' });
  const date = new Date('2026-08-13T10:00:00.000Z');

  try {
    const initial = await getInvoiceSequentialCounterState(date);
    assert.equal(initial.currentSequence, 0);
    assert.equal(initial.nextNumber, '1/8/2026');

    const changed = await setInvoiceSequentialCounter(47, date);
    assert.equal(changed.currentSequence, 47);
    assert.equal(changed.nextNumber, '48/8/2026');

    const issued = await generateInvoiceSequentialNumber(date);
    assert.equal(issued.number, '48/8/2026');

    const afterIssue = await getInvoiceSequentialCounterState(date);
    assert.equal(afterIssue.currentSequence, 48);
    assert.equal(afterIssue.nextNumber, '49/8/2026');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
