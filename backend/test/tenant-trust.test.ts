import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveActorId, resolveTenantId } from '../utils/tenant';

test('AIN-P2-09 resolveTenantId ignores spoofable x-tenant-id header', () => {
  const req = {
    headers: { 'x-tenant-id': 'spoofed-tenant' },
    context: { tenantId: 'session-tenant' },
    user: { tenantId: 'user-tenant' },
  } as any;

  assert.equal(resolveTenantId(req), 'session-tenant');
});

test('AIN-P2-09 resolveActorId ignores spoofable x-user-id header', () => {
  const req = {
    headers: { 'x-user-id': 'spoofed-user' },
    context: { actorUserId: 'session-user' },
    user: { id: 'fallback-user' },
  } as any;

  assert.equal(resolveActorId(req), 'session-user');
});

test('AIN-P2-09 tenant fallback remains available for unauthenticated single-tenant flows', () => {
  assert.equal(resolveTenantId({ headers: { 'x-tenant-id': 'spoofed-tenant' } } as any), 'inteligent');
  assert.equal(resolveActorId({ headers: { 'x-user-id': 'spoofed-user' } } as any), null);
});
