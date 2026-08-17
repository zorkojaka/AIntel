import crypto from 'crypto';

import { WorkOrderModel } from '../projects/schemas/work-order';
import { OfferVersionModel } from '../projects/schemas/offer-version';
import { EmployeeModel } from '../employees/schemas/employee';
import { ProjectModel, newTimelineEventId } from '../projects/schemas/project';
import { sendBookingConfirmationEmail, sendBookingInviteEmail } from '../communication/services/communication.service';
import { getConfig } from '../settings/config/config-store.service';
import {
  AvailabilityError,
  bookingSlotHours,
  estimateWorkOrderHours,
  findFreeDays,
  type FreeDay,
} from './availability.service';
import { OfferBookingModel } from './offer-booking.model';
import { BookingPreviewModel } from './booking-preview.model';

// Rezervacija dneva montaže: interno se ustvari povabilo (žeton + mail),
// stranka na javni strani izbere dan, izbira zapiše termin na delovni nalog
// in ga hkrati POTRDI (scheduledConfirmedAt) — zahtevani korak priprave.

const BOOKING_WINDOW_DAYS = 45;

/** Kateri od dodeljenih monterjev sam po sebi nima nobenega prostega termina. */
async function imenaMonterjevBrezRazpolozljivosti(
  employeeIds: string[],
  slotHours: number,
  excludeWorkOrderId: string,
): Promise<string[]> {
  const brez: string[] = [];
  for (const employeeId of employeeIds) {
    const dnevi = await findFreeDays({
      employeeIds: [employeeId],
      durationHours: slotHours,
      days: BOOKING_WINDOW_DAYS,
      excludeWorkOrderId,
    });
    if (!dnevi.length) {
      const employee = await EmployeeModel.findById(employeeId).select({ name: 1 }).lean();
      brez.push((employee as { name?: string } | null)?.name ?? 'monter');
    }
  }
  return brez;
}

async function bookingPageUrl(): Promise<string> {
  const config = await getConfig<{ bookingPageUrl?: string }>('platform.general');
  return (config.bookingPageUrl ?? '').trim() || 'https://dev.inteligent.si/predogled/izbira-termina';
}

function bookingLinkFor(token: string, baseUrl: string): string {
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${token}`;
}

type EmployeeFreeDay = FreeDay & { employeeId: string };

async function findFreeDaysForAnyEmployee(input: {
  employeeIds: string[];
  durationHours: number;
  days?: number;
  excludeOfferBookingId?: string;
}): Promise<EmployeeFreeDay[]> {
  const calendars = await Promise.all(
    input.employeeIds.map(async (employeeId) => ({
      employeeId,
      days: await findFreeDays({
        employeeIds: [employeeId],
        durationHours: input.durationHours,
        days: input.days,
        excludeOfferBookingId: input.excludeOfferBookingId,
      }),
    })),
  );
  const byDate = new Map<string, EmployeeFreeDay>();
  for (const calendar of calendars) {
    for (const day of calendar.days) {
      const current = byDate.get(day.date);
      if (!current || day.startHour < current.startHour) {
        byDate.set(day.date, { ...day, employeeId: calendar.employeeId });
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);
}

export async function prepareOfferBookingLink(input: {
  projectId: string;
  offerId: string;
  employeeIds: string[];
}) {
  const employeeIds = Array.from(
    new Set((input.employeeIds ?? []).map((id) => String(id).trim()).filter((id) => /^[a-f0-9]{24}$/i.test(id))),
  );
  if (!employeeIds.length) {
    throw new AvailabilityError('Za izbiro termina izberi vsaj enega monterja.');
  }

  const [offer, employees] = await Promise.all([
    OfferVersionModel.findOne({ _id: input.offerId, projectId: input.projectId }).lean(),
    EmployeeModel.find({ _id: { $in: employeeIds }, active: true, deletedAt: null, roles: 'EXECUTION' })
      .select({ _id: 1, name: 1 })
      .lean(),
  ]);
  if (!offer) throw new AvailabilityError('Ponudba ni najdena.', 404);
  if (employees.length !== employeeIds.length) {
    throw new AvailabilityError('Eden ali več izbranih monterjev ni aktivnih.');
  }

  const durationHours = estimateWorkOrderHours(offer.items as any[]);
  const slotHours = bookingSlotHours(durationHours);
  const existing = await OfferBookingModel.findOne({ projectId: input.projectId, offerVersionId: offer._id });
  const freeDays = await findFreeDaysForAnyEmployee({
    employeeIds,
    durationHours: slotHours,
    days: BOOKING_WINDOW_DAYS,
    excludeOfferBookingId: existing ? String(existing._id) : undefined,
  });
  if (!freeDays.length) {
    throw new AvailabilityError(
      `Izbrani monterji v naslednjih ${BOOKING_WINDOW_DAYS} dneh nimajo prostega termina za ${slotHours} h.`,
    );
  }

  const token = existing?.bookingToken || crypto.randomBytes(24).toString('hex');
  await OfferBookingModel.findOneAndUpdate(
    { projectId: input.projectId, offerVersionId: offer._id },
    {
      $set: {
        candidateEmployeeIds: employeeIds,
        bookingToken: token,
        durationHours,
        scheduledAt: null,
        selectedEmployeeId: null,
        selectedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return {
    link: bookingLinkFor(token, await bookingPageUrl()),
    durationHours,
    freeDaysCount: freeDays.length,
  };
}

export async function createBookingPreviewLink(input: { employeeIds: string[] }) {
  const employeeIds = Array.from(
    new Set((input.employeeIds ?? []).map((id) => String(id).trim()).filter((id) => /^[a-f0-9]{24}$/i.test(id))),
  );
  if (!employeeIds.length) throw new AvailabilityError('Izberi vsaj enega monterja.');

  const employees = await EmployeeModel.find({
    _id: { $in: employeeIds },
    active: true,
    deletedAt: null,
    roles: 'EXECUTION',
  })
    .select({ _id: 1, name: 1 })
    .lean();
  if (employees.length !== employeeIds.length) {
    throw new AvailabilityError('Eden ali več izbranih monterjev ni aktivnih.');
  }

  const token = crypto.randomBytes(24).toString('hex');
  const label = employees.length === 1
    ? `Prosti termini — ${employees[0].name}`
    : 'Prosti termini ekipe';
  await BookingPreviewModel.create({
    employeeIds,
    bookingToken: token,
    durationHours: 1,
    label,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  return { url: bookingLinkFor(token, await bookingPageUrl()) };
}

export async function createBookingInvite(input: {
  projectId: string;
  workOrderId: string;
  to?: unknown;
  subject?: string | null;
  body?: string | null;
  /** true = samo pripravi osnutek maila (nič se ne pošlje). */
  previewOnly?: boolean;
  actorUserId?: string | null;
  actorDisplayName?: string | null;
  actorProfile?: { name?: string | null; email?: string | null; phone?: string | null; role?: string | null } | null;
}) {
  const workOrder = await WorkOrderModel.findOne({
    _id: input.workOrderId,
    projectId: input.projectId,
    cancelledAt: null,
  });
  if (!workOrder) throw new AvailabilityError('Delovni nalog ni najden.', 404);
  const employeeIds = (workOrder.assignedEmployeeIds ?? []).map((id: unknown) => String(id)).filter(Boolean);
  if (!employeeIds.length) {
    throw new AvailabilityError('Najprej dodeli monterje na delovni nalog — termini se ponudijo iz njihove razpoložljivosti.');
  }

  // durationHours = celotna ocena (za mail); slotHours = blok, ki ga stranka
  // dejansko rezervira prvi dan (dolgih montaž ne razbijamo na več dni).
  const durationHours = estimateWorkOrderHours(workOrder.items as any[]);
  const slotHours = bookingSlotHours(durationHours);
  const freeDays = await findFreeDays({
    employeeIds,
    durationHours: slotHours,
    days: BOOKING_WINDOW_DAYS,
    excludeWorkOrderId: String(workOrder._id),
  });
  if (!freeDays.length) {
    // Povemo, KDO nima označenih dni — brez tega je napaka slepa ulica.
    const imena = await imenaMonterjevBrezRazpolozljivosti(employeeIds, slotHours, String(workOrder._id));
    const kdo = imena.length ? ` Brez označenih prostih dni: ${imena.join(', ')}.` : '';
    throw new AvailabilityError(
      `V naslednjih ${BOOKING_WINDOW_DAYS} dneh ni dneva, ko bi bili vsi dodeljeni monterji hkrati prosti ${slotHours} h.${kdo}` +
        ' Monter proste dneve označi na nadzorni plošči (widget »Moja razpoložljivost«), admin pa v Zaposleni → Urnik za termine.',
    );
  }

  const token = workOrder.bookingToken || crypto.randomBytes(24).toString('hex');
  const link = bookingLinkFor(token, await bookingPageUrl());

  // Žeton shranimo že ob predogledu, da povezava v osnutku zagotovo velja.
  if (!workOrder.bookingToken) {
    workOrder.bookingToken = token;
    await workOrder.save();
  }

  const result = await sendBookingInviteEmail({
    projectId: input.projectId,
    workOrderId: String(workOrder._id),
    bookingLink: link,
    durationHours,
    to: input.to,
    subject: input.subject,
    body: input.body,
    previewOnly: input.previewOnly,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    actorProfile: input.actorProfile,
  });

  if (input.previewOnly) {
    const draft = (result as { draft?: { to: string; subject: string; body: string } }).draft;
    return { draft, link, durationHours, freeDaysCount: freeDays.length };
  }

  workOrder.bookingInviteSentAt = new Date();
  await workOrder.save();

  return { link, durationHours, freeDaysCount: freeDays.length, sentAt: workOrder.bookingInviteSentAt };
}

export interface BookingView {
  projectLabel: string;
  durationHours: number;
  alreadyChosen: string | null;
  days: FreeDay[];
  previewOnly?: boolean;
}

async function findByToken(token: string) {
  const clean = typeof token === 'string' ? token.trim() : '';
  if (!/^[a-f0-9]{24,64}$/i.test(clean)) throw new AvailabilityError('Neveljavna povezava.', 404);
  const workOrder = await WorkOrderModel.findOne({ bookingToken: clean, cancelledAt: null });
  if (workOrder) return { kind: 'work-order' as const, workOrder };
  const offerBooking = await OfferBookingModel.findOne({ bookingToken: clean });
  if (offerBooking) {
    const offerExists = await OfferVersionModel.exists({
      _id: offerBooking.offerVersionId,
      projectId: offerBooking.projectId,
      status: { $nin: ['cancelled', 'rejected', 'expired'] },
    });
    if (offerExists) return { kind: 'offer' as const, offerBooking };
  }
  const preview = await BookingPreviewModel.findOne({ bookingToken: clean, expiresAt: { $gt: new Date() } });
  if (preview) return { kind: 'preview' as const, preview };
  throw new AvailabilityError('Povezava ni veljavna ali je termin že izbran.', 404);
}

export async function getBookingByToken(token: string): Promise<BookingView> {
  const booking = await findByToken(token);
  if (booking.kind === 'preview') {
    const days = await findFreeDaysForAnyEmployee({
      employeeIds: (booking.preview.employeeIds ?? []).map((id: unknown) => String(id)),
      durationHours: booking.preview.durationHours,
      days: BOOKING_WINDOW_DAYS,
    });
    return {
      projectLabel: booking.preview.label,
      durationHours: booking.preview.durationHours,
      alreadyChosen: null,
      days: days.map(({ date, startHour }) => ({ date, startHour })),
      previewOnly: true,
    };
  }
  if (booking.kind === 'offer') {
    const { offerBooking } = booking;
    const project = await ProjectModel.findOne({ id: offerBooking.projectId }).select({ title: 1 }).lean();
    const days = await findFreeDaysForAnyEmployee({
      employeeIds: (offerBooking.candidateEmployeeIds ?? []).map((id: unknown) => String(id)),
      durationHours: bookingSlotHours(offerBooking.durationHours),
      days: BOOKING_WINDOW_DAYS,
    });
    return {
      projectLabel: project?.title ?? 'Montaža',
      durationHours: offerBooking.durationHours,
      alreadyChosen: offerBooking.scheduledAt ?? null,
      days: days.map(({ date, startHour }) => ({ date, startHour })),
    };
  }

  const { workOrder } = booking;
  const project = await ProjectModel.findOne({ id: workOrder.projectId }).select({ title: 1 }).lean();
  const durationHours = estimateWorkOrderHours(workOrder.items as any[]);
  const alreadyChosen = workOrder.scheduledConfirmedAt && workOrder.scheduledAt ? workOrder.scheduledAt : null;
  const days = alreadyChosen
    ? []
    : await findFreeDays({
        employeeIds: (workOrder.assignedEmployeeIds ?? []).map((id: unknown) => String(id)),
        durationHours: bookingSlotHours(durationHours),
        days: BOOKING_WINDOW_DAYS,
        excludeWorkOrderId: String(workOrder._id),
      });
  return {
    projectLabel: project?.title ?? workOrder.title ?? 'Montaža',
    durationHours,
    alreadyChosen,
    days,
  };
}

export async function chooseBookingDay(token: string, date: unknown): Promise<{ scheduledAt: string }> {
  const booking = await findByToken(token);
  if (booking.kind === 'preview') {
    throw new AvailabilityError('Predogled ne omogoča izbire termina.', 403);
  }
  if (booking.kind === 'offer') {
    const { offerBooking } = booking;
    if (offerBooking.selectedAt && offerBooking.scheduledAt) {
      return { scheduledAt: offerBooking.scheduledAt };
    }
    const dateKey = typeof date === 'string' ? date.trim() : '';
    const employeeIds = (offerBooking.candidateEmployeeIds ?? []).map((id: unknown) => String(id));
    const freeDays = await findFreeDaysForAnyEmployee({
      employeeIds,
      durationHours: bookingSlotHours(offerBooking.durationHours),
      days: BOOKING_WINDOW_DAYS,
    });
    const chosen = freeDays.find((day) => day.date === dateKey);
    if (!chosen) {
      throw new AvailabilityError('Izbrani dan ni več na voljo — osvežite stran in izberite drugega.', 409);
    }

    const scheduledAt = `${chosen.date}T${String(chosen.startHour).padStart(2, '0')}:00:00`;
    offerBooking.scheduledAt = scheduledAt;
    offerBooking.selectedEmployeeId = chosen.employeeId as any;
    offerBooking.selectedAt = new Date();
    offerBooking.bookingToken = undefined;
    await offerBooking.save();

    await ProjectModel.updateOne(
      { id: offerBooking.projectId },
      {
        $set: { assignedEmployeeIds: [chosen.employeeId] },
        $push: {
          timeline: {
            id: newTimelineEventId(),
            type: 'edit',
            title: 'Stranka izbrala termin montaže',
            description: `${chosen.date} ob ${chosen.startHour}:00 (spletna izbira)`,
            timestamp: new Date().toLocaleString('sl-SI'),
            user: 'Stranka',
            metadata: { offerVersionId: String(offerBooking.offerVersionId), employeeId: chosen.employeeId },
          },
        },
      },
    );
    return { scheduledAt };
  }

  const { workOrder } = booking;
  if (workOrder.scheduledConfirmedAt && workOrder.scheduledAt) {
    return { scheduledAt: workOrder.scheduledAt };
  }
  const dateKey = typeof date === 'string' ? date.trim() : '';
  const durationHours = estimateWorkOrderHours(workOrder.items as any[]);
  const employeeIds = (workOrder.assignedEmployeeIds ?? []).map((id: unknown) => String(id));

  // Ponovno preverimo, da je dan še prost (med mailom in klikom je lahko minilo več dni).
  // Isti blok kot pri ponudbi dni (bookingSlotHours), sicer bi validacija odbila
  // dan, ki je bil legitimno ponujen.
  const days = await findFreeDays({
    employeeIds,
    durationHours: bookingSlotHours(durationHours),
    days: BOOKING_WINDOW_DAYS,
    excludeWorkOrderId: String(workOrder._id),
  });
  const chosen = days.find((day) => day.date === dateKey);
  if (!chosen) {
    throw new AvailabilityError('Izbrani dan ni več na voljo — osvežite stran in izberite drugega.', 409);
  }

  const scheduledAt = `${chosen.date}T${String(chosen.startHour).padStart(2, '0')}:00:00`;
  workOrder.scheduledAt = scheduledAt;
  workOrder.scheduledConfirmedAt = new Date();
  workOrder.scheduledConfirmedBy = 'Stranka (spletna izbira)';
  workOrder.bookingToken = undefined; // povezava je enkratna
  await workOrder.save();

  await ProjectModel.updateOne(
    { id: workOrder.projectId },
    {
      $push: {
        timeline: {
          id: newTimelineEventId(),
          type: 'edit',
          title: 'Stranka izbrala termin montaže',
          description: `${chosen.date} ob ${chosen.startHour}:00 (spletna izbira)`,
          timestamp: new Date().toLocaleString('sl-SI'),
          user: 'Stranka',
          metadata: { workOrderId: String(workOrder._id) },
        },
      },
    },
  );

  // Potrditveni e-mail z gumbom »Dodaj v koledar« — napaka pri pošiljanju ne sme
  // razveljaviti izbire termina (ta je že zapisana in potrjena).
  try {
    await sendBookingConfirmationEmail({
      projectId: workOrder.projectId,
      workOrderId: String(workOrder._id),
      scheduledAt,
      durationHours: bookingSlotHours(durationHours),
    });
  } catch (error) {
    console.error('Potrditvenega e-maila termina ni bilo mogoče poslati.', error);
  }

  return { scheduledAt };
}
