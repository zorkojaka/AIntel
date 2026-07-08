import assert from 'node:assert/strict';
import test from 'node:test';

import { applyEmailTrap, getSmtpDiagnostics } from '../modules/communication/services/email-transport.service';

function withTrapEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const previous = {
    AINTEL_EMAIL_TRAP_TO: process.env.AINTEL_EMAIL_TRAP_TO,
    AINTEL_EMAIL_SUBJECT_PREFIX: process.env.AINTEL_EMAIL_SUBJECT_PREFIX,
  };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('AIN-P1-01 email trap leaves messages unchanged when disabled', () => {
  withTrapEnv({ AINTEL_EMAIL_TRAP_TO: undefined, AINTEL_EMAIL_SUBJECT_PREFIX: undefined }, () => {
    const input = {
      to: 'customer@example.test',
      cc: 'copy@example.test',
      subject: 'Ponudba',
      text: 'Pozdravljeni',
    };

    assert.equal(applyEmailTrap(input), input);
    assert.equal(getSmtpDiagnostics().trapActive, false);
  });
});

test('AIN-P1-01 email trap redirects recipients and marks staging email', () => {
  withTrapEnv(
    {
      AINTEL_EMAIL_TRAP_TO: 'trap@example.test',
      AINTEL_EMAIL_SUBJECT_PREFIX: '[AINTEL STAGING]',
    },
    () => {
      const output = applyEmailTrap({
        to: ['customer@example.test', { name: 'Stranka', address: 'stranka@example.test' }],
        cc: 'copy@example.test',
        bcc: 'hidden@example.test',
        subject: 'Ponudba',
        text: 'Pozdravljeni',
      });

      assert.equal(output.to, 'trap@example.test');
      assert.equal(output.cc, undefined);
      assert.equal(output.bcc, undefined);
      assert.equal(output.subject, '[AINTEL STAGING] Ponudba');
      assert.equal((output.headers as Record<string, string>)['X-AIntel-Email-Trap'], 'true');
      assert.match((output.headers as Record<string, string>)['X-AIntel-Original-To'], /customer@example\.test/);
      assert.match((output.headers as Record<string, string>)['X-AIntel-Original-To'], /stranka@example\.test/);
      assert.equal((output.headers as Record<string, string>)['X-AIntel-Original-Cc'], 'copy@example.test');
      assert.equal((output.headers as Record<string, string>)['X-AIntel-Original-Bcc'], 'hidden@example.test');
      assert.equal(getSmtpDiagnostics().trapActive, true);
      assert.equal(getSmtpDiagnostics().configSummary.trapTo, 'trap@example.test');
    },
  );
});
