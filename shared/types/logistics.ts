export type LogisticsOfferStatus = "draft" | "offered" | "accepted" | "rejected";

export interface LogisticsMaterialItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string;
  note?: string;
}

export interface MaterialOrder {
  _id: string;
  projectId: string;
  offerVersionId: string;
  items: LogisticsMaterialItem[];
  status: "draft" | "ordered" | "received" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrder {
  _id: string;
  projectId: string;
  offerVersionId: string;
  items: LogisticsMaterialItem[];
  status: "draft" | "scheduled" | "in_progress" | "completed" | "cancelled";
  scheduledAt: string | null;
  technicianName?: string;
  technicianId?: string;
  location?: string;
  notes?: string;
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
  materialOrder: MaterialOrder | null;
  workOrder: WorkOrder | null;
}
