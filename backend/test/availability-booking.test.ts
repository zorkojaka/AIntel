import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { EmployeeModel } from '../modules/employees/schemas/employee';
import { WorkOrderModel } from '../modules/projects/schemas/work-order';
import { ProjectModel } from '../modules/projects/schemas/project';
import { EmployeeAvailabilityDayModel } from '../modules/availability/availability.model';
import {
  addDays,
  AvailabilityError,
  estimateWorkOrderHours,
  findFreeDays,
  getAvailabilityCalendar,
  setAvailabilityDay,
  todayKey,
  updateEmployeeSchedule,
} from '../modules/availability/availability.service';
import { chooseBookingDay, getBookingByToken } from '../modules/availability/booking.service';
import { registerCoreConfigNamespaces } from '../modules/settings/config/config-namespaces';

let mongod: MongoMemoryServer;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'aintel_availability' });
  registerCoreConfigNamespaces();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await Promise.all([
    EmployeeModel.deleteMany({}),
    EmployeeAvailabilityDayModel.deleteMany({}),
    WorkOrderModel.deleteMany({}),
    ProjectModel.deleteMany({}),
  ]);
});

async function monter(name: string, schedule?: unknown) {
  return EmployeeModel.create({
    tenantId: 'inteligent',
    name,
    roles: ['EXECUTION'],
    hourRateWithoutVat: 20,
    ...(schedule ? { schedule } : {}),
  });
}

const D1 = addDays(todayKey(), 7); // teden naprej, da smo pred oknom rezervacij
const D2 = addDays(todayKey(), 8);

test('urnik: privzeto self 8–16; monter ne more spremeniti načina, admin lahko', async () => {
  const employee = await monter('Miha');
  await assert.rejects(
    updateEmployeeSchedule(String(employee._id), { mode: 'fixed' }, { allowModeChange: false }),
    (error: unknown) => error instanceof AvailabilityError && error.statusCode === 403,
  );
  const schedule = await updateEmployeeSchedule(
    String(employee._id),
    { mode: 'fixed', dayStartHour: 7, dayEndHour: 15, fixedWeeklyHours: { '1': [7, 8, 9, 10, 11, 12, 13, 14] } },
    { allowModeChange: true },
  );
  assert.equal(schedule.mode, 'fixed');
  assert.equal(schedule.dayStartHour, 7);
});

test('urnik: konec mora biti za začetkom, ure 0–23', async () => {
  const employee = await monter('Miha');
  await assert.rejects(
    updateEmployeeSchedule(String(employee._id), { dayStartHour: 16, dayEndHour: 10 }, { allowModeChange: false }),
    AvailabilityError,
  );
  await assert.rejects(setAvailabilityDay(String(employee._id), D1, [8, 25]), AvailabilityError);
});

test('self način: klik dneva shrani ure, prazen seznam dan pobriše', async () => {
  const employee = await monter('Miha');
  await setAvailabilityDay(String(employee._id), D1, [8, 9, 10, 11]);
  let calendar = await getAvailabilityCalendar(String(employee._id), D1, 2);
  assert.deepEqual(calendar[0], { date: D1, hours: [8, 9, 10, 11], source: 'manual' });
  assert.deepEqual(calendar[1].hours, []);

  await setAvailabilityDay(String(employee._id), D1, []);
  calendar = await getAvailabilityCalendar(String(employee._id), D1, 1);
  assert.equal(calendar[0].source, 'none');
  assert.equal(await EmployeeAvailabilityDayModel.countDocuments({}), 0, 'prazen self dan se pobriše');
});

test('fixed način: tedenski vzorec velja samodejno, zapis dneva je izjema', async () => {
  const vseDni: Record<string, number[]> = {};
  for (const day of ['0', '1', '2', '3', '4', '5', '6']) vseDni[day] = [8, 9, 10, 11, 12, 13, 14, 15];
  const employee = await monter('Ana', { mode: 'fixed', dayStartHour: 8, dayEndHour: 16, fixedWeeklyHours: vseDni });

  let calendar = await getAvailabilityCalendar(String(employee._id), D1, 1);
  assert.equal(calendar[0].source, 'fixed');
  assert.equal(calendar[0].hours.length, 8);

  // izjema: ta dan šele od 9h (odvzeta prva ura)
  await setAvailabilityDay(String(employee._id), D1, [9, 10, 11, 12, 13, 14, 15]);
  calendar = await getAvailabilityCalendar(String(employee._id), D1, 1);
  assert.equal(calendar[0].source, 'manual');
  assert.equal(calendar[0].hours[0], 9);

  // izjema: dopust (prazno) — pri fixed se shrani kot prazen zapis, ne pobriše
  await setAvailabilityDay(String(employee._id), D2, []);
  calendar = await getAvailabilityCalendar(String(employee._id), D2, 1);
  assert.deepEqual(calendar[0].hours, []);
  assert.equal(calendar[0].source, 'manual');
});

test('ocena trajanja: vsota časovnih norm, zaokrožena navzgor, najmanj 1, brez norm 4', () => {
  assert.equal(estimateWorkOrderHours([{ casovnaNorma: 1.5, quantity: 2 }, { casovnaNorma: 0.5, quantity: 1 }]), 4);
  assert.equal(estimateWorkOrderHours([{ casovnaNorma: 0.2, quantity: 1 }]), 1);
  assert.equal(estimateWorkOrderHours([]), 4);
});

test('prosti dnevi: presek dveh monterjev + zasedenost z razpisanim nalogom', async () => {
  const miha = await monter('Miha');
  const ana = await monter('Ana');
  await setAvailabilityDay(String(miha._id), D1, [8, 9, 10, 11, 12]);
  await setAvailabilityDay(String(ana._id), D1, [10, 11, 12, 13]);
  await setAvailabilityDay(String(miha._id), D2, [8, 9, 10]);
  // Ana D2 nima označenega → D2 ni skupnega termina

  const free = await findFreeDays({ employeeIds: [String(miha._id), String(ana._id)], durationHours: 3, from: D1, days: 2 });
  assert.deepEqual(free, [{ date: D1, startHour: 10 }], 'presek 10–12 zadošča za 3 ure');

  // Mihi na D1 razpišemo nalog 10:00 (2 uri norm) → presek razpade, 3 ure ni več
  await WorkOrderModel.create({
    projectId: 'PRJ-400',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [{ id: 'i1', name: 'Montaža', quantity: 1, unit: 'kos', casovnaNorma: 2 }],
    status: 'issued',
    scheduledAt: `${D1}T10:00:00`,
    assignedEmployeeIds: [miha._id],
  });
  const freePoNalogu = await findFreeDays({ employeeIds: [String(miha._id), String(ana._id)], durationHours: 3, from: D1, days: 2 });
  assert.deepEqual(freePoNalogu, [], 'zaseden nalog vzame skupne ure');
});

test('rezervacija: stranka izbere dan, termin se zapiše in potrdi, povezava postane enkratna', async () => {
  const miha = await monter('Miha');
  await setAvailabilityDay(String(miha._id), D1, [8, 9, 10, 11]);
  await ProjectModel.create({
    id: 'PRJ-401', code: 'PRJ-401', projectNumber: 401, title: 'PRJ-401: Videonadzor',
    customer: { name: 'Testna stranka' }, status: 'in-progress', createdAt: new Date().toISOString(),
  });
  const workOrder = await WorkOrderModel.create({
    projectId: 'PRJ-401',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [{ id: 'i1', name: 'Montaža', quantity: 1, unit: 'kos', casovnaNorma: 3 }],
    status: 'issued',
    scheduledAt: null,
    assignedEmployeeIds: [miha._id],
    bookingToken: 'a'.repeat(48),
  });

  const view = await getBookingByToken('a'.repeat(48));
  assert.equal(view.durationHours, 3);
  assert.equal(view.alreadyChosen, null);
  assert.ok(view.days.some((day) => day.date === D1));

  const chosen = await chooseBookingDay('a'.repeat(48), D1);
  assert.equal(chosen.scheduledAt, `${D1}T08:00:00`);

  const updated = await WorkOrderModel.findById(workOrder._id).lean();
  assert.equal(updated?.scheduledAt, `${D1}T08:00:00`);
  assert.ok(updated?.scheduledConfirmedAt, 'termin je hkrati potrjen (korak priprave)');
  assert.equal(updated?.scheduledConfirmedBy, 'Stranka (spletna izbira)');
  assert.equal(updated?.bookingToken, undefined, 'žeton je enkraten');

  await assert.rejects(getBookingByToken('a'.repeat(48)), (error: unknown) =>
    error instanceof AvailabilityError && error.statusCode === 404);

  const project = await ProjectModel.findOne({ id: 'PRJ-401' }).lean();
  assert.ok((project as any)?.timeline?.some((entry: any) => entry.title === 'Stranka izbrala termin montaže'));
});

test('rezervacija: dan, ki ni več prost, vrne 409', async () => {
  const miha = await monter('Miha');
  await setAvailabilityDay(String(miha._id), D1, [8, 9]);
  await ProjectModel.create({
    id: 'PRJ-402', code: 'PRJ-402', projectNumber: 402, title: 'PRJ-402: Alarm',
    customer: { name: 'Testna stranka' }, status: 'in-progress', createdAt: new Date().toISOString(),
  });
  await WorkOrderModel.create({
    projectId: 'PRJ-402',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [{ id: 'i1', name: 'Montaža', quantity: 1, unit: 'kos', casovnaNorma: 5 }],
    status: 'issued',
    scheduledAt: null,
    assignedEmployeeIds: [miha._id],
    bookingToken: 'b'.repeat(48),
  });
  // 5 ur norm > 2 razpoložljivi uri → D1 sploh ni ponujen
  await assert.rejects(chooseBookingDay('b'.repeat(48), D1), (error: unknown) =>
    error instanceof AvailabilityError && error.statusCode === 409);
});
