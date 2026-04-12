export type LogisticsOfferStatus = "draft" | "offered" | "accepted" | "rejected" | "cancelled";

export interface LogisticsMaterialItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  isOrdered?: boolean;
  orderedQty?: number;
  deliveredQty?: number;
  unit: string;
  note?: string;
  dobavitelj?: string;
  naslovDobavitelja?: string;
  materialStep?: MaterialStep;
  isExtra?: boolean;
}

export type MaterialStatus =
  | "Preklicano"
  | "Za naročit"
  | "Naročeno"
  | "Prevzeto"
  | "Pripravljeno";

export type MaterialStep =
  | "Za naročiti"
  | "Naročeno"
  | "Za prevzem"
  | "Prevzeto"
  | "Pripravljeno";

export type MaterialPickupMethod =
  | "COMPANY_PICKUP"
  | "SUPPLIER_PICKUP"
  | "DIRECT_TO_INSTALLER"
  | "DIRECT_TO_SITE";

export interface MaterialOrder {
  _id: string;
  projectId: string;
  offerVersionId: string;
  workOrderId?: string;
  items: LogisticsMaterialItem[];
  status: "draft" | "ordered" | "received" | "cancelled";
  materialStatus: MaterialStatus;
  assignedEmployeeIds?: string[];
  pickupMethod?: MaterialPickupMethod | null;
  pickupLocation?: string | null;
  logisticsOwnerId?: string | null;
  pickupNote?: string | null;
  deliveryNotePhotos?: string[];
  pickupConfirmedAt?: string | null;
  pickupConfirmedBy?: string | null;
  cancelledAt?: string | null;
  reopened?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WorkOrderStatus = "draft" | "issued" | "in-progress" | "confirmed" | "completed";
export type WorkOrderConfirmationState = "unsigned" | "signed_active" | "resign_required";
export type WorkOrderConfirmationVersionState = "active" | "archived" | "superseded";
export type WorkOrderExecutionMode = "simple" | "per_unit" | "measured";

export interface WorkOrderExecutionUnit {
  id: string;
  label: string;
  location?: string;
  instructions?: string;
  isCompleted: boolean;
  note?: string;
}

export interface WorkOrderExecutionSpec {
  mode?: WorkOrderExecutionMode;
  locationSummary?: string;
  instructions?: string;
  trackingUnitLabel?: string;
  executionUnits?: WorkOrderExecutionUnit[];
}

export interface WorkOrderItem extends LogisticsMaterialItem {
  offerItemId?: string | null;
  isService?: boolean;
  offeredQuantity: number;
  plannedQuantity: number;
  executedQuantity: number;
  isExtra: boolean;
  itemNote?: string | null;
  isCompleted?: boolean;
  casovnaNorma?: number;
  executionSpec?: WorkOrderExecutionSpec | null;
}

export interface WorkLogEntry {
  employeeId: string;
  hours: number;
}

export interface WorkOrderConfirmationVersionSummary {
  id: string;
  versionNumber: number;
  state: WorkOrderConfirmationVersionState;
  signerName: string;
  customerRemark?: string | null;
  signature?: string | null;
  signedAt?: string | null;
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
  scheduledConfirmedAt?: string | null;
  scheduledConfirmedBy?: string | null;
  mainInstallerId?: string | null;
  assignedEmployeeIds?: string[];
  location?: string;
  notes?: string;
  cancelledAt?: string | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerSignerName?: string | null;
  customerSignature?: string | null;
  customerSignedAt?: string | null;
  customerRemark?: string | null;
  reopened?: boolean;
  executionNote?: string | null;
  workLogs?: WorkLogEntry[];
  confirmationState?: WorkOrderConfirmationState;
  confirmationActiveVersionId?: string | null;
  activeConfirmationVersion?: WorkOrderConfirmationVersionSummary | null;
  confirmationVersions?: WorkOrderConfirmationVersionSummary[];
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
