import crypto from 'crypto';

import { WorkOrderModel } from '../projects/schemas/work-order';
import { ProjectModel, newTimelineEventId } from '../projects/schemas/project';
import { sendBookingInviteEmail } from '../communication/services/communication.service';
import { getConfig } from '../settings/config/config-store.service';
import { AvailabilityError, estimateWorkOrderHours, findFreeDays, type FreeDay } from './availability.service';

// Rezervacija dneva montaže: interno se ustvari povabilo (žeton + mail),
// stranka na javni strani izbere dan, izbira zapiše termin na delovni nalog
// in ga hkrati POTRDI (scheduledConfirmedAt) — zahtevani korak priprave.

const BOOKING_WINDOW_DAYS = 45;

async function bookingPageUrl(): Promise<string> {
  const config = await getConfig<{ bookingPageUrl?: string }>('platform.general');
  return (config.bookingPageUrl ?? '').trim() || 'https://dev.inteligent.si/predogled/izbira-termina';
}

function bookingLinkFor(token: string, baseUrl: string): string {
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${token}`;
}

export async function createBookingInvite(input: {
  projectId: string;
  workOrderId: string;
  to?: unknown;
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

  const durationHours = estimateWorkOrderHours(workOrder.items as any[]);
  const freeDays = await findFreeDays({
    employeeIds,
    durationHours,
    days: BOOKING_WINDOW_DAYS,
    excludeWorkOrderId: String(workOrder._id),
  });
  if (!freeDays.length) {
    throw new AvailabilityError('Monterji v naslednjih tednih nimajo označene razpoložljivosti — najprej naj označijo proste dneve.');
  }

  const token = workOrder.bookingToken || crypto.randomBytes(24).toString('hex');
  const link = bookingLinkFor(token, await bookingPageUrl());

  await sendBookingInviteEmail({
    projectId: input.projectId,
    workOrderId: String(workOrder._id),
    bookingLink: link,
    durationHours,
    to: input.to,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    actorProfile: input.actorProfile,
  });

  workOrder.bookingToken = token;
  workOrder.bookingInviteSentAt = new Date();
  await workOrder.save();

  return { link, durationHours, freeDaysCount: freeDays.length, sentAt: workOrder.bookingInviteSentAt };
}

export interface BookingView {
  projectLabel: string;
  durationHours: number;
  alreadyChosen: string | null;
  days: FreeDay[];
}

async function findByToken(token: string) {
  const clean = typeof token === 'string' ? token.trim() : '';
  if (!/^[a-f0-9]{24,64}$/i.test(clean)) throw new AvailabilityError('Neveljavna povezava.', 404);
  const workOrder = await WorkOrderModel.findOne({ bookingToken: clean, cancelledAt: null });
  if (!workOrder) throw new AvailabilityError('Povezava ni veljavna ali je termin že izbran.', 404);
  return workOrder;
}

export async function getBookingByToken(token: string): Promise<BookingView> {
  const workOrder = await findByToken(token);
  const project = await ProjectModel.findOne({ id: workOrder.projectId }).select({ title: 1 }).lean();
  const durationHours = estimateWorkOrderHours(workOrder.items as any[]);
  const alreadyChosen = workOrder.scheduledConfirmedAt && workOrder.scheduledAt ? workOrder.scheduledAt : null;
  const days = alreadyChosen
    ? []
    : await findFreeDays({
        employeeIds: (workOrder.assignedEmployeeIds ?? []).map((id: unknown) => String(id)),
        durationHours,
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
  const workOrder = await findByToken(token);
  if (workOrder.scheduledConfirmedAt && workOrder.scheduledAt) {
    return { scheduledAt: workOrder.scheduledAt };
  }
  const dateKey = typeof date === 'string' ? date.trim() : '';
  const durationHours = estimateWorkOrderHours(workOrder.items as any[]);
  const employeeIds = (workOrder.assignedEmployeeIds ?? []).map((id: unknown) => String(id));

  // Ponovno preverimo, da je dan še prost (med mailom in klikom je lahko minilo več dni).
  const days = await findFreeDays({
    employeeIds,
    durationHours,
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

  return { scheduledAt };
}
