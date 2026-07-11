import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ServiceTicketModel } from '../modules/service/service-ticket.model';
import {
  createServiceTicket,
  listServiceTickets,
  getServiceTicket,
  updateServiceTicket,
  ServiceTicketError,
  type ActorContext,
} from '../modules/service/service-ticket.service';

const admin: ActorContext = {
  tenantId: 'inteligent',
  actorUserId: String(new mongoose.Types.ObjectId()),
  actorEmployeeId: String(new mongoose.Types.ObjectId()),
  roles: ['ADMIN'],
};

test('AIN-P2-08 service tickets', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'service-ticket-test' });
  await ServiceTicketModel.syncIndexes();

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  await t.test('create requires subject and defaults to reported', async () => {
    await assert.rejects(createServiceTicket(admin, { subject: '' }), ServiceTicketError);
    const ticket = await createServiceTicket(admin, {
      subject: 'Kamera ne snema',
      description: 'Vhodna kamera offline.',
      source: 'phone',
      priority: 'high',
      contact: { name: 'Janez', phone: '040111222' },
    });
    assert.equal(ticket.status, 'reported');
    assert.equal(ticket.source, 'phone');
    assert.equal(ticket.priority, 'high');
    assert.equal(ticket.history.at(-1)?.action, 'created');
  });

  await t.test('invalid source and priority are rejected', async () => {
    await assert.rejects(createServiceTicket(admin, { subject: 'x', source: 'raven' }), ServiceTicketError);
    await assert.rejects(createServiceTicket(admin, { subject: 'x', priority: 'critical' }), ServiceTicketError);
  });

  await t.test('lifecycle reported → scheduled → resolved sets timestamps', async () => {
    const ticket = await createServiceTicket(admin, { subject: 'Servis alarma' });
    const scheduled = await updateServiceTicket(admin, ticket.id, { status: 'scheduled' });
    assert.equal(scheduled.status, 'scheduled');
    assert.ok(scheduled.scheduledAt instanceof Date);
    const resolved = await updateServiceTicket(admin, ticket.id, { status: 'resolved', resolution: { outcome: 'popravljeno' } });
    assert.equal(resolved.status, 'resolved');
    assert.ok(resolved.resolvedAt instanceof Date);
    assert.equal(resolved.resolution?.outcome, 'popravljeno');
    assert.deepEqual(
      resolved.history.map((h) => h.action),
      ['created', 'scheduled', 'resolved'],
    );
  });

  await t.test('illegal transition is rejected (resolved is terminal)', async () => {
    const ticket = await createServiceTicket(admin, { subject: 'Zaključen' });
    await updateServiceTicket(admin, ticket.id, { status: 'resolved' });
    await assert.rejects(updateServiceTicket(admin, ticket.id, { status: 'scheduled' }), ServiceTicketError);
  });

  await t.test('reopen from scheduled clears schedule timestamp', async () => {
    const ticket = await createServiceTicket(admin, { subject: 'Ponovno odprt' });
    await updateServiceTicket(admin, ticket.id, { status: 'scheduled' });
    const reopened = await updateServiceTicket(admin, ticket.id, { status: 'reported' });
    assert.equal(reopened.status, 'reported');
    assert.equal(reopened.scheduledAt, undefined);
    assert.equal(reopened.history.at(-1)?.action, 'reopened');
  });

  await t.test('dedupeKey prevents duplicate portal intake', async () => {
    await createServiceTicket(admin, { subject: 'Portal', source: 'portal', dedupeKey: 'portal-abc', createdByKind: 'portal' });
    await assert.rejects(
      createServiceTicket(admin, { subject: 'Portal spet', source: 'portal', dedupeKey: 'portal-abc' }),
      (err: any) => err instanceof ServiceTicketError && err.statusCode === 409,
    );
  });

  await t.test('list filters by status and tenant isolation holds', async () => {
    const other: ActorContext = { ...admin, tenantId: 'druga-firma' };
    await createServiceTicket(other, { subject: 'Tuj zahtevek' });
    const mine = await listServiceTickets(admin, {});
    assert.ok(mine.every((tk) => tk.tenantId === 'inteligent'));
    const reportedOnly = await listServiceTickets(admin, { status: 'reported' });
    assert.ok(reportedOnly.every((tk) => tk.status === 'reported'));
    await assert.rejects(listServiceTickets(admin, { status: 'neveljaven' }), ServiceTicketError);
  });

  await t.test('list falls back to contact email when there is no CRM client', async () => {
    await createServiceTicket(admin, {
      subject: 'Portalni brez CRM',
      source: 'portal',
      contact: { email: 'noclient@example.com' },
    });
    const byEmail = await listServiceTickets(admin, { email: 'noclient@example.com' });
    assert.ok(byEmail.length >= 1);
    assert.ok(byEmail.every((tk) => tk.contact?.email === 'noclient@example.com'));
  });

  await t.test('get across tenants returns 404', async () => {
    const ticket = await createServiceTicket(admin, { subject: 'Zaseben' });
    const other: ActorContext = { ...admin, tenantId: 'druga-firma' };
    await assert.rejects(getServiceTicket(other, ticket.id), (err: any) => err.statusCode === 404);
  });
});
