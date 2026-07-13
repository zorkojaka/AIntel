import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeWorkOrderObjectId,
  sendInstallerPreparationEmail,
} from '../modules/communication/services/communication.service';
import { sendInstallerPreparationCommunicationController } from '../modules/communication/controllers/project-communication.controller';

test('normalizeWorkOrderObjectId rejects undefined-like work order ids', () => {
  assert.equal(normalizeWorkOrderObjectId(undefined), null);
  assert.equal(normalizeWorkOrderObjectId(''), null);
  assert.equal(normalizeWorkOrderObjectId('   '), null);
  assert.equal(normalizeWorkOrderObjectId('undefined'), null);
  assert.equal(normalizeWorkOrderObjectId('not-an-object-id'), null);
});

test('normalizeWorkOrderObjectId returns a trimmed ObjectId string', () => {
  assert.equal(
    normalizeWorkOrderObjectId('  507f1f77bcf86cd799439011  '),
    '507f1f77bcf86cd799439011'
  );
});

test('sendInstallerPreparationEmail rejects invalid workOrderId before querying Mongo', async () => {
  await assert.rejects(
    () =>
      sendInstallerPreparationEmail({
        projectId: 'P-1',
        workOrderId: 'undefined',
        previewOnly: true,
      }),
    /Delovni nalog ni pravilno določen\./
  );
});

test('sendInstallerPreparationCommunicationController returns 400 for undefined workOrderId', async () => {
  const result: { message?: string; statusCode?: number } = {};
  const req = {
    params: { projectId: 'P-1', workOrderId: 'undefined' },
    body: {},
  };
  const res = {
    fail(message: string, statusCode: number) {
      result.message = message;
      result.statusCode = statusCode;
      return res;
    },
  };

  await sendInstallerPreparationCommunicationController(req as any, res as any);

  assert.deepEqual(result, {
    message: 'Delovni nalog ni pravilno določen.',
    statusCode: 400,
  });
});
