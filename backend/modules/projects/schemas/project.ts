import mongoose, { Document, Schema } from 'mongoose';

export type ProjectStatus = 'draft' | 'offered' | 'ordered' | 'in-progress' | 'completed' | 'invoiced';

export interface ProjectItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  vatRate: number;
  total: number;
  description?: string;
  category?: 'material' | 'labor' | 'other';
}

export interface OfferVersion {
  id: string;
  version: number;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';
  amount: number;
  date: string;
  isSelected?: boolean;
  label?: string;
  items?: ProjectOfferItem[];
}

export interface ProjectOfferItem {
  id: string;
  productId?: string;
  name: string;
  sku?: string;
  quantity: number;
  unit: string;
  price: number;
  discount: number;
  vatRate: number;
  total: number;
  description?: string;
}

export interface ProjectOffer {
  id: string;
  label: string;
  items: ProjectOfferItem[];
}

export interface WorkOrder {
  id: string;
  team: string;
  schedule: string;
  location: string;
  status: 'planned' | 'in-progress' | 'completed';
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  supplier: string;
  status: 'draft' | 'sent' | 'confirmed' | 'delivered';
  amount: number;
  dueDate: string;
  items: string[];
}

export interface DeliveryNote {
  id: string;
  poId: string;
  supplier: string;
  receivedQuantity: number;
  totalQuantity: number;
  receivedDate: string;
  serials?: string[];
}

export interface TimelineEvent {
  id: string;
  type: 'edit' | 'offer' | 'status-change' | 'po' | 'delivery' | 'execution' | 'signature';
  title: string;
  description: string;
  timestamp: string;
  user: string;
  metadata?: Record<string, string>;
}

export interface ProjectCustomer {
  name: string;
  taxId?: string;
  address?: string;
  paymentTerms?: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  category: 'offer' | 'invoice' | 'work-order';
  content: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  title: string;
  customer: ProjectCustomer;
  status: ProjectStatus;
  offerAmount: number;
  invoiceAmount: number;
  createdAt: string;
  requirements: string;
  items: ProjectItem[];
  offers: OfferVersion[];
  workOrders: WorkOrder[];
  purchaseOrders: PurchaseOrder[];
  deliveryNotes: DeliveryNote[];
  timeline: TimelineEvent[];
  templates: ProjectTemplate[];
  categories: string[];
}

export interface ProjectDocument extends Omit<Project, 'id'>, Document {
  id: string;
}

const ProjectItemSchema = new Schema<ProjectItem>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    discount: { type: Number, required: true },
    vatRate: { type: Number, required: true },
    total: { type: Number, required: true },
    description: { type: String },
    category: { type: String },
  },
  { _id: false }
);

const OfferSchema = new Schema<OfferVersion>(
  {
    id: { type: String, required: true },
    version: { type: Number, required: true },
    status: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: String, required: true },
    isSelected: { type: Boolean },
    label: { type: String },
    items: {
      type: [
        new Schema<ProjectOfferItem>(
          {
            id: { type: String, required: true },
            productId: { type: String },
            name: { type: String, required: true },
            sku: { type: String },
            quantity: { type: Number, required: true },
            unit: { type: String, required: true },
            price: { type: Number, required: true },
            discount: { type: Number, required: true },
            vatRate: { type: Number, required: true },
            total: { type: Number, required: true },
            description: { type: String },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

const WorkOrderSchema = new Schema<WorkOrder>(
  {
    id: { type: String, required: true },
    team: { type: String, required: true },
    schedule: { type: String, required: true },
    location: { type: String, required: true },
    status: { type: String, required: true },
    notes: { type: String },
  },
  { _id: false }
);

const PurchaseOrderSchema = new Schema<PurchaseOrder>(
  {
    id: { type: String, required: true },
    supplier: { type: String, required: true },
    status: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDate: { type: String, required: true },
    items: [{ type: String, required: true }],
  },
  { _id: false }
);

const DeliveryNoteSchema = new Schema<DeliveryNote>(
  {
    id: { type: String, required: true },
    poId: { type: String, required: true },
    supplier: { type: String, required: true },
    receivedQuantity: { type: Number, required: true },
    totalQuantity: { type: Number, required: true },
    receivedDate: { type: String, required: true },
    serials: [{ type: String }],
  },
  { _id: false }
);

const TimelineEventSchema = new Schema<TimelineEvent>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    timestamp: { type: String, required: true },
    user: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ProjectTemplateSchema = new Schema<ProjectTemplate>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    category: { type: String, required: true },
    content: { type: String, required: true },
    isDefault: { type: Boolean },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { _id: false }
);

const ProjectSchema = new Schema<ProjectDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    customer: {
      name: { type: String, required: true, trim: true },
      taxId: { type: String, trim: true },
      address: { type: String, trim: true },
      paymentTerms: { type: String, trim: true },
    },
    status: { type: String, required: true },
    offerAmount: { type: Number, required: true, default: 0 },
    invoiceAmount: { type: Number, required: true, default: 0 },
    createdAt: { type: String, required: true },
    requirements: { type: String, default: '' },
    items: { type: [ProjectItemSchema], default: [] },
    workOrders: { type: [WorkOrderSchema], default: [] },
    purchaseOrders: { type: [PurchaseOrderSchema], default: [] },
    deliveryNotes: { type: [DeliveryNoteSchema], default: [] },
    timeline: { type: [TimelineEventSchema], default: [] },
    templates: { type: [ProjectTemplateSchema], default: [] },
    categories: { type: [String], default: [] },
    offers: { type: [OfferSchema], default: [] },
  },
  { versionKey: false }
);

export const ProjectModel =
  (mongoose.models.Project as mongoose.Model<ProjectDocument>) ||
  mongoose.model<ProjectDocument>('Project', ProjectSchema);

export function calculateOfferAmount(items: ProjectItem[]) {
  return items.reduce(
    (acc, item) => acc + item.quantity * item.price * (1 - item.discount / 100) * (1 + item.vatRate / 100),
    0
  );
}

export function addTimeline(project: Project | ProjectDocument, event: Omit<TimelineEvent, 'id'>) {
  const newEvent: TimelineEvent = { ...event, id: `evt-${Date.now().toString(36)}` };
  project.timeline = [newEvent, ...(project.timeline ?? [])];
}

export function summarizeProject(project: Project | ProjectDocument) {
  return {
    id: project.id,
    title: project.title,
    customer: project.customer.name,
    status: project.status,
    offerAmount: project.offerAmount,
    invoiceAmount: project.invoiceAmount,
    createdAt: project.createdAt,
    categories: project.categories ?? [],
  };
}

export async function generateProjectId() {
  const latest = await ProjectModel.findOne().sort({ createdAt: -1 }).lean();
  const match = latest?.id?.match(/PRJ-(\d+)/);
  const nextNumber = match ? parseInt(match[1], 10) + 1 : 1;
  return `PRJ-${nextNumber.toString().padStart(3, '0')}`;
}
