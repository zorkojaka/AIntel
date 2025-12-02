export type LogisticsOfferStatus = "draft" | "offered" | "accepted" | "rejected" | "cancelled";

export interface LogisticsMaterialItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string;
  note?: string;
}

export type MaterialStatus =
  | "Preklicano"
  | "Za naro?it"
  | "Naro?eno"
  | "Prevzeto"
  | "Pripravljeno";

export interface MaterialOrder {
  _id: string;
  projectId: string;
  offerVersionId: string;
  items: LogisticsMaterialItem[];
  status: "draft" | "ordered" | "received" | "cancelled";
  materialStatus: MaterialStatus;
  technicianId?: string | null;
  technicianName?: string | null;
  cancelledAt?: string | null;
  reopened?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WorkOrderStatus = "draft" | "issued" | "in-progress" | "confirmed" | "completed";

export interface WorkOrder {
  _id: string;
  projectId: string;
  offerVersionId: string;
  items: LogisticsMaterialItem[];
  status: WorkOrderStatus;
  scheduledAt: string | null;
  technicianName?: string;
  technicianId?: string;
  location?: string;
  notes?: string;
  cancelledAt?: string | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  reopened?: boolean;
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
  materialOrder: MaterialOrder | null;
  workOrder: WorkOrder | null;
  invoices?: any[];
  events?: any[];
}
