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
  archivedAt?: string | null;
  archivedBy?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
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

export type ZahtevaStatus = "osnutek" | "koncana";
export type ZahtevaTipSistema = "videonadzor" | "alarm" | "domofon" | "pametna_hisa";
export type ZahtevaExecutionScenarioType = "posiljanje" | "izvedba" | "izvedba_napeljava";

export interface ZahtevaExecution {
  scenarioType: ZahtevaExecutionScenarioType;
  estimates?: {
    napeljavaUr: number;
    utpKabelMetrov: number;
    kanalMetrov: number;
    kilometrinaKm?: number;
  };
}

export interface Zahteva {
  _id: string;
  projectId: string;
  status: ZahtevaStatus;
  sistemi: Array<{
    id: string;
    tip: ZahtevaTipSistema;
    steviloLokacij: number;
    videonadzor?: {
      asortima: Array<{
      id: string;
      kameraProductId: string;
      nosilecProductId?: string | null;
      }>;
      lokacije: Array<{
        id: string;
        ime: string;
        asortimaIdAssigned?: string | null;
        slike?: Array<{
          filename: string;
          url: string;
          uploadedAt?: string | null;
        }>;
      }>;
      snemalnik: {
        productId?: string | null;
      };
      poeSwitch: {
        productId?: string | null;
        kolicina?: number;
        items?: Array<{
          productId: string;
          kolicina: number;
        }>;
      };
      disk: {
        productId?: string | null;
        kolicina?: number;
        items?: Array<{
          productId: string;
          kolicina: number;
        }>;
        dniSnemanja: number;
        motionRecord: boolean;
      };
      dodatnaOprema?: Array<{
        productId: string;
        kolicina: number;
      }>;
    };
    execution?: ZahtevaExecution;
    alarm?: Record<string, unknown>;
    domofon?: Record<string, unknown>;
    pametnaHisa?: Record<string, unknown>;
  }>;
  generatedQuoteId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
