export type LogisticsOfferStatus = "draft" | "offered" | "accepted" | "rejected" | "cancelled";

export interface LogisticsMaterialItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  deliveredQty?: number;
  unit: string;
  note?: string;
}

export type MaterialStatus =
  | "Preklicano"
  | "Za naročit"
  | "Naročeno"
  | "Prevzeto"
  | "Pripravljeno";

export interface MaterialOrder {
  _id: string;
  projectId: string;
  offerVersionId: string;
  workOrderId?: string;
  items: LogisticsMaterialItem[];
  status: "draft" | "ordered" | "received" | "cancelled";
  materialStatus: MaterialStatus;
  assignedEmployeeIds?: string[];
  cancelledAt?: string | null;
  reopened?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WorkOrderStatus = "draft" | "issued" | "in-progress" | "confirmed" | "completed";

export interface WorkOrderItem extends LogisticsMaterialItem {
  offerItemId?: string | null;
  offeredQuantity: number;
  plannedQuantity: number;
  executedQuantity: number;
  isExtra: boolean;
  itemNote?: string | null;
  isCompleted?: boolean;
}

export interface WorkLogEntry {
  employeeId: string;
  hours: number;
}

export interface WorkOrder {
  _id: string;
  projectId: string;
  offerVersionId: string;
  sequence?: number | null;
  code?: string | null;
  title?: string | null;
  items: WorkOrderItem[];
  status: WorkOrderStatus;
  scheduledAt: string | null;
  assignedEmployeeIds?: string[];
  location?: string;
  notes?: string;
  cancelledAt?: string | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  reopened?: boolean;
  executionNote?: string | null;
  workLogs?: WorkLogEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLogisticsSnapshot {
  projectId: string;
  confirmedOfferVersionId: string | null;
  offerVersions: {
    _id: string;
    title: string;
    versionNumber: number;
    status: LogisticsOfferStatus;
    totalWithVat: number;
  }[];
  offers?: {
    _id: string;
    title: string;
    versionNumber: number;
    status: LogisticsOfferStatus;
    totalWithVat: number;
  }[];
  acceptedOfferId?: string | null;
  materialOrders: MaterialOrder[];
  workOrders: WorkOrder[];
  materialOrder: MaterialOrder | null;
  workOrder: WorkOrder | null;
  invoices?: any[];
  events?: any[];
}
