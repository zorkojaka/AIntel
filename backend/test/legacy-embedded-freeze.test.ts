import assert from 'node:assert/strict';
import test from 'node:test';

import { receiveDelivery } from '../modules/projects/controllers/project.controller';

test('AIN-P2-01 legacy embedded delivery write is frozen before DB access', async () => {
  const events: any[] = [];
  const req = {
    params: { id: 'PRJ-LEGACY', deliveryId: 'DN-1' },
    originalUrl: '/api/projects/PRJ-LEGACY/deliveries/DN-1/receive',
    log: {
      warn: (event: any, message: string) => events.push({ ...event, message }),
    },
  } as any;
  const res = {
    statusCode: 200,
    body: null as any,
    fail(message: string, statusCode = 400) {
      this.statusCode = statusCode;
      this.body = { success: false, error: message };
      return this;
    },
  } as any;

  await receiveDelivery(req, res);

  assert.equal(res.statusCode, 410);
  assert.match(res.body.error, /Legacy embedded project write is disabled/);
  assert.equal(events.length, 1);
  assert.equal(events[0].scope, 'legacy.project_embedded_write');
  assert.equal(events[0].operation, 'receiveDelivery');
  assert.equal(events[0].projectId, 'PRJ-LEGACY');
  assert.equal(events[0].deliveryId, 'DN-1');
});
