import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAuditMutationEvent } from '../core/middleware/auditLog';

function req(overrides: Record<string, unknown> = {}) {
  return {
    method: 'PATCH',
    originalUrl: '/api/projects/PRJ-001/offers/abc?verbose=1',
    url: '/projects/PRJ-001/offers/abc',
    body: { title: 'Novo', password: 'hidden', smtpToken: 'hidden', status: 'draft' },
    headers: { 'x-request-id': 'req-1' },
    id: 'req-1',
    context: {
      tenantId: 'inteligent',
      actorUserId: 'user-1',
      actorEmployeeId: 'emp-1',
      roles: ['ADMIN'],
    },
    ...overrides,
  } as any;
}

function res(statusCode = 200) {
  return { statusCode } as any;
}

test('AIN-P2-07 audit mutation event captures who, route, entity and changed fields without sensitive values', () => {
  const event = buildAuditMutationEvent(req(), res(200));

  assert.equal(event.scope, 'audit.mutation');
  assert.equal(event.tenantId, 'inteligent');
  assert.equal(event.actorUserId, 'user-1');
  assert.equal(event.method, 'PATCH');
  assert.equal(event.route, '/api/projects/PRJ-001/offers/abc');
  assert.deepEqual(event.entity, { module: 'projects', entityId: 'PRJ-001' });
  assert.deepEqual(event.changedFields, ['status', 'title']);
  assert.equal(JSON.stringify(event).includes('hidden'), false);
});

test('AIN-P2-07 audit mutation event omits body fields for DELETE', () => {
  const event = buildAuditMutationEvent(req({ method: 'DELETE', body: { reason: 'x' } }), res(204));

  assert.equal(event.method, 'DELETE');
  assert.deepEqual(event.changedFields, []);
});
