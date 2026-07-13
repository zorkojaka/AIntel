import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  addWorkingHours,
  businessDaysAgo,
  nextBusinessDay,
  onWebInquiryNextStep,
  onWebInquiryProcessed,
  scanLateMaterialDeliveries,
  scanOfferExpiry,
  scanOfferFollowUps,
  scanStaleInquiries,
  scheduleOfferFollowUpTask,
} from '../modules/scheduler/rules';
import { invalidateWheelConfigCache, setWheelConfig } from '../modules/scheduler/wheel-config';
import { TaskModel } from '../modules/tasks/task.model';
import { MaterialOrderModel } from '../modules/projects/schemas/material-order';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { WebInquiryModel } from '../modules/web-inquiries/web-inquiry.model';

function makeInquiry(overrides: Record<string, unknown> = {}) {
  return WebInquiryModel.create({
    tenantId: 'inteligent',
    pillar: 'alarm',
    status: 'novo',
    contact: {
      firstName: 'Janez',
      lastName: 'Novak',
      email: `janez${Math.random().toString(36).slice(2)}@example.com`,
      phone: '041123456',
      siteAddress: { street: 'Ulica 1', postalCode: '1000', city: 'Ljubljana', full: 'Ulica 1, 1000 Ljubljana' },
      company: null,
    },
    ...overrides,
  });
}

function makeOffer(overrides: Record<string, unknown> = {}) {
  return OfferVersionModel.create({
    projectId: `PRJ-${Math.floor(Math.random() * 100000)}`,
    baseTitle: 'Ponudba',
    versionNumber: 1,
    title: 'Ponudba v1',
    documentNumber: `PON-${Math.floor(Math.random() * 100000)}`,
    status: 'sent',
    sentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    items: [],
    ...overrides,
  });
}

test('AIN-P1-11 wheel rules', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'wheel-test' });
  await TaskModel.syncIndexes();

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  t.beforeEach(async () => {
    await TaskModel.deleteMany({});
    await MaterialOrderModel.deleteMany({});
    invalidateWheelConfigCache();
  });

  await t.test('working-time helpers', () => {
    // Wed 2026-07-08 15:00 + 4 working hours (8–16) → Thu within window.
    const wed = new Date('2026-07-08T15:00:00');
    const due = addWorkingHours(wed, 4, 8, 16);
    assert.equal(due.getDay(), 4); // Thursday
    assert.ok(due.getHours() <= 16 && due.getHours() >= 8);
    // Friday → next business day is Monday.
    const fri = new Date('2026-07-10T12:00:00');
    assert.equal(nextBusinessDay(fri, 8).getDay(), 1);
    // 1 business day before Monday is Friday.
    const mon = new Date('2026-07-13T10:00:00');
    assert.equal(businessDaysAgo(mon, 1).getDay(), 5);
  });

  await t.test('rules ship disabled — no tasks are created', async () => {
    const inquiry = await makeInquiry();
    const result = await onWebInquiryProcessed(inquiry, true);
    assert.equal(result.skipped, true);
    assert.equal(await TaskModel.countDocuments({}), 0);
    assert.deepEqual(await scanStaleInquiries(), { skipped: 1 });
    assert.deepEqual(await scanOfferFollowUps(), { skipped: 1 });
    assert.deepEqual(await scanOfferExpiry(), { skipped: 1 });
    assert.deepEqual(await scanLateMaterialDeliveries(), { skipped: 1 });
  });

  await t.test('inquiry.first_contact: auto-offer → review task, idempotent', async () => {
    await setWheelConfig({ rules: { 'inquiry.first_contact': { enabled: true } } });
    const inquiry = await makeInquiry({ status: 'ponudba_poslana', offerNumber: 'PON-1' });
    const first = await onWebInquiryProcessed(inquiry, true);
    assert.equal(first.skipped, false);
    const again = await onWebInquiryProcessed(inquiry, true);
    assert.equal((again as any).result, 'duplicate');
    const tasks = await TaskModel.find({ type: 'inquiry.review_offer' });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].assigneeRole, 'SALES');
    assert.equal(tasks[0].source.kind, 'rule');
    assert.ok(tasks[0].dueAt);
  });

  await t.test('inquiry.first_contact: no auto-offer → call task with high priority', async () => {
    await setWheelConfig({ rules: { 'inquiry.first_contact': { enabled: true } } });
    const inquiry = await makeInquiry({ pillar: 'servis' });
    await onWebInquiryProcessed(inquiry, false);
    const task = await TaskModel.findOne({ type: 'inquiry.call' });
    assert.ok(task);
    assert.equal(task!.priority, 'high');
    assert.match(task!.title, /Pokliči stranko/);
  });

  await t.test('inquiry.next_step: creates task and resolves the first-contact task', async () => {
    await setWheelConfig({
      rules: { 'inquiry.first_contact': { enabled: true }, 'inquiry.next_step': { enabled: true } },
    });
    const inquiry = await makeInquiry({ status: 'ponudba_poslana' });
    await onWebInquiryProcessed(inquiry, true);
    const outcome = await onWebInquiryNextStep(inquiry, 'posvet');
    assert.equal(outcome.skipped, false);
    assert.equal((outcome as any).resolved, 1);
    const posvet = await TaskModel.findOne({ type: 'inquiry.posvet' });
    assert.ok(posvet);
    const review = await TaskModel.findOne({ type: 'inquiry.review_offer' });
    assert.equal(review!.status, 'done');
    assert.equal(review!.resolution?.resolvedByRule, 'inquiry.next_step');
    // 'shrani' does not create a task
    const shrani = await onWebInquiryNextStep(inquiry, 'shrani');
    assert.equal(shrani.skipped, true);
  });

  await t.test('inquiry.stale_escalation: old uncontacted inquiry → ADMIN task; contacted one is skipped', async () => {
    await setWheelConfig({ rules: { 'inquiry.stale_escalation': { enabled: true } } });
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const old = await makeInquiry();
    // createdAt is immutable under mongoose timestamps — backdate via the native driver.
    await WebInquiryModel.collection.updateOne({ _id: old._id as never }, { $set: { createdAt: past } });
    const contacted = await makeInquiry();
    await WebInquiryModel.collection.updateOne({ _id: contacted._id as never }, { $set: { createdAt: past } });
    await TaskModel.create({
      tenantId: 'inteligent',
      type: 'inquiry.call',
      title: 'Pokliči',
      subject: { kind: 'inquiry', id: contacted._id },
      assigneeRole: 'SALES',
      source: { kind: 'user' },
    });
    const result = await scanStaleInquiries();
    assert.equal((result as any).created, 1);
    const escalation = await TaskModel.findOne({ type: 'inquiry.escalation' });
    assert.equal(escalation!.assigneeRole, 'ADMIN');
    assert.equal(String(escalation!.subject.id), String(old._id));
    // second run: idempotent
    const rerun = await scanStaleInquiries();
    assert.equal((rerun as any).created, 0);
  });

  await t.test('offer.follow_up: silent sent offer → task; accepted offer resolves it', async () => {
    await setWheelConfig({ rules: { 'offer.follow_up': { enabled: true } } });
    const offer = await makeOffer();
    const fresh = await makeOffer({ sentAt: new Date() }); // too fresh — no task
    const first = await scanOfferFollowUps();
    assert.equal((first as any).created, 1);
    const task = await TaskModel.findOne({ type: 'offer.follow_up' });
    assert.equal(String(task!.subject.id), String(offer._id));
    assert.equal(task!.assigneeRole, 'SALES');
    // idempotent
    assert.equal(((await scanOfferFollowUps()) as any).created, 0);
    assert.equal(await TaskModel.countDocuments({ type: 'offer.follow_up' }), 1);
    // acceptance resolves the open follow-up
    await OfferVersionModel.updateOne({ _id: offer._id }, { $set: { status: 'accepted' } });
    const resolved = await scanOfferFollowUps();
    assert.equal((resolved as any).resolved, 1);
    const done = await TaskModel.findOne({ type: 'offer.follow_up' });
    assert.equal(done!.status, 'done');
    assert.match(done!.resolution!.outcome, /accepted/);
    assert.ok(fresh); // silence unused warning
  });

  await t.test('offer.follow_up manual: scan ne ustvarja, checkbox ob pošiljanju pa (isti dedupe)', async () => {
    await setWheelConfig({ rules: { 'offer.follow_up': { mode: 'manual' } } });
    const offer = await makeOffer();
    // ročni način: scan starih poslanih ponudb NE sme ustvariti opravila
    const scan = await scanOfferFollowUps();
    assert.equal((scan as any).created, 0);
    // checkbox ob pošiljanju ustvari opravilo z rokom čez N dni
    const scheduled = await scheduleOfferFollowUpTask({ offerId: String(offer._id), days: 5 });
    assert.equal((scheduled as any).result, 'created');
    const task = await TaskModel.findOne({ type: 'offer.follow_up' });
    assert.equal(String(task!.subject.id), String(offer._id));
    assert.ok(task!.dueAt && task!.dueAt.getTime() > Date.now() + 4 * 24 * 60 * 60 * 1000);
    // idempotentno tudi proti scanu v auto načinu (isti dedupeKey)
    await setWheelConfig({ rules: { 'offer.follow_up': { mode: 'auto' } } });
    invalidateWheelConfigCache();
    assert.equal(((await scanOfferFollowUps()) as any).created, 0);
    assert.equal(await TaskModel.countDocuments({ type: 'offer.follow_up' }), 1);
    // odgovor stranke (sprememba statusa) opravilo samodejno zapre tudi v manual načinu
    await setWheelConfig({ rules: { 'offer.follow_up': { mode: 'manual' } } });
    invalidateWheelConfigCache();
    await OfferVersionModel.updateOne({ _id: offer._id }, { $set: { status: 'accepted' } });
    assert.equal(((await scanOfferFollowUps()) as any).resolved, 1);
  });

  await t.test('scheduleOfferFollowUpTask: izklopljeno pravilo → nič', async () => {
    await setWheelConfig({ rules: { 'offer.follow_up': { mode: 'off' } } });
    const offer = await makeOffer();
    const result = await scheduleOfferFollowUpTask({ offerId: String(offer._id), days: 7 });
    assert.equal((result as any).skipped, true);
    assert.equal(await TaskModel.countDocuments({}), 0);
  });

  await t.test('offer.expiry: expired sent offer → renew-or-close task, idempotent', async () => {
    await setWheelConfig({ rules: { 'offer.expiry': { enabled: true } } });
    await makeOffer({ validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000) });
    await makeOffer({ validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }); // still valid
    const result = await scanOfferExpiry();
    assert.equal((result as any).created, 1);
    assert.equal(((await scanOfferExpiry()) as any).created, 0);
    const task = await TaskModel.findOne({ type: 'offer.expiry' });
    assert.equal(task!.priority, 'high');
    assert.match(task!.title, /potekla/);
  });

  await t.test('material.late_delivery: expectedAt in the past creates one organizer task', async () => {
    await setWheelConfig({ rules: { 'material.late_delivery': { enabled: true } } });
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const late = await MaterialOrderModel.create({
      projectId: 'PRJ-LATE',
      offerVersionId: new mongoose.Types.ObjectId().toString(),
      expectedAt: past,
      materialStatus: 'Naročeno',
      status: 'ordered',
      pickupMethod: 'SUPPLIER_PICKUP',
      items: [
        {
          id: 'line-1',
          productId: null,
          name: 'Kamera',
          quantity: 1,
          unit: 'kos',
          dobavitelj: 'Alarm Avtomatika',
          naslovDobavitelja: 'Ljubljana',
          supplierKey: 'alarm-avtomatika-ljubljana',
          materialStep: 'Naročeno',
        },
      ],
    });
    await MaterialOrderModel.create({
      projectId: 'PRJ-FUTURE',
      offerVersionId: new mongoose.Types.ObjectId().toString(),
      expectedAt: future,
      materialStatus: 'Naročeno',
      status: 'ordered',
      pickupMethod: 'SUPPLIER_PICKUP',
      items: [],
    });
    await MaterialOrderModel.create({
      projectId: 'PRJ-READY',
      offerVersionId: new mongoose.Types.ObjectId().toString(),
      expectedAt: past,
      materialStatus: 'Pripravljeno',
      status: 'ordered',
      pickupMethod: 'SUPPLIER_PICKUP',
      items: [],
    });

    const result = await scanLateMaterialDeliveries();
    assert.equal((result as any).created, 1);
    assert.equal(((await scanLateMaterialDeliveries()) as any).created, 0);
    const task = await TaskModel.findOne({ type: 'material.late_delivery' });
    assert.ok(task);
    assert.equal(task!.assigneeRole, 'ORGANIZER');
    assert.equal(task!.priority, 'high');
    assert.equal(task!.subject.kind, 'materialOrder');
    assert.equal(String(task!.subject.id), String(late._id));
  });
});
