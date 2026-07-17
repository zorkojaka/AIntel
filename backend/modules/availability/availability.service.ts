import mongoose from 'mongoose';

import { EmployeeModel, type EmployeeScheduleSettings } from '../employees/schemas/employee';
import { WorkOrderModel } from '../projects/schemas/work-order';
import { EmployeeAvailabilityDayModel } from './availability.model';

// Razpoložljivost monterjev za termine montaž.
// Efektivne ure dneva: zapis za dan (izjema/klik) > fiksni tedenski vzorec > nič.
// Prosti termin: efektivne ure MINUS ure, zasedene z razpisanimi delovnimi nalogi.

export class AvailabilityError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const DEFAULT_SCHEDULE: EmployeeScheduleSettings = { mode: 'self', dayStartHour: 8, dayEndHour: 16 };

const MAX_RANGE_DAYS = 62;

function sanitizeHours(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new AvailabilityError('Ure morajo biti seznam celih ur (0–23).');
  }
  const hours = Array.from(
    new Set(
      value.map((entry) => {
        const hour = Number(entry);
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
          throw new AvailabilityError('Ure morajo biti cela števila med 0 in 23.');
        }
        return hour;
      }),
    ),
  );
  hours.sort((a, b) => a - b);
  return hours;
}

function assertDateKey(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).valueOf())) {
    throw new AvailabilityError('Datum mora biti v obliki LLLL-MM-DD.');
  }
  return value;
}

export function dateKeyToWeekday(date: string): number {
  return new Date(`${date}T00:00:00`).getDay();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function todayKey(): string {
  return addDays(new Date().toISOString().slice(0, 10), 0);
}

/* ---------- urnik zaposlenega ---------- */

export async function getEmployeeSchedule(employeeId: string): Promise<EmployeeScheduleSettings> {
  const employee = await EmployeeModel.findById(employeeId).select({ schedule: 1 }).lean();
  if (!employee) throw new AvailabilityError('Zaposleni ne obstaja.', 404);
  return (employee.schedule as EmployeeScheduleSettings) ?? { ...DEFAULT_SCHEDULE };
}

export async function updateEmployeeSchedule(
  employeeId: string,
  payload: { mode?: unknown; dayStartHour?: unknown; dayEndHour?: unknown; fixedWeeklyHours?: unknown },
  options: { allowModeChange: boolean },
): Promise<EmployeeScheduleSettings> {
  const current = await getEmployeeSchedule(employeeId);
  const next: EmployeeScheduleSettings = { ...current };

  if (payload.mode !== undefined) {
    if (!options.allowModeChange) {
      throw new AvailabilityError('Način urnika lahko spremeni samo administrator.', 403);
    }
    if (payload.mode !== 'self' && payload.mode !== 'fixed') {
      throw new AvailabilityError("Način urnika mora biti 'self' ali 'fixed'.");
    }
    next.mode = payload.mode;
  }
  if (payload.dayStartHour !== undefined) {
    const hour = Number(payload.dayStartHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new AvailabilityError('Začetek delavnika mora biti ura 0–23.');
    next.dayStartHour = hour;
  }
  if (payload.dayEndHour !== undefined) {
    const hour = Number(payload.dayEndHour);
    if (!Number.isInteger(hour) || hour < 1 || hour > 24) throw new AvailabilityError('Konec delavnika mora biti ura 1–24.');
    next.dayEndHour = hour;
  }
  if (next.dayEndHour <= next.dayStartHour) {
    throw new AvailabilityError('Konec delavnika mora biti za začetkom.');
  }
  if (payload.fixedWeeklyHours !== undefined) {
    if (!options.allowModeChange) {
      throw new AvailabilityError('Fiksni tedenski urnik lahko spremeni samo administrator.', 403);
    }
    const fixed: Record<string, number[]> = {};
    if (payload.fixedWeeklyHours !== null && typeof payload.fixedWeeklyHours === 'object') {
      for (const [key, value] of Object.entries(payload.fixedWeeklyHours as Record<string, unknown>)) {
        if (!/^[0-6]$/.test(key)) throw new AvailabilityError('Dnevi tedna so ključi 0–6 (0=nedelja).');
        fixed[key] = sanitizeHours(value);
      }
    }
    next.fixedWeeklyHours = fixed;
  }

  const updated = await EmployeeModel.findByIdAndUpdate(
    employeeId,
    { $set: { schedule: next } },
    { new: true, runValidators: true },
  ).select({ schedule: 1 }).lean();
  if (!updated) throw new AvailabilityError('Zaposleni ne obstaja.', 404);
  return updated.schedule as EmployeeScheduleSettings;
}

/* ---------- razpoložljivost po dnevih ---------- */

export function defaultHoursFor(schedule: EmployeeScheduleSettings): number[] {
  const hours: number[] = [];
  for (let hour = schedule.dayStartHour; hour < schedule.dayEndHour; hour += 1) hours.push(hour);
  return hours;
}

function effectiveHours(
  schedule: EmployeeScheduleSettings,
  date: string,
  override: number[] | undefined,
): { hours: number[]; source: 'manual' | 'fixed' | 'none' } {
  if (override !== undefined) return { hours: override, source: 'manual' };
  if (schedule.mode === 'fixed') {
    const weekday = String(dateKeyToWeekday(date));
    const fixed = schedule.fixedWeeklyHours?.[weekday] ?? [];
    return { hours: fixed, source: fixed.length ? 'fixed' : 'none' };
  }
  return { hours: [], source: 'none' };
}

export interface AvailabilityDay {
  date: string;
  hours: number[];
  source: 'manual' | 'fixed' | 'none';
}

export async function getAvailabilityCalendar(employeeId: string, from: string, days: number): Promise<AvailabilityDay[]> {
  const fromKey = assertDateKey(from);
  const span = Math.min(MAX_RANGE_DAYS, Math.max(1, Math.floor(days)));
  const toKey = addDays(fromKey, span - 1);
  const schedule = await getEmployeeSchedule(employeeId);
  const overrides = await EmployeeAvailabilityDayModel.find({
    employeeId: new mongoose.Types.ObjectId(employeeId),
    date: { $gte: fromKey, $lte: toKey },
  }).lean();
  const overrideByDate = new Map<string, number[]>(overrides.map((doc) => [String(doc.date), (doc.hours ?? []) as number[]]));

  const out: AvailabilityDay[] = [];
  for (let index = 0; index < span; index += 1) {
    const date = addDays(fromKey, index);
    const { hours, source } = effectiveHours(schedule, date, overrideByDate.get(date));
    out.push({ date, hours, source });
  }
  return out;
}

/** Nastavi ure dneva. Prazen seznam: pri self pobriše zapis, pri fixed zapiše izjemo »ne delam«. */
export async function setAvailabilityDay(employeeId: string, date: string, hours: unknown): Promise<AvailabilityDay> {
  const dateKey = assertDateKey(date);
  const clean = sanitizeHours(hours);
  const schedule = await getEmployeeSchedule(employeeId);
  const id = new mongoose.Types.ObjectId(employeeId);

  if (!clean.length && schedule.mode === 'self') {
    await EmployeeAvailabilityDayModel.deleteOne({ employeeId: id, date: dateKey });
    return { date: dateKey, hours: [], source: 'none' };
  }
  await EmployeeAvailabilityDayModel.updateOne(
    { employeeId: id, date: dateKey },
    { $set: { hours: clean } },
    { upsert: true },
  );
  return { date: dateKey, hours: clean, source: 'manual' };
}

/* ---------- termini (razpisani delovni nalogi) na koledarju monterja ---------- */

export interface EmployeeTermin {
  date: string;
  startHour: number;
  hours: number;
  title: string;
  projectId: string;
  /** Nalog zaključen (status completed / completedAt). */
  done: boolean;
}

/** Razpisani nalogi monterja po dnevih — da koledar pokaže tudi zasedene/opravljene termine. */
export async function getEmployeeTermini(employeeId: string, from: string, days: number): Promise<EmployeeTermin[]> {
  if (!mongoose.isValidObjectId(employeeId)) return [];
  const fromKey = assertDateKey(from);
  const span = Math.min(MAX_RANGE_DAYS, Math.max(1, Math.floor(days)));
  const toKey = addDays(fromKey, span - 1);
  const workOrders = await WorkOrderModel.find({
    assignedEmployeeIds: new mongoose.Types.ObjectId(employeeId),
    status: { $ne: 'cancelled' },
    cancelledAt: null,
    scheduledAt: { $ne: null, $gte: fromKey, $lte: `${toKey}T23:59:59.999Z` },
  })
    .select({ scheduledAt: 1, items: 1, title: 1, projectId: 1, status: 1, completedAt: 1 })
    .lean();

  const out: EmployeeTermin[] = [];
  for (const workOrder of workOrders as any[]) {
    const scheduled = new Date(workOrder.scheduledAt);
    if (Number.isNaN(scheduled.valueOf())) continue;
    const dateKey = `${scheduled.getFullYear()}-${String(scheduled.getMonth() + 1).padStart(2, '0')}-${String(scheduled.getDate()).padStart(2, '0')}`;
    out.push({
      date: dateKey,
      startHour: scheduled.getHours(),
      hours: estimateWorkOrderHours(workOrder.items),
      title: workOrder.title || workOrder.projectId || 'Montaža',
      projectId: String(workOrder.projectId ?? ''),
      done: workOrder.status === 'completed' || !!workOrder.completedAt,
    });
  }
  out.sort((a, b) => (a.date === b.date ? a.startHour - b.startHour : a.date.localeCompare(b.date)));
  return out;
}

/* ---------- prosti termini za delovni nalog ---------- */

/** Groba ocena trajanja izvedbe iz časovnih norm postavk naloga (ure, najmanj 1). */
export function estimateWorkOrderHours(items: Array<{ casovnaNorma?: number; quantity?: number }> | undefined): number {
  const total = (items ?? []).reduce(
    (sum, item) => sum + (Number(item.casovnaNorma) || 0) * (Number(item.quantity) || 1),
    0,
  );
  return Math.max(1, Math.ceil(total || 4));
}

interface BusyInterval {
  startHour: number;
  hours: number;
}

async function busyByEmployeeAndDate(
  employeeIds: mongoose.Types.ObjectId[],
  fromKey: string,
  toKey: string,
  excludeWorkOrderId?: string,
): Promise<Map<string, BusyInterval[]>> {
  const query: Record<string, unknown> = {
    assignedEmployeeIds: { $in: employeeIds },
    status: { $ne: 'cancelled' },
    cancelledAt: null,
    scheduledAt: { $ne: null, $gte: fromKey, $lte: `${toKey}T23:59:59.999Z` },
  };
  if (excludeWorkOrderId && mongoose.isValidObjectId(excludeWorkOrderId)) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeWorkOrderId) };
  }
  const workOrders = await WorkOrderModel.find(query)
    .select({ scheduledAt: 1, assignedEmployeeIds: 1, items: 1 })
    .lean();

  const busy = new Map<string, BusyInterval[]>();
  for (const workOrder of workOrders as any[]) {
    const scheduled = new Date(workOrder.scheduledAt);
    if (Number.isNaN(scheduled.valueOf())) continue;
    const dateKey = `${scheduled.getFullYear()}-${String(scheduled.getMonth() + 1).padStart(2, '0')}-${String(scheduled.getDate()).padStart(2, '0')}`;
    const interval: BusyInterval = { startHour: scheduled.getHours(), hours: estimateWorkOrderHours(workOrder.items) };
    for (const employeeId of workOrder.assignedEmployeeIds ?? []) {
      const key = `${employeeId}:${dateKey}`;
      busy.set(key, [...(busy.get(key) ?? []), interval]);
    }
  }
  return busy;
}

export interface FreeDay {
  date: string;
  startHour: number;
}

/**
 * Dnevi, ko so VSI navedeni monterji hkrati prosti za `durationHours` zaporednih ur.
 * Vrne najzgodnejšo možno začetno uro za vsak dan.
 */
export async function findFreeDays(input: {
  employeeIds: string[];
  durationHours: number;
  from?: string;
  days?: number;
  excludeWorkOrderId?: string;
}): Promise<FreeDay[]> {
  const employeeIds = input.employeeIds.filter((id) => mongoose.isValidObjectId(id));
  if (!employeeIds.length) return [];
  const duration = Math.max(1, Math.min(24, Math.floor(input.durationHours)));
  const fromKey = assertDateKey(input.from ?? addDays(todayKey(), 1));
  const span = Math.min(MAX_RANGE_DAYS, Math.max(1, Math.floor(input.days ?? 30)));
  const toKey = addDays(fromKey, span - 1);

  const objectIds = employeeIds.map((id) => new mongoose.Types.ObjectId(id));
  const [calendars, busy] = await Promise.all([
    Promise.all(employeeIds.map((id) => getAvailabilityCalendar(id, fromKey, span))),
    busyByEmployeeAndDate(objectIds, fromKey, toKey, input.excludeWorkOrderId),
  ]);

  const out: FreeDay[] = [];
  for (let index = 0; index < span; index += 1) {
    const date = addDays(fromKey, index);
    // Presek prostih ur vseh monterjev (skupaj izvajajo montažo).
    let common: Set<number> | null = null;
    for (let e = 0; e < employeeIds.length; e += 1) {
      const day = calendars[e][index];
      const free = new Set(day.hours);
      for (const interval of busy.get(`${employeeIds[e]}:${date}`) ?? []) {
        for (let hour = interval.startHour; hour < interval.startHour + interval.hours; hour += 1) free.delete(hour);
      }
      common = common === null ? free : new Set([...common].filter((hour) => free.has(hour)));
      if (!common.size) break;
    }
    if (!common?.size) continue;

    const hours = [...common].sort((a, b) => a - b);
    for (const start of hours) {
      let ok = true;
      for (let offset = 1; offset < duration; offset += 1) {
        if (!common.has(start + offset)) { ok = false; break; }
      }
      if (ok) { out.push({ date, startHour: start }); break; }
    }
  }
  return out;
}
