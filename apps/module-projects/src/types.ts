import { Template } from "./components/TemplateEditor";
import { Item } from "./components/ItemsTable";
import { OfferVersion } from "./components/OfferVersionCard";
import { WorkOrder } from "./components/WorkOrderCard";
import { TimelineEvent } from "./components/TimelineFeed";

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
}

export interface ProjectSummary {
  id: string;
  title: string;
  customer: string;
  status: ProjectStatus;
  offerAmount: number;
  invoiceAmount: number;
  createdAt: string;
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

export interface ProjectDetails extends ProjectSummary {
  customerDetail: ProjectCustomer;
  requirements: string;
  items: Item[];
  offers: OfferVersion[];
  workOrders: WorkOrder[];
  purchaseOrders: PurchaseOrder[];
  deliveryNotes: DeliveryNote[];
  timelineEvents: TimelineEvent[];
  templates: Template[];
}
