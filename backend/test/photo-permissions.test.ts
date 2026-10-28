import assert from 'node:assert/strict';
import test from 'node:test';

import { canDeletePhoto } from '../modules/photos/services/permissions.service';

const photo = { projectId: 'p1', uploadedBy: 'someone-else' } as any;

test('project managers can delete any project photo', () => {
  for (const role of ['ADMIN', 'SALES', 'ORGANIZER', 'FINANCE']) {
    assert.equal(canDeletePhoto(photo, { roles: [role], employeeId: 'e1' }), true, role);
  }
});

test('execution staff need to be the uploader or assigned to the project', () => {
  assert.equal(canDeletePhoto(photo, { roles: ['EXECUTION'], employeeId: 'e1' }), false);
  assert.equal(canDeletePhoto(photo, { roles: ['EXECUTION'], employeeId: 'e1', assignedExecutionProjectIds: ['p1'] }), true);
  assert.equal(canDeletePhoto({ ...photo, uploadedBy: 'e1' }, { roles: ['EXECUTION'], employeeId: 'e1' }), true);
});
