import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import express from 'express';
import { responseHelpers } from '../core/response';
import repairRequestRouter from '../modules/repair-requests/repair-request.routes';
import { adminRecipientEmails, validateRepairRequest } from '../modules/repair-requests/repair-request.service';

test('repair requests validate actual image bytes and preserve Slovenian comments', async () => {
  const image = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const input = { comment: ' Popravi prikaz č, š in ž. ', page: 'https://aintel.inteligent.si/projects/123',
    module: 'Izvedba', capturedAt: '2026-10-05T10:00:00Z', screenshot: `data:image/png;base64,${image.toString('base64')}` };
  const result = await validateRepairRequest(input);
  assert.equal(result.comment, 'Popravi prikaz č, š in ž.');
  assert.equal((await sharp(result.attachment).metadata()).format, 'jpeg');
  await assert.rejects(validateRepairRequest({ ...input, comment: ' ' }), /Komentar/);
  await assert.rejects(validateRepairRequest({ ...input, screenshot: 'data:image/jpeg;base64,YWJj' }), /ni veljavna/);
  await assert.rejects(validateRepairRequest({ ...input, page: 'javascript:alert(1)' }), /strani/);
  await assert.rejects(validateRepairRequest({ ...input, screenshot: '' }), /slika zaslona/);
  await assert.rejects(validateRepairRequest({ ...input, screenshot: 'x'.repeat(4 * 1024 * 1024 + 1) }), /prevelika/);
});

test('repair requests go only to effective admins, with duplicates removed', () => {
  const users = [
    { email: 'admin@example.test', roles: ['ADMIN'] },
    { email: 'ADMIN@example.test', roles: ['ADMIN'] },
    { email: 'installer@example.test', roles: ['ADMIN'], employeeId: 'installer' },
    { email: 'linked.admin@example.test', roles: [], employeeId: 'admin' },
    { email: 'inactive@example.test', roles: ['ADMIN'], employeeId: 'inactive' },
  ];
  const employees = [
    { _id: 'installer', roles: ['EXECUTION'], active: true },
    { _id: 'admin', roles: ['ADMIN'], active: true },
    { _id: 'inactive', roles: ['ADMIN'], active: false },
  ];
  assert.deepEqual(adminRecipientEmails(users, employees), ['admin@example.test', 'linked.admin@example.test']);
});

test('repair request route sends the image and authenticated author, and reports mail failures', async (t) => {
  const recipientsService = require('../modules/repair-requests/repair-request.service');
  const senderService = require('../modules/communication/services/communication.service');
  const mailService = require('../modules/communication/services/email-transport.service');
  let mail: any;
  let failMail = false;
  t.mock.method(recipientsService, 'resolveRepairRequestAdmins', async (tenantId: string) => {
    assert.equal(tenantId, 'test-tenant');
    return ['admin@example.test'];
  });
  t.mock.method(senderService, 'getCommunicationSenderSettings', async () => ({ enabled: true, senderEmail: 'aintel@example.test', senderName: 'AIntel' }));
  t.mock.method(mailService, 'sendEmail', async (input: any) => {
    mail = input;
    if (failMail) throw new Error('Simulated SMTP failure');
    return { accepted: ['admin@example.test'] };
  });
  const app = express();
  app.use(express.json(), responseHelpers, (req, _res, next) => {
    (req as any).context = { tenantId: 'test-tenant' };
    (req as any).authUser = { name: 'Monter', email: 'monter@example.test' };
    next();
  });
  app.use('/api/repair-requests', repairRequestRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address() as any;
    const image = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    const input = { comment: 'Popravek č š ž', page: 'https://aintel.inteligent.si/projects/123', module: 'Izvedba',
      capturedAt: '2026-10-05T10:00:00Z', screenshot: `data:image/jpeg;base64,${image.toString('base64')}`,
      to: 'untrusted@example.test', author: 'Untrusted user' };
    const post = (body: unknown) => fetch(`http://127.0.0.1:${address.port}/api/repair-requests`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const response = await post(input);
    assert.equal(response.status, 200);
    assert.deepEqual(mail.to, ['admin@example.test']);
    assert.equal(mail.replyTo, 'monter@example.test');
    assert.match(mail.text, /Monter \(monter@example.test\)/);
    assert.match(mail.text, /Popravek č š ž/);
    assert.equal(mail.attachments[0].contentType, 'image/jpeg');
    assert.ok(mail.attachments[0].content.length > 0);
    assert.equal((await post({ ...input, screenshot: '' })).status, 400);
    failMail = true;
    assert.equal((await post(input)).status, 502);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    t.mock.restoreAll();
  }
});
