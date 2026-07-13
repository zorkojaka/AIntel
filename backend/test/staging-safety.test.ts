import assert from 'node:assert/strict';
import test from 'node:test';

import { assertStagingDatabaseIsolation, getMongoDbName, isStagingRuntime } from '../db/mongo';
import { applyEmailTrap } from '../modules/communication/services/email-transport.service';

const ENV_KEYS = [
  'AINTEL_ENV',
  'AINTEL_DEPLOY_ENV',
  'APP_ENV',
  'MONGO_DB',
  'AINTEL_EMAIL_TRAP_TO',
  'AINTEL_EMAIL_SUBJECT_PREFIX',
] as const;

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test('AIN-P1-01 staging runtime refuses the production Mongo database name', () => {
  const previous = snapshotEnv();
  try {
    process.env.AINTEL_ENV = 'staging';
    process.env.MONGO_DB = 'inteligent';

    assert.equal(isStagingRuntime(), true);
    assert.throws(() => assertStagingDatabaseIsolation(), /must not use production Mongo database/);

    process.env.MONGO_DB = 'inteligent_staging';
    assert.doesNotThrow(() => assertStagingDatabaseIsolation());
    assert.equal(getMongoDbName(), 'inteligent_staging');
  } finally {
    restoreEnv(previous);
  }
});

test('AIN-P1-01 email trap redirects recipients and marks staging subjects', () => {
  const previous = snapshotEnv();
  try {
    process.env.AINTEL_EMAIL_TRAP_TO = 'trap@example.test';
    process.env.AINTEL_EMAIL_SUBJECT_PREFIX = '[STAGING]';

    const prepared = applyEmailTrap({
      to: 'customer@example.test',
      cc: 'copy@example.test',
      bcc: 'hidden@example.test',
      subject: 'Ponudba',
      text: 'Pozdravljeni',
      html: '<p>Pozdravljeni</p>',
    });

    assert.equal(prepared.to, 'trap@example.test');
    assert.equal(prepared.cc, undefined);
    assert.equal(prepared.bcc, undefined);
    assert.equal(prepared.subject, '[STAGING] Ponudba');
    const headers = prepared.headers as Record<string, string>;
    assert.equal(headers['X-AIntel-Email-Trap'], 'true');
    assert.match(headers['X-AIntel-Original-To'], /customer@example\.test/);
    assert.match(headers['X-AIntel-Original-Bcc'], /hidden@example\.test/);
  } finally {
    restoreEnv(previous);
  }
});
