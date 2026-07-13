import mongoose, { Document, Model, Schema } from 'mongoose';

// AIN-P2-08: Service & maintenance module (TARGET §8). ServiceTicket je vstopna
// točka servisa (reported → scheduled → resolved), vir = portal/telefon/e-pošta/
// interno. Prvi rez: ticket lifecycle + admin API. MaintenancePlan, portalni intake
// (ECO-28) in avtomatika kolesa (yearly pregled + upsell) so naslednji rezi.

export const SERVICE_TICKET_STATUSES = ['reported', 'scheduled', 'resolved', 'cancelled'] as const;
export type ServiceTicketStatus = (typeof SERVICE_TICKET_STATUSES)[number];

export const SERVICE_TICKET_SOURCES = ['portal', 'phone', 'email', 'internal'] as const;
export type ServiceTicketSource = (typeof SERVICE_TICKET_SOURCES)[number];

export const SERVICE_TICKET_PRIORITIES = ['low', 'normal', 'high'] as const;
export type ServiceTicketPriority = (typeof SERVICE_TICKET_PRIORITIES)[number];

// Dovoljeni prehodi statusov (končna stanja resolved/cancelled nimajo izhodov).
export const SERVICE_TICKET_TRANSITIONS: Record<ServiceTicketStatus, ServiceTicketStatus[]> = {
  reported: ['scheduled', 'resolved', 'cancelled'],
  scheduled: ['resolved', 'cancelled', 'reported'],
  resolved: [],
  cancelled: [],
};

export interface ServiceTicketHistoryEntry {
  at: Date;
  byUserId?: mongoose.Types.ObjectId;
  action: string; // created | scheduled | resolved | cancelled | reopened | updated
  note?: string;
}

export interface ServiceTicketDocument extends Document {
  tenantId: string;
  status: ServiceTicketStatus;
  source: ServiceTicketSource;
  priority: ServiceTicketPriority;
  subject: string;
  description: string;
  client: { id?: mongoose.Types.ObjectId; name?: string };
  projectId?: string; // človeški ID projekta (PRJ-###), če izhaja iz projekta
  equipment?: { productId?: mongoose.Types.ObjectId; name?: string };
  contact: { name?: string; email?: string; phone?: string };
  assigneeEmployeeId?: mongoose.Types.ObjectId;
  scheduledAt?: Date;
  resolvedAt?: Date;
  resolution?: { outcome?: string; note?: string };
  createdBy: { kind: 'user' | 'portal' | 'system'; userId?: mongoose.Types.ObjectId };
  dedupeKey?: string;
  history: ServiceTicketHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const ServiceTicketSchema = new Schema<ServiceTicketDocument>(
  {
    tenantId: { type: String, required: true, default: 'inteligent', index: true },
    status: { type: String, enum: SERVICE_TICKET_STATUSES, required: true, default: 'reported' },
    source: { type: String, enum: SERVICE_TICKET_SOURCES, required: true, default: 'internal' },
    priority: { type: String, enum: SERVICE_TICKET_PRIORITIES, required: true, default: 'normal' },
    subject: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    client: {
      id: { type: Schema.Types.ObjectId, default: undefined },
      name: { type: String, trim: true, default: '' },
    },
    projectId: { type: String, trim: true, default: undefined },
    equipment: {
      productId: { type: Schema.Types.ObjectId, default: undefined },
      name: { type: String, trim: true, default: '' },
    },
    contact: {
      name: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, lowercase: true, default: '' },
      phone: { type: String, trim: true, default: '' },
    },
    assigneeEmployeeId: { type: Schema.Types.ObjectId, default: undefined },
    scheduledAt: { type: Date, default: undefined },
    resolvedAt: { type: Date, default: undefined },
    resolution: {
      outcome: { type: String, trim: true, default: undefined },
      note: { type: String, trim: true, default: undefined },
    },
    createdBy: {
      kind: { type: String, enum: ['user', 'portal', 'system'], required: true, default: 'user' },
      userId: { type: Schema.Types.ObjectId, default: undefined },
    },
    dedupeKey: { type: String, trim: true, default: undefined },
    history: [
      {
        at: { type: Date, required: true },
        byUserId: { type: Schema.Types.ObjectId, default: undefined },
        action: { type: String, required: true },
        note: { type: String, trim: true, default: undefined },
        _id: false,
      },
    ],
  },
  { timestamps: true, versionKey: false, collection: 'service_tickets' },
);

ServiceTicketSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
ServiceTicketSchema.index({ tenantId: 1, 'client.id': 1 });
// dedupeKey preprečuje dvojni portalni intake — unique velja SAMO kjer je dedupeKey
// niz (partial index; null/odsotni zapisi so izključeni, da se ne zaletavajo).
ServiceTicketSchema.index(
  { tenantId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);

export const ServiceTicketModel: Model<ServiceTicketDocument> =
  (mongoose.models.ServiceTicket as Model<ServiceTicketDocument>) ||
  mongoose.model<ServiceTicketDocument>('ServiceTicket', ServiceTicketSchema);
