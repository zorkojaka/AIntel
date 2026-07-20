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
  bookingSlotHours,
  estimateWorkOrderHours,
  findFreeDays,
  getAvailabilityCalendar,
  setAvailabilityDay,
  todayKey,
  updateEmployeeSchedule,
} from '../modules/availability/availability.service';
import { getEmployeeTermini, getWeekLimits, mondayOf, setWeekLimit } from '../modules/availability/availability.service';
import { EmployeeWeekLimitModel } from '../modules/availability/availability.model';
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
    EmployeeWeekLimitModel.deleteMany({}),
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

test('self privzeti dnevi: označeni dnevi v tednu so samodejno na voljo', async () => {
  const weekdayD1 = new Date(`${D1}T00:00:00`).getDay();
  const weekdayD2 = new Date(`${D2}T00:00:00`).getDay();
  // Privzeti samo dan D1 (ne D2).
  const employee = await monter('Miha', { mode: 'self', dayStartHour: 8, dayEndHour: 12, defaultWeekdays: [weekdayD1] });

  const calendar = await getAvailabilityCalendar(String(employee._id), D1, 2);
  assert.deepEqual(calendar[0], { date: D1, hours: [8, 9, 10, 11], source: 'fixed' }, 'privzeti dan dobi privzete ure');
  if (weekdayD2 !== weekdayD1) {
    assert.equal(calendar[1].source, 'none', 'neprivzeti dan ostane prazen');
  }
});

test('self privzeti dan: prazen zapis je izjema (ne delam), ne izbris', async () => {
  const weekdayD1 = new Date(`${D1}T00:00:00`).getDay();
  const employee = await monter('Miha', { mode: 'self', dayStartHour: 8, dayEndHour: 12, defaultWeekdays: [weekdayD1] });

  // Prazen zapis na privzeti dan → izjema (ostane prazen, ne vrne se v vzorec).
  await setAvailabilityDay(String(employee._id), D1, []);
  let calendar = await getAvailabilityCalendar(String(employee._id), D1, 1);
  assert.deepEqual(calendar[0], { date: D1, hours: [], source: 'manual' });
  assert.equal(await EmployeeAvailabilityDayModel.countDocuments({}), 1, 'izjema se shrani, ne izbriše');

  // Zapis drugih ur na privzeti dan → override.
  await setAvailabilityDay(String(employee._id), D1, [9, 10]);
  calendar = await getAvailabilityCalendar(String(employee._id), D1, 1);
  assert.deepEqual(calendar[0].hours, [9, 10]);
});

test('self brez privzetega dneva: prazen zapis pobriše (kot doslej)', async () => {
  const employee = await monter('Miha', { mode: 'self', dayStartHour: 8, dayEndHour: 16, defaultWeekdays: [] });
  await setAvailabilityDay(String(employee._id), D1, [8, 9]);
  assert.equal(await EmployeeAvailabilityDayModel.countDocuments({}), 1);
  await setAvailabilityDay(String(employee._id), D1, []);
  assert.equal(await EmployeeAvailabilityDayModel.countDocuments({}), 0, 'neprivzeti self dan se pobriše');
});

test('urnik: privzeti dnevi morajo biti 0–6', async () => {
  const employee = await monter('Miha');
  await assert.rejects(
    updateEmployeeSchedule(String(employee._id), { defaultWeekdays: [1, 7] }, { allowModeChange: false }),
    AvailabilityError,
  );
  const schedule = await updateEmployeeSchedule(String(employee._id), { defaultWeekdays: [5, 1, 1] }, { allowModeChange: false });
  assert.deepEqual(schedule.defaultWeekdays, [1, 5], 'razvrsti in odstrani dvojnike');
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

// casovnaNorma je v MINUTAH (60 = ena delovna ura) — tako jo vodi cenik in tako
// jo bere urnik. Prava napaka iz produkcije: nalog s 690 min je bil ocenjen na
// 690 UR, kar je stranki skrilo vse termine.
test('ocena trajanja: minute norm → ure, zaokroženo navzgor, najmanj 1, brez norm 4', () => {
  assert.equal(estimateWorkOrderHours([{ casovnaNorma: 120, quantity: 1 }, { casovnaNorma: 60, quantity: 8 }]), 10);
  assert.equal(estimateWorkOrderHours([{ casovnaNorma: 30, quantity: 1 }]), 1, 'pol ure se zaokroži na 1 uro');
  assert.equal(estimateWorkOrderHours([{ casovnaNorma: 90, quantity: 1 }]), 2, '1,5 h → 2 h');
  assert.equal(estimateWorkOrderHours([]), 4, 'brez norm privzeto 4 ure');
  assert.equal(estimateWorkOrderHours([{ casovnaNorma: 0, quantity: 5 }]), 4, 'same nicle = brez norm');
  // Realen nalog iz produkcije (PRJ-220): 690 min = 11,5 h → 12 h, ne 690 h.
  assert.equal(estimateWorkOrderHours([{ casovnaNorma: 690, quantity: 1 }]), 12);
});

// Dolgih montaž ne razbijamo na več dni: rezervira se en poln dan, nadaljevanje
// se dogovori na terenu. bookingSlotHours omeji iskani blok na delovni dan.
test('bookingSlotHours: krajše montaže točno svoje trajanje, dolge en delovni dan', () => {
  assert.equal(bookingSlotHours(3), 3);
  assert.equal(bookingSlotHours(8), 8);
  assert.equal(bookingSlotHours(12), 8, 'dolga montaža se skrči na en dan');
  assert.equal(bookingSlotHours(0), 1, 'najmanj 1 ura');
});

test('rezervacija: dolga montaža (12 h) se ponudi na dan z označenim polnim dnem', async () => {
  const miha = await monter('Miha');
  await setAvailabilityDay(String(miha._id), D1, [8, 9, 10, 11, 12, 13, 14, 15]); // 8 ur (8–16)
  await ProjectModel.create({
    id: 'PRJ-403', code: 'PRJ-403', projectNumber: 403, title: 'PRJ-403: Velik videonadzor',
    customer: { name: 'Testna stranka' }, status: 'in-progress', createdAt: new Date().toISOString(),
  });
  await WorkOrderModel.create({
    projectId: 'PRJ-403',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [{ id: 'i1', name: 'Montaža', quantity: 1, unit: 'kos', casovnaNorma: 720 }], // 12 h
    status: 'issued',
    scheduledAt: null,
    assignedEmployeeIds: [miha._id],
    bookingToken: 'c'.repeat(48),
  });

  const view = await getBookingByToken('c'.repeat(48));
  assert.equal(view.durationHours, 12, 'stranki se pokaže celotna ocena');
  assert.ok(view.days.some((day) => day.date === D1), 'dan s polnim dnem je ponujen kljub 12 h oceni');

  const chosen = await chooseBookingDay('c'.repeat(48), D1);
  assert.equal(chosen.scheduledAt, `${D1}T08:00:00`);
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

  // Mihi na D1 razpišemo nalog 10:00 (120 min = 2 uri) → presek razpade, 3 ure ni več
  await WorkOrderModel.create({
    projectId: 'PRJ-400',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [{ id: 'i1', name: 'Montaža', quantity: 1, unit: 'kos', casovnaNorma: 120 }],
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
    items: [{ id: 'i1', name: 'Montaža', quantity: 1, unit: 'kos', casovnaNorma: 180 }],
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

// Ponedeljek čez en teden in pol — cel teden pon–sre je zanesljivo v prihodnosti.
const PON = addDays(mondayOf(todayKey()), 14);
const TOR = addDays(PON, 1);
const SRE = addDays(PON, 2);

async function nalog(projectId: string, date: string, employeeId: unknown, casovnaNorma = 120) {
  return WorkOrderModel.create({
    projectId,
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [{ id: 'i1', name: 'Montaža', quantity: 1, unit: 'kos', casovnaNorma }],
    status: 'issued',
    scheduledAt: `${date}T08:00:00`,
    assignedEmployeeIds: [employeeId],
  });
}

test('tedenska omejitev: ob dosegu se preostali prosti dnevi tedna skrijejo', async () => {
  const miha = await monter('Miha', { mode: 'self', dayStartHour: 8, dayEndHour: 16, maxWorkdaysPerWeek: 2 });
  // Točno 2 uri na dan: razpisan nalog (2 uri norm) dan v celoti zasede.
  for (const day of [PON, TOR, SRE]) await setAvailabilityDay(String(miha._id), day, [8, 9]);

  const prosto = () => findFreeDays({ employeeIds: [String(miha._id)], durationHours: 2, from: PON, days: 7 });

  // 0 zasedenih: vsi trije dnevi na voljo.
  assert.deepEqual((await prosto()).map((d) => d.date), [PON, TOR, SRE]);

  // 1 zaseden dan (od 2 dovoljenih): preostala dva še na voljo.
  await nalog('PRJ-420', PON, miha._id);
  assert.deepEqual((await prosto()).map((d) => d.date), [TOR, SRE]);

  // 2 zasedena dneva: tretji dan se skrije, čeprav je označen kot prost.
  await nalog('PRJ-421', TOR, miha._id);
  assert.deepEqual((await prosto()).map((d) => d.date), [], 'omejitev 2/teden je dosežena');

  // Dva naloga ISTI dan štejeta kot en delovni dan — druga dva dneva ostaneta.
  await WorkOrderModel.deleteMany({ projectId: 'PRJ-421' });
  await nalog('PRJ-422', PON, miha._id, 60);
  assert.deepEqual((await prosto()).map((d) => d.date), [TOR, SRE], 'isti dan = en delovni dan');
});

test('tedenska izjema prepiše privzetek; brez omejitve ni skrivanja', async () => {
  const miha = await monter('Miha', { mode: 'self', dayStartHour: 8, dayEndHour: 16, maxWorkdaysPerWeek: 1 });
  for (const day of [PON, TOR, SRE]) await setAvailabilityDay(String(miha._id), day, [8, 9]);
  await nalog('PRJ-430', PON, miha._id);

  const prosto = () => findFreeDays({ employeeIds: [String(miha._id)], durationHours: 2, from: PON, days: 7 });
  assert.deepEqual((await prosto()).map((d) => d.date), [], 'privzetek 1/teden že dosežen');

  // Izjema za ta teden: 3 dni → torek in sreda spet na voljo.
  await setWeekLimit(String(miha._id), PON, 3);
  assert.deepEqual((await prosto()).map((d) => d.date), [TOR, SRE]);

  const limits = await getWeekLimits(String(miha._id), PON, 7);
  assert.deepEqual(limits[0], { weekStart: PON, maxWorkdays: 3, hasOverride: true });

  // Brisanje izjeme vrne privzetek.
  await setWeekLimit(String(miha._id), PON, null);
  assert.deepEqual((await prosto()).map((d) => d.date), []);
});

test('setWeekLimit zavrne dan, ki ni ponedeljek', async () => {
  const miha = await monter('Miha');
  await assert.rejects(setWeekLimit(String(miha._id), TOR, 2), AvailabilityError);
});

test('koledar monterja pokaže razpisane termine z oznako opravljenosti', async () => {
  const miha = await monter('Miha');
  const opravljen = addDays(todayKey(), -3);
  await WorkOrderModel.create({
    projectId: 'PRJ-410',
    title: 'Montaža alarma',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [{ id: 'i1', name: 'Montaža', quantity: 1, unit: 'kos', casovnaNorma: 120 }],
    status: 'completed',
    completedAt: new Date(),
    scheduledAt: `${opravljen}T08:00:00`,
    assignedEmployeeIds: [miha._id],
  });
  await WorkOrderModel.create({
    projectId: 'PRJ-411',
    title: 'Montaža kamer',
    offerVersionId: new mongoose.Types.ObjectId().toString(),
    items: [{ id: 'i1', name: 'Montaža', quantity: 1, unit: 'kos', casovnaNorma: 180 }],
    status: 'issued',
    scheduledAt: `${D1}T10:00:00`,
    assignedEmployeeIds: [miha._id],
  });

  const termini = await getEmployeeTermini(String(miha._id), addDays(todayKey(), -5), 20);
  assert.equal(termini.length, 2);
  assert.deepEqual(
    termini.map((t) => ({ date: t.date, startHour: t.startHour, hours: t.hours, done: t.done })),
    [
      { date: opravljen, startHour: 8, hours: 2, done: true },
      { date: D1, startHour: 10, hours: 3, done: false },
    ],
  );
  assert.equal(termini[1].title, 'Montaža kamer');
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
    items: [{ id: 'i1', name: 'Montaža', quantity: 1, unit: 'kos', casovnaNorma: 300 }],
    status: 'issued',
    scheduledAt: null,
    assignedEmployeeIds: [miha._id],
    bookingToken: 'b'.repeat(48),
  });
  // 300 min = 5 ur > 2 razpoložljivi uri → D1 sploh ni ponujen
  await assert.rejects(chooseBookingDay('b'.repeat(48), D1), (error: unknown) =>
    error instanceof AvailabilityError && error.statusCode === 409);
});
