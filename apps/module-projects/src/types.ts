import { Item } from "./domains/requirements/ItemsTable";
import { OfferVersion } from "./domains/offers/OfferVersionCard";
import type { ProjectLogistics } from "@aintel/shared/types/projects/Logistics";
import { TimelineEvent } from "./domains/core/TimelineFeed";
import type { ProjectRequirement } from "@aintel/shared/types/project";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "offer" | "invoice" | "work-order";
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  id?: string;
  name: string;
  taxId?: string;
  address?: string;
  paymentTerms?: string;
  email?: string;
  phone?: string;
}

export interface ProjectClient {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  postalCode?: string | null;
  postalCity?: string | null;
  address?: string | null;
  city?: string | null;
  mesto?: string | null;
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
  quotedTotal: number;
  quotedVat: number;
  quotedTotalWithVat: number;
  invoiceAmount: number;
  createdAt: string;
  categories: string[];
  requirementsTemplateVariantSlug?: string;
  salesUserId?: string | null;
  assignedEmployeeIds?: string[];
  requestIds?: string[];
  activeRequestId?: string | null;
  phaseSignals?: {
    hasOffers?: boolean;
    hasConfirmedOffer?: boolean;
    hasWorkOrder?: boolean;
    allExecutionUnitsCompleted?: boolean;
    hasSignedDelivery?: boolean;
    hasIssuedInvoice?: boolean;
  };
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
  client?: ProjectClient | null;
  requirements?: ProjectRequirement[];
  requirementsText?: string;
  requirementsTemplateVariantSlug?: string;
  items: Item[];
  offers: OfferVersion[];
  purchaseOrders: PurchaseOrder[];
  deliveryNotes: DeliveryNote[];
  timelineEvents: TimelineEvent[];
  templates: Template[];
  logistics?: ProjectLogistics | null;
  invoiceVersions?: any[];
}

export interface OfferCandidate {
  ruleId: string;
  productCategorySlug: string;
  suggestedProductId?: string;
  suggestedName: string;
  quantity: number;
}

export type ZahtevaStatus = "osnutek" | "v_obdelavi" | "koncana" | "preskoceno";
export type ZahtevaTipProjekta = "videonadzor" | "alarm" | "domofon" | "pametna_hisa";
export type ZahtevaPot = "ogled" | "paket" | "preskoceno";

export interface Zahteva {
  _id: string;
  projectId: string;
  status: ZahtevaStatus;
  tipProjekta: ZahtevaTipProjekta;
  pot: ZahtevaPot;
  videonadzor: {
    lokacije: Array<{
      id: string;
      ime: string;
      opis?: string;
      kameraId?: string | null;
    }>;
    kosarica: Array<{
      id: string;
      kameraProductId: string;
      nosilecProductId?: string | null;
      kolicina: number;
    }>;
    snemalnik: {
      productId?: string | null;
      kanali: number;
      hasPoE: boolean;
    };
    poeSwitch: {
      productId?: string | null;
      portov: number;
    };
    disk: {
      productId?: string | null;
      kapaciteta: number;
      dniSnemanja: number;
      motionRecord: boolean;
    };
    dodatnaOprema: Array<{
      productId: string;
      kolicina: number;
    }>;
    montaza: {
      vkljuceno: boolean;
      napeljava: boolean;
      metrov: number;
      zascitniMaterial?: "kanal" | "cev" | "brez" | null;
    };
  };
  generatedQuoteId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
