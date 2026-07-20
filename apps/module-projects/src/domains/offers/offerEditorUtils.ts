import type { OfferLineItem, OfferVersion } from "@aintel/shared/types/offers";

import type { ProjectDetails } from "../../types";
import type { ProjectKmCalculation } from "../../api";

export type OfferLineItemForm = {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  discountPercent: number;
  imageUrl?: string;
};

export type KmCalculationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "calculated"; result: ProjectKmCalculation }
  | { status: "manual" }
  | { status: "error"; message: string };

export type OfferEmailSendContext = { offerId: string; subject: string; startedAtMs: number };

export type OfferImportMatch = {
  productId: string;
  ime: string;
  displayName?: string;
  prodajnaCena: number;
  isService: boolean;
  dobavitelj?: string;
  score?: number;
  reasonFlags?: {
    prefixStrong?: boolean;
    whPreferred?: boolean;
  };
};

export type OfferImportRow = {
  rowIndex: number;
  rawName: string;
  normName: string;
  normCore?: string;
  qty: number;
  status: "matched" | "needs_review" | "not_found" | "invalid";
  matches: OfferImportMatch[];
  matchCandidates?: Array<OfferImportMatch & { score: number }>;
  chosenProductId?: string;
  chosenReason?:
    | "exact"
    | "color_default_wh"
    | "explicit_color"
    | "base_exact"
    | "token_best"
    | "token_needs_review"
    | "invalid_row";
  matchScore?: number;
  reviewLevel?: "ok" | "low" | "needs_review" | "invalid";
  topCandidates?: Array<{ productId: string; ime: string; prodajnaCena: number; score: number }>;
  skipped?: boolean;
  manualMatch?: OfferImportMatch;
};

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export const createEmptyItem = (): OfferLineItemForm => ({
  id: crypto.randomUUID(),
  productId: null,
  name: "",
  quantity: 0,
  unit: "kos",
  unitPrice: 0,
  vatRate: 22,
  discountPercent: 0,
  imageUrl: undefined,
  totalNet: 0,
  totalVat: 0,
  totalGross: 0,
});

export const isEmptyOfferItem = (item: OfferLineItemForm) =>
  !item.productId && (!item.name || item.name.trim() === "") && (!item.quantity || item.quantity === 0);

export const clampPositive = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
};

export const clampMin = (value: unknown, fallback: number, min: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
};

export const formatKm = (value: number) =>
  value.toLocaleString("sl-SI", { maximumFractionDigits: 1 });

const normalizeAddressPart = (value?: string | null) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const formatProjectRouteAddress = (project?: ProjectDetails | null) => {
  if (!project) return "";
  const client = project.client ?? null;
  const street = client?.street?.trim();
  const postal = [client?.postalCode, client?.postalCity].map((part) => part?.trim()).filter(Boolean).join(" ");
  const structured = [street, postal].filter(Boolean).join(", ");
  return structured || client?.address?.trim() || project.customerDetail?.address?.trim() || "";
};

const extractAddressParts = (value: string) => {
  const normalized = normalizeAddressPart(value);
  const house = normalized.match(/\b(?!\d{4}\b)\d+[a-z]?\b/)?.[0] ?? "";
  const postalCity = normalized.match(/\b\d{4}\s+([\p{L}\s-]+)/u)?.[1]?.trim() ?? "";
  const segments = value.split(",").map((part) => normalizeAddressPart(part)).filter(Boolean);
  const fallbackCity = segments.length > 1 ? segments[segments.length - 1].replace(/\b\d{4}\b/g, "").trim() : "";
  const city = postalCity || fallbackCity;
  const streetSource = segments[0] || normalized;
  const street = streetSource
    .replace(/\b\d{4}\b/g, " ")
    .replace(/\b(?!\d{4}\b)\d+[a-z]?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { normalized, street, house, city };
};

export const compareRouteAddresses = (projectAddress: string, geocoderAddress: string) => {
  const project = extractAddressParts(projectAddress);
  const geocoder = extractAddressParts(geocoderAddress);
  const streetMatches =
    !!project.street &&
    !!geocoder.street &&
    (project.street.includes(geocoder.street) || geocoder.street.includes(project.street));
  const cityMatches =
    !!project.city &&
    !!geocoder.city &&
    (project.city.includes(geocoder.city) || geocoder.city.includes(project.city));
  const houseMatches = !!project.house && geocoder.normalized.includes(project.house);

  if (streetMatches && cityMatches && houseMatches) {
    return { zanesljivost: "visoka" as const, razlog: "" };
  }
  if (streetMatches && cityMatches) {
    const razlog = project.house && !houseMatches ? "manjka hišna št. ali se razlikuje" : "preveri hišno številko";
    return { zanesljivost: "srednja" as const, razlog };
  }
  return { zanesljivost: "nizka" as const, razlog: "naslov se ne ujema dovolj natančno" };
};

export const isItemValid = (item: OfferLineItem | OfferLineItemForm) =>
  item.name.trim() !== "" && item.unitPrice > 0;

export function resolveImportRowProduct(row: OfferImportRow): OfferImportMatch | null {
  const chosenProductId = row.chosenProductId;
  if (!chosenProductId) {
    return row.manualMatch ?? null;
  }
  const fromMatches = row.matches.find((match) => match.productId === chosenProductId);
  return fromMatches ?? row.manualMatch ?? null;
}

export function recalculateOfferItem(
  item: OfferLineItemForm,
  options: {
    usePerItemDiscount: boolean;
    vatMode: 0 | 9.5 | 22;
    vatModeOverride?: 0 | 9.5 | 22;
  },
): OfferLineItemForm {
  const quantity = clampMin(item.quantity, 1, 0);
  const unitPrice = clampPositive(item.unitPrice, 0);
  const vatRate = clampPositive(item.vatRate, 0);
  const perItemDiscount = options.usePerItemDiscount ? clampPositive(item.discountPercent ?? 0, 0) : 0;

  const net = Number((quantity * unitPrice * (1 - perItemDiscount / 100)).toFixed(2));
  const activeVatMode = options.vatModeOverride ?? options.vatMode;
  const effectiveVatRate = activeVatMode === 0 ? 0 : activeVatMode ?? vatRate;
  const totalVat = Number((net * (effectiveVatRate / 100)).toFixed(2));
  const totalGross = Number((net + totalVat).toFixed(2));

  return {
    ...item,
    quantity,
    unitPrice,
    vatRate,
    discountPercent: perItemDiscount,
    totalNet: net,
    totalVat,
    totalGross,
  };
}

export function ensureTrailingBlankOfferItem(list: OfferLineItemForm[]) {
  const trimmed = list.filter((item, index) => {
    if (index === list.length - 1) return true;
    return !isEmptyOfferItem(item);
  });
  const last = trimmed[trimmed.length - 1];
  if (!last || !isEmptyOfferItem(last)) {
    const blank = createEmptyItem();
    trimmed.push(blank);
  }
  return trimmed;
}

export function calculateOfferTotals(input: {
  validItems: OfferLineItemForm[];
  usePerItemDiscount: boolean;
  useGlobalDiscount: boolean;
  globalDiscountPercent: number;
  vatMode: 0 | 9.5 | 22;
}) {
  const baseWithoutVat = input.validItems.reduce(
    (acc, item) => acc + item.quantity * item.unitPrice,
    0
  );

  const perItemDiscountAmount = input.usePerItemDiscount
    ? input.validItems.reduce(
        (acc, item) =>
          acc + item.quantity * item.unitPrice * ((item.discountPercent ?? 0) / 100),
        0
      )
    : 0;

  const baseAfterPerItem = Number((baseWithoutVat - perItemDiscountAmount).toFixed(2));
  const normalizedDiscount = input.useGlobalDiscount
    ? Math.min(100, Math.max(0, input.globalDiscountPercent || 0))
    : 0;
  const globalDiscountAmount = Number((baseAfterPerItem * (normalizedDiscount / 100)).toFixed(2));
  const baseAfterDiscount = Number((baseAfterPerItem - globalDiscountAmount).toFixed(2));
  const vatRate = input.vatMode === 22 ? 0.22 : input.vatMode === 9.5 ? 0.095 : 0;
  const vatAmount = Number((baseAfterDiscount * vatRate).toFixed(2));
  const totalWithVat = Number((baseAfterDiscount + vatAmount).toFixed(2));

  return {
    baseWithoutVat,
    perItemDiscountAmount,
    globalDiscountAmount,
    baseAfterDiscount,
    vatAmount,
    totalWithVat,
  };
}

export const resolveUnitFromName = (name: string) => {
  const normalized = name.trim();
  const match = normalized.match(/\[([^\]]+)\]\s*\*?\s*$/);
  const raw = match?.[1]?.trim();
  if (!raw) return "kos";

  const withoutCurrency = raw.replace(/[€$£]/g, "").trim();
  const slashParts = withoutCurrency.split("/").map((part) => part.trim()).filter(Boolean);
  const candidate = (slashParts[slashParts.length - 1] ?? withoutCurrency).toLowerCase();
  return candidate || "kos";
};

export function createOfferEditorSnapshot(input: {
  title: string;
  paymentTerms: string | null;
  comment: string | null;
  selectedNoteIds: string[];
  items: OfferLineItemForm[];
  useGlobalDiscount: boolean;
  usePerItemDiscount: boolean;
  vatMode: 0 | 9.5 | 22;
  globalDiscountPercent: number;
}) {
  const cleanItems = input.items
    .filter((i) => !isEmptyOfferItem(i))
    .filter((i) => i.name.trim() !== "" && i.unitPrice > 0)
    .map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name.trim(),
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitPrice,
      vatRate: i.vatRate,
      totalNet: i.totalNet,
      totalVat: i.totalVat,
      totalGross: i.totalGross,
      discountPercent: input.usePerItemDiscount ? i.discountPercent ?? 0 : 0,
    }));

  return JSON.stringify({
    title: input.title.trim() || "Ponudba",
    paymentTerms: input.paymentTerms ?? "",
    comment: input.comment ?? "",
    selectedNoteIds: input.selectedNoteIds,
    items: cleanItems,
    discountPercent: input.useGlobalDiscount ? input.globalDiscountPercent : 0,
    globalDiscountPercent: input.useGlobalDiscount ? input.globalDiscountPercent : 0,
    useGlobalDiscount: input.useGlobalDiscount,
    usePerItemDiscount: input.usePerItemDiscount,
    vatMode: input.vatMode,
  });
}

export const EMPTY_OFFER_SNAPSHOT = createOfferEditorSnapshot({
  title: "Ponudba",
  paymentTerms: "",
  comment: "",
  selectedNoteIds: [],
  items: [],
  useGlobalDiscount: false,
  usePerItemDiscount: false,
  vatMode: 22,
  globalDiscountPercent: 0,
});

export const sanitizeFilenamePart = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const buildOfferPdfFilename = (
  project: ProjectDetails | null,
  fallbackId: string,
  prefix: string,
  offer: Pick<OfferVersion, "baseTitle" | "title" | "documentNumber"> | null
) => {
  const identifierRaw = (project?.projectNumber != null ? `${project.projectNumber}` : project?.code || project?.id || fallbackId || "")
    .trim()
    .replace(/^PRJ-/i, "");
  const offerTitleRaw = offer?.baseTitle?.trim() || offer?.title?.trim() || "Ponudba";
  const customerRaw =
    project?.customerDetail?.name?.trim() ||
    project?.customer?.trim() ||
    offer?.documentNumber?.trim() ||
    "";
  const identifier = sanitizeFilenamePart(identifierRaw || fallbackId) || "projekt";
  const suffix = [offerTitleRaw, customerRaw].map(sanitizeFilenamePart).filter(Boolean).join(" - ");
  return `${prefix}-${identifier} - ${suffix || sanitizeFilenamePart(fallbackId) || "Ponudba"}.pdf`;
};
