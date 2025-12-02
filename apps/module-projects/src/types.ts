import { Template } from "./components/TemplateEditor";
import { Item } from "./domains/requirements/ItemsTable";
import { OfferVersion } from "./domains/offers/OfferVersionCard";
import { WorkOrder } from "./components/WorkOrderCard";
import { TimelineEvent } from "./components/TimelineFeed";
import type { ProjectRequirement } from "@aintel/shared/types/project";

export interface Category {
  id: string;
  name: string;
  slug: string;
  color?: string;
  order?: number;
}

export type ProjectStatus =
  | "draft"
  | "offered"
  | "ordered"
  | "in-progress"
  | "completed"
  | "invoiced";

export interface ProjectCustomer {
  name: string;
  taxId?: string;
  address?: string;
  paymentTerms?: string;
  email?: string;
  phone?: string;
}

export interface ProjectSummary {
  id: string;
  _id?: string;
  code?: string;
  projectNumber?: number;
  title: string;
  customer: string;
  status: ProjectStatus;
  offerAmount: number;
  invoiceAmount: number;
  createdAt: string;
  categories: string[];
  requirementsTemplateVariantSlug?: string;
}

export interface PurchaseOrder {
  id: string;
  supplier: string;
  status: "draft" | "sent" | "confirmed" | "delivered";
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

export type RequirementRow = ProjectRequirement;

export interface ProjectDetails extends ProjectSummary {
  customerDetail: ProjectCustomer;
  requirements?: ProjectRequirement[];
  requirementsText?: string;
  requirementsTemplateVariantSlug?: string;
  items: Item[];
  offers: OfferVersion[];
  workOrders: WorkOrder[];
  purchaseOrders: PurchaseOrder[];
  deliveryNotes: DeliveryNote[];
  timelineEvents: TimelineEvent[];
  templates: Template[];
}

export interface OfferCandidate {
  ruleId: string;
  productCategorySlug: string;
  suggestedProductId?: string;
  suggestedName: string;
  quantity: number;
}
