import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertApplyAllowed,
  declaredIndexSpecs,
  parseEnsureIndexesArgs,
} from '../scripts/ensure-indexes';

test('AIN-P1-05 ensure-indexes apply mode requires explicit write confirmations', () => {
  const dryRun = parseEnsureIndexesArgs([]);
  assert.equal(dryRun.apply, false);
  assert.doesNotThrow(() => assertApplyAllowed(dryRun, 'inteligent'));

  const applyWithoutConfirmation = parseEnsureIndexesArgs(['--apply']);
  assert.throws(
    () => assertApplyAllowed(applyWithoutConfirmation, 'aintel_staging'),
    /--i-understand-this-writes-indexes/,
  );

  const applySharedDbWithoutOverride = parseEnsureIndexesArgs(['--apply', '--i-understand-this-writes-indexes']);
  assert.throws(
    () => assertApplyAllowed(applySharedDbWithoutOverride, 'inteligent'),
    /--allow-shared-db/,
  );

  const confirmedApply = parseEnsureIndexesArgs([
    '--apply',
    '--i-understand-this-writes-indexes',
    '--allow-shared-db',
  ]);
  assert.doesNotThrow(() => assertApplyAllowed(confirmedApply, 'inteligent'));
});

test('AIN-P1-05 declares hot-path indexes used by project logistics and communication flows', () => {
  const specs = declaredIndexSpecs();
  const byCollectionAndName = new Set(specs.map((spec) => `${spec.collection}.${spec.name}`));

  assert.ok(byCollectionAndName.has('projects.status_1'));
  assert.ok(byCollectionAndName.has('workorders.projectId_1_offerVersionId_1'));
  assert.ok(byCollectionAndName.has('workorders.assignedEmployeeIds_1_projectId_1'));
  assert.ok(byCollectionAndName.has('materialorders.projectId_1_offerVersionId_1'));
  assert.ok(byCollectionAndName.has('materialorders.expectedAt_1_materialStatus_1'));
  assert.ok(byCollectionAndName.has('communication_messages.projectId_1_createdAt_-1'));
  assert.ok(byCollectionAndName.has('scheduler_locks.leaseUntil_1'));
  assert.ok(byCollectionAndName.has('scheduler_runs.key_1_startedAt_-1'));
});
