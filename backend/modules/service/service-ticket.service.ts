import mongoose from 'mongoose';

import {
  ServiceTicketModel,
  type ServiceTicketDocument,
  type ServiceTicketStatus,
  SERVICE_TICKET_STATUSES,
  SERVICE_TICKET_SOURCES,
  SERVICE_TICKET_PRIORITIES,
  SERVICE_TICKET_TRANSITIONS,
  type ServiceTicketSource,
  type ServiceTicketPriority,
} from './service-ticket.model';

// AIN-P2-08: ServiceTicket lifecycle storitev. ActorContext + tenant scoping po
// vzoru modules/tasks (AIN-P1-09).

export class ServiceTicketError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ServiceTicketError';
    this.statusCode = statusCode;
  }
}

export type ActorContext = {
  tenantId: string;
  actorUserId: string;
  actorEmployeeId: string | null;
  roles: string[];
};

function cleanString(value: unknown, maxLength = 300): string {
  return typeof value === 'string' ? value.normalize('NFC').trim().slice(0, maxLength) : '';
}

function parseObjectId(value: unknown, field: string): mongoose.Types.ObjectId | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!mongoose.isValidObjectId(String(value))) throw new ServiceTicketError(`Neveljaven ID (${field}).`);
  return new mongoose.Types.ObjectId(String(value));
}

function parseDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new ServiceTicketError(`Neveljaven datum (${field}).`);
  return date;
}

function actorObjectId(context: ActorContext): mongoose.Types.ObjectId | undefined {
  return context.actorUserId && mongoose.isValidObjectId(context.actorUserId)
    ? new mongoose.Types.ObjectId(context.actorUserId)
    : undefined;
}

export type CreateServiceTicketInput = {
  subject?: unknown;
  description?: unknown;
  source?: unknown;
  priority?: unknown;
  client?: { id?: unknown; name?: unknown };
  projectId?: unknown;
  equipment?: { productId?: unknown; name?: unknown };
  contact?: { name?: unknown; email?: unknown; phone?: unknown };
  assigneeEmployeeId?: unknown;
  dedupeKey?: unknown;
  createdByKind?: 'user' | 'portal' | 'system';
};

export async function createServiceTicket(
  context: ActorContext,
  input: CreateServiceTicketInput,
): Promise<ServiceTicketDocument> {
  const subject = cleanString(input.subject, 200);
  if (!subject) throw new ServiceTicketError('Predmet zahtevka (subject) je obvezen.');

  const source = (cleanString(input.source, 20) || 'internal') as ServiceTicketSource;
  if (!SERVICE_TICKET_SOURCES.includes(source)) {
    throw new ServiceTicketError(`Neveljaven vir. Dovoljeno: ${SERVICE_TICKET_SOURCES.join(', ')}.`);
  }

  const priority = (cleanString(input.priority, 20) || 'normal') as ServiceTicketPriority;
  if (!SERVICE_TICKET_PRIORITIES.includes(priority)) {
    throw new ServiceTicketError(`Neveljavna prioriteta. Dovoljeno: ${SERVICE_TICKET_PRIORITIES.join(', ')}.`);
  }

  const dedupeKey = cleanString(input.dedupeKey, 200) || undefined;
  if (dedupeKey) {
    const existing = await ServiceTicketModel.findOne({ tenantId: context.tenantId, dedupeKey }).lean();
    if (existing) throw new ServiceTicketError('Zahtevek s tem dedupeKey že obstaja.', 409);
  }

  const createdByKind = input.createdByKind ?? 'user';

  return ServiceTicketModel.create({
    tenantId: context.tenantId || 'inteligent',
    status: 'reported',
    source,
    priority,
    subject,
    description: cleanString(input.description, 4000),
    client: {
      id: parseObjectId(input.client?.id, 'client.id'),
      name: cleanString(input.client?.name, 200),
    },
    projectId: cleanString(input.projectId, 40) || undefined,
    equipment: {
      productId: parseObjectId(input.equipment?.productId, 'equipment.productId'),
      name: cleanString(input.equipment?.name, 200),
    },
    contact: {
      name: cleanString(input.contact?.name, 160),
      email: cleanString(input.contact?.email, 160).toLowerCase(),
      phone: cleanString(input.contact?.phone, 60),
    },
    assigneeEmployeeId: parseObjectId(input.assigneeEmployeeId, 'assigneeEmployeeId'),
    dedupeKey,
    createdBy: { kind: createdByKind, userId: createdByKind === 'user' ? actorObjectId(context) : undefined },
    history: [{ at: new Date(), byUserId: actorObjectId(context), action: 'created' }],
  });
}

export type ServiceTicketFilters = {
  status?: unknown;
  clientId?: unknown;
  projectId?: unknown;
  source?: unknown;
  email?: unknown;
};

export async function listServiceTickets(context: ActorContext, filters: ServiceTicketFilters = {}) {
  const query: Record<string, unknown> = { tenantId: context.tenantId };
  const status = cleanString(filters.status, 20);
  if (status) {
    if (!SERVICE_TICKET_STATUSES.includes(status as ServiceTicketStatus)) {
      throw new ServiceTicketError(`Neveljaven status. Dovoljeno: ${SERVICE_TICKET_STATUSES.join(', ')}.`);
    }
    query.status = status;
  }
  const clientId = parseObjectId(filters.clientId, 'clientId');
  const email = cleanString(filters.email, 160).toLowerCase();
  if (clientId) query['client.id'] = clientId;
  else if (email) query['contact.email'] = email; // fallback za zahtevke brez CRM povezave
  const projectId = cleanString(filters.projectId, 40);
  if (projectId) query.projectId = projectId;
  const source = cleanString(filters.source, 20);
  if (source) query.source = source;

  return ServiceTicketModel.find(query).sort({ createdAt: -1 }).limit(500).lean();
}

export async function getServiceTicket(context: ActorContext, idRaw: unknown): Promise<ServiceTicketDocument> {
  const id = parseObjectId(idRaw, 'id');
  if (!id) throw new ServiceTicketError('Neveljaven ID zahtevka.', 404);
  const ticket = await ServiceTicketModel.findOne({ _id: id, tenantId: context.tenantId });
  if (!ticket) throw new ServiceTicketError('Zahtevek ne obstaja.', 404);
  return ticket;
}

export type UpdateServiceTicketInput = {
  status?: unknown;
  priority?: unknown;
  assigneeEmployeeId?: unknown;
  scheduledAt?: unknown;
  subject?: unknown;
  description?: unknown;
  resolution?: { outcome?: unknown; note?: unknown };
  note?: unknown;
};

export async function updateServiceTicket(
  context: ActorContext,
  idRaw: unknown,
  input: UpdateServiceTicketInput,
): Promise<ServiceTicketDocument> {
  const ticket = await getServiceTicket(context, idRaw);
  const byUserId = actorObjectId(context);
  const note = cleanString(input.note, 500) || undefined;

  if (input.subject !== undefined) {
    const subject = cleanString(input.subject, 200);
    if (!subject) throw new ServiceTicketError('Predmet zahtevka ne sme biti prazen.');
    ticket.subject = subject;
  }
  if (input.description !== undefined) ticket.description = cleanString(input.description, 4000);

  if (input.priority !== undefined) {
    const priority = cleanString(input.priority, 20) as ServiceTicketPriority;
    if (!SERVICE_TICKET_PRIORITIES.includes(priority)) {
      throw new ServiceTicketError(`Neveljavna prioriteta. Dovoljeno: ${SERVICE_TICKET_PRIORITIES.join(', ')}.`);
    }
    ticket.priority = priority;
  }

  if (input.assigneeEmployeeId !== undefined) {
    ticket.assigneeEmployeeId = parseObjectId(input.assigneeEmployeeId, 'assigneeEmployeeId');
  }

  const scheduledAt = parseDate(input.scheduledAt, 'scheduledAt');
  if (scheduledAt) ticket.scheduledAt = scheduledAt;

  if (input.resolution) {
    ticket.resolution = {
      outcome: cleanString(input.resolution.outcome, 120) || ticket.resolution?.outcome,
      note: cleanString(input.resolution.note, 2000) || ticket.resolution?.note,
    };
  }

  // Prehod statusa (z validacijo dovoljenih prehodov).
  if (input.status !== undefined) {
    const next = cleanString(input.status, 20) as ServiceTicketStatus;
    if (!SERVICE_TICKET_STATUSES.includes(next)) {
      throw new ServiceTicketError(`Neveljaven status. Dovoljeno: ${SERVICE_TICKET_STATUSES.join(', ')}.`);
    }
    if (next !== ticket.status) {
      const allowed = SERVICE_TICKET_TRANSITIONS[ticket.status];
      if (!allowed.includes(next)) {
        throw new ServiceTicketError(`Prehod ${ticket.status} → ${next} ni dovoljen.`, 409);
      }
      if (next === 'scheduled' && !ticket.scheduledAt) ticket.scheduledAt = scheduledAt ?? new Date();
      if (next === 'resolved') ticket.resolvedAt = new Date();
      if (next === 'reported') {
        ticket.scheduledAt = undefined;
        ticket.resolvedAt = undefined;
      }
      const action = next === 'reported' ? 'reopened' : next;
      ticket.status = next;
      ticket.history.push({ at: new Date(), byUserId, action, note });
    } else if (note) {
      ticket.history.push({ at: new Date(), byUserId, action: 'updated', note });
    }
  } else {
    ticket.history.push({ at: new Date(), byUserId, action: 'updated', note });
  }

  await ticket.save();
  return ticket;
}
