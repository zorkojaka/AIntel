import { Router, type Request, type Response } from 'express';

import { requireRoles } from '../../middlewares/auth';
import { ROLE_ADMIN, ROLE_ORGANIZER } from '../../utils/roles';
import {
  AvailabilityError,
  getAvailabilityCalendar,
  getEmployeeSchedule,
  getEmployeeTermini,
  getWeekLimits,
  setAvailabilityDay,
  setWeekLimit,
  updateEmployeeSchedule,
} from './availability.service';

// Razpoložljivost monterjev: /my/* za prijavljenega (monter klika svoj koledar),
// /employees/* za administracijo (fiksni urniki, pregled pri planiranju).

const router = Router();

function myEmployeeId(req: Request): string | null {
  const context = (req as unknown as { context?: { actorEmployeeId?: string | null } }).context;
  return context?.actorEmployeeId ?? null;
}

function fail(res: Response, error: unknown, fallback: string) {
  if (error instanceof AvailabilityError) return res.fail(error.message, error.statusCode);
  console.error(fallback, error);
  return res.fail(fallback, 500);
}

function requireMyEmployee(req: Request, res: Response): string | null {
  const employeeId = myEmployeeId(req);
  if (!employeeId) {
    res.fail('Uporabnik ni povezan z zaposlenim.', 403);
    return null;
  }
  return employeeId;
}

/* ---------- moj urnik (monter) ---------- */

router.get('/my/schedule', async (req: Request, res: Response) => {
  const employeeId = requireMyEmployee(req, res);
  if (!employeeId) return;
  try {
    return res.success({ schedule: await getEmployeeSchedule(employeeId) });
  } catch (error) {
    return fail(res, error, 'Urnika ni bilo mogoče naložiti.');
  }
});

// Monter sme urejati svoja privzeta začetek/konec in privzeto omejitev dni na
// teden; način in fiksni urnik ureja admin.
router.put('/my/schedule', async (req: Request, res: Response) => {
  const employeeId = requireMyEmployee(req, res);
  if (!employeeId) return;
  try {
    const schedule = await updateEmployeeSchedule(
      employeeId,
      {
        dayStartHour: req.body?.dayStartHour,
        dayEndHour: req.body?.dayEndHour,
        maxWorkdaysPerWeek: req.body?.maxWorkdaysPerWeek,
      },
      { allowModeChange: false },
    );
    return res.success({ schedule });
  } catch (error) {
    return fail(res, error, 'Urnika ni bilo mogoče shraniti.');
  }
});

router.get('/my/calendar', async (req: Request, res: Response) => {
  const employeeId = requireMyEmployee(req, res);
  if (!employeeId) return;
  try {
    const from = typeof req.query.from === 'string' ? req.query.from : new Date().toISOString().slice(0, 10);
    const days = req.query.days ? Number(req.query.days) : 35;
    const [calendarDays, termini, weekLimits] = await Promise.all([
      getAvailabilityCalendar(employeeId, from, days),
      getEmployeeTermini(employeeId, from, days),
      getWeekLimits(employeeId, from, days),
    ]);
    return res.success({ days: calendarDays, termini, weekLimits });
  } catch (error) {
    return fail(res, error, 'Koledarja ni bilo mogoče naložiti.');
  }
});

router.put('/my/days/:date', async (req: Request, res: Response) => {
  const employeeId = requireMyEmployee(req, res);
  if (!employeeId) return;
  try {
    return res.success({ day: await setAvailabilityDay(employeeId, req.params.date, req.body?.hours) });
  } catch (error) {
    return fail(res, error, 'Dneva ni bilo mogoče shraniti.');
  }
});

router.put('/my/weeks/:weekStart', async (req: Request, res: Response) => {
  const employeeId = requireMyEmployee(req, res);
  if (!employeeId) return;
  try {
    return res.success({ week: await setWeekLimit(employeeId, req.params.weekStart, req.body?.maxWorkdays) });
  } catch (error) {
    return fail(res, error, 'Omejitve tedna ni bilo mogoče shraniti.');
  }
});

/* ---------- administracija (fiksni urniki, planiranje) ---------- */

const adminOnly = requireRoles([ROLE_ADMIN]);
const planningRead = requireRoles([ROLE_ADMIN, ROLE_ORGANIZER]);

router.get('/employees/:employeeId/schedule', planningRead, async (req: Request, res: Response) => {
  try {
    return res.success({ schedule: await getEmployeeSchedule(req.params.employeeId) });
  } catch (error) {
    return fail(res, error, 'Urnika ni bilo mogoče naložiti.');
  }
});

router.put('/employees/:employeeId/schedule', adminOnly, async (req: Request, res: Response) => {
  try {
    const schedule = await updateEmployeeSchedule(
      req.params.employeeId,
      {
        mode: req.body?.mode,
        dayStartHour: req.body?.dayStartHour,
        dayEndHour: req.body?.dayEndHour,
        fixedWeeklyHours: req.body?.fixedWeeklyHours,
        maxWorkdaysPerWeek: req.body?.maxWorkdaysPerWeek,
      },
      { allowModeChange: true },
    );
    return res.success({ schedule });
  } catch (error) {
    return fail(res, error, 'Urnika ni bilo mogoče shraniti.');
  }
});

router.get('/employees/:employeeId/calendar', planningRead, async (req: Request, res: Response) => {
  try {
    const from = typeof req.query.from === 'string' ? req.query.from : new Date().toISOString().slice(0, 10);
    const days = req.query.days ? Number(req.query.days) : 35;
    const [calendarDays, termini, weekLimits] = await Promise.all([
      getAvailabilityCalendar(req.params.employeeId, from, days),
      getEmployeeTermini(req.params.employeeId, from, days),
      getWeekLimits(req.params.employeeId, from, days),
    ]);
    return res.success({ days: calendarDays, termini, weekLimits });
  } catch (error) {
    return fail(res, error, 'Koledarja ni bilo mogoče naložiti.');
  }
});

router.put('/employees/:employeeId/days/:date', adminOnly, async (req: Request, res: Response) => {
  try {
    return res.success({ day: await setAvailabilityDay(req.params.employeeId, req.params.date, req.body?.hours) });
  } catch (error) {
    return fail(res, error, 'Dneva ni bilo mogoče shraniti.');
  }
});

router.put('/employees/:employeeId/weeks/:weekStart', adminOnly, async (req: Request, res: Response) => {
  try {
    return res.success({ week: await setWeekLimit(req.params.employeeId, req.params.weekStart, req.body?.maxWorkdays) });
  } catch (error) {
    return fail(res, error, 'Omejitve tedna ni bilo mogoče shraniti.');
  }
});

export default router;

// Projekt-vezan kontroler: pošlji stranki vabilo k izbiri dneva montaže.
// Priklopljen v modules/projects/routes (priprava, vloga ORGANIZER/ADMIN).
export async function bookingInviteController(req: Request, res: Response) {
  try {
    const context = (req as unknown as { context?: { actorUserId?: string } }).context;
    const { createBookingInvite } = await import('./booking.service');
    const result = await createBookingInvite({
      projectId: req.params.projectId,
      workOrderId: req.params.workOrderId,
      to: req.body?.to,
      subject: typeof req.body?.subject === 'string' ? req.body.subject : null,
      body: typeof req.body?.body === 'string' ? req.body.body : null,
      previewOnly: req.body?.previewOnly === true,
      actorUserId: context?.actorUserId ?? null,
    });
    return res.success(result);
  } catch (error) {
    return fail(res, error, 'Vabila ni bilo mogoče poslati.');
  }
}
