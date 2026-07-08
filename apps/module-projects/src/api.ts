import type { OfferCandidate, ProjectOfferItem, Zahteva } from "./types";
import { parseApiEnvelope } from "@aintel/shared/utils/api-client";

export async function fetchRequirementVariants(categorySlug?: string) {
  const query = categorySlug ? `?categorySlug=${encodeURIComponent(categorySlug)}` : "";
  const response = await fetch(`/api/requirement-templates/variants${query}`);
  return parseApiResponse<{ variantSlug: string; label: string }[]>(response, "Ne morem pridobiti variant.");
}

export async function fetchOfferCandidates(projectId: string): Promise<OfferCandidate[]> {
  const response = await fetch(`/api/projects/${projectId}/offer-candidates`);
  return parseApiResponse<OfferCandidate[]>(response, "Ne morem generirati ponudbe iz zahtev.");
}

export type ProductLookup = {
  id: string;
  name: string;
  price: number;
  vatRate?: number;
  unit?: string;
  sku?: string;
  categorySlugs?: string[];
};

export async function fetchProductsByCategories(categorySlugs: string[]): Promise<ProductLookup[]> {
  const unique = Array.from(new Set(categorySlugs.filter(Boolean)));
  if (!unique.length) return [];
  const query = `?suggestForCategories=${encodeURIComponent(unique.join(","))}`;
  const response = await fetch(`/api/cenik/products${query}`);
  const products = await parseApiResponse<any[]>(response, "Napaka pri nalaganju cenika.");
  return products.map((p: any) => ({
    id: p._id ?? p.id,
    name: p.ime ?? p.name ?? "Neimenovan produkt",
    price: Number(p.prodajnaCena ?? 0),
    vatRate: typeof p.vatRate === "number" ? p.vatRate : 22,
    unit: p.unit ?? "kos",
    sku: p.sku ?? p._id ?? p.id,
    categorySlugs: p.categorySlugs ?? [],
  }));
}

export async function downloadPdf(url: string, filename: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = 'Ne morem prenesti PDF-ja.';
    try {
      const text = await response.text();
      message = text || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(objectUrl);
}

export type ProjectKmCalculation = {
  razdaljaEnosmerno: number;
  razdaljaSkupaj: number;
  zanesljivost: "visoka" | "srednja" | "nizka";
  zanesljivostProcent?: number;
  razlog?: string;
  naslovPodjetje: string;
  naslovProjekt: string;
};

export type RouteCalculationSettings = {
  routeCalculationAddress?: string;
  orsApiConfigured?: boolean;
};

export async function fetchRouteCalculationSettings(): Promise<RouteCalculationSettings> {
  const response = await fetch("/api/settings");
  return parseApiResponse<RouteCalculationSettings>(response, "Nastavitev kilometrine ni mogoče pridobiti.");
}

export async function calculateProjectKm(projectId: string): Promise<ProjectKmCalculation> {
  const response = await fetch(`/api/projects/${projectId}/izracunaj-km`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return parseApiResponse<ProjectKmCalculation>(response, "Kilometrine ni mogoče izračunati.");
}

export type ExecutionQuantityRule = {
  type: "fixed" | "per_unit" | "per_classification_field";
  value?: number;
  field?: string;
};

export type ExecutionScenario = {
  type: "posiljanje" | "izvedba" | "izvedba_napeljava";
  ime: string;
  storitve: Array<{
    id: string;
    serviceProductId: string;
    quantityRule: ExecutionQuantityRule;
    description?: string;
  }>;
  defaultEstimates?: {
    napeljavaUrPerKamera: number;
    utpKabelMetrovPerKamera: number;
    kanalMetrovPerKamera: number;
    kilometrinaKm?: number;
  };
};

export type ProductServiceExecutionRule = {
  id: string;
  triggerType: "product" | "classification" | "category" | "project";
  triggerValue: string;
  triggerField?: string;
  triggerFieldValue?: string;
  serviceProductId: string;
  quantityRule: ExecutionQuantityRule;
  isActive: boolean;
};

export type ExecutionRuleSettings = {
  id: string | null;
  tenantId: string;
  productServiceRules: ProductServiceExecutionRule[];
  scenarios: ExecutionScenario[];
  isConfigured: boolean;
};

export async function fetchExecutionRuleSettings(): Promise<ExecutionRuleSettings> {
  const response = await fetch("/api/execution-rules");
  return parseApiResponse<ExecutionRuleSettings>(response, "Pravil izvedbe ni mogoče pridobiti.");
}

export async function fetchPredlogSnemalnik(input: {
  kanali: number;
  brand?: string;
  poe?: boolean;
}): Promise<CenikProduct | null> {
  const params = new URLSearchParams();
  params.set("kanali", String(input.kanali));
  if (input.brand) params.set("brand", input.brand);
  if (input.poe !== undefined) params.set("poe", String(input.poe));
  const response = await fetch(`/api/zahteve/predlogi/snemalnik?${params.toString()}`);
  return parseApiResponse<CenikProduct | null>(response, "Predloga snemalnika ni mogoče pridobiti.");
}

export async function fetchPredlogSwitch(portov: number): Promise<CenikProduct | null> {
  const response = await fetch(`/api/zahteve/predlogi/switch?portov=${encodeURIComponent(String(portov))}`);
  return parseApiResponse<CenikProduct | null>(response, "Predloga PoE switcha ni mogoče pridobiti.");
}

export async function fetchPredlogDisk(input: {
  tb?: number;
  cameraIds?: string[];
  dni?: number;
  motionRecord?: boolean;
}): Promise<CenikProduct | null | { storage: { requiredTB: number; recommendedDiskTB: number; totalMbps: number }; product: CenikProduct | null }> {
  const params = new URLSearchParams();
  if (input.cameraIds?.length) params.set("cameraIds", input.cameraIds.join(","));
  if (input.dni) params.set("dni", String(input.dni));
  if (input.motionRecord !== undefined) params.set("motionRecord", String(input.motionRecord));
  if (input.tb !== undefined) params.set("tb", String(input.tb));
  params.set("surveillance", "true");
  const response = await fetch(`/api/zahteve/predlogi/disk?${params.toString()}`);
  return parseApiResponse(response, "Predloga diska ni mogoče pridobiti.");
}

export async function nadaljujZahtevaNaPonudbo(id: string): Promise<any> {
  const response = await fetch(`/api/zahteve/${id}/nadaljuj`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return parseApiResponse<any>(response, "Zahteve ni mogoče zaključiti.");
}

const parseApiResponse = parseApiEnvelope;

export async function fetchZahteva(id: string): Promise<Zahteva> {
  const response = await fetch(`/api/zahteve/${id}`);
  return parseApiResponse<Zahteva>(response, "Zahteve ni mogoče pridobiti.");
}

export async function createZahteva(input: { projectId: string; sistemi?: Zahteva["sistemi"] }): Promise<Zahteva> {
  const response = await fetch("/api/zahteve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseApiResponse<Zahteva>(response, "Zahteve ni mogoče ustvariti.");
}

export async function updateZahteva(id: string, changes: Partial<Zahteva>): Promise<Zahteva> {
  const response = await fetch(`/api/zahteve/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  return parseApiResponse<Zahteva>(response, "Zahteve ni mogoče shraniti.");
}

export type CenikProduct = {
  _id: string;
  externalId?: string;
  externalKey?: string;
  ime: string;
  prodajnaCena: number;
  kratekOpis?: string;
  dolgOpis?: string;
  povezavaDoSlike?: string;
  aaData?: {
    productCode?: string;
    image?: string;
    rawDescription?: string;
  };
  proizvajalec?: string;
  categorySlugs?: string[];
  classification?: {
    productType?: "kamera" | "snemalnik" | "switch" | "disk" | "nosilec" | "kabel" | "pribor" | "storitev" | "alarm_komponenta" | "drugo";
    manufacturer?: string;
    cameraConnectivity?: "wifi" | "poe" | "lte";
    powerMode?: "dc" | "poe" | "battery";
    hasSim?: boolean;
    supportsSolarPanel?: boolean;
    cameraTechnology?: "IP video" | "AHD" | "Analog";
    cameraHousing?: "Bullet" | "Turret" | "Dome" | "PTZ" | "Panoramic" | "Fisheye" | "Thermal";
    maxResolutionMP?: number;
    hasPoE?: boolean;
    lensFocalLength?: string;
    irRangeM?: number;
    nvrChannels?: number;
    nvrHasPoE?: boolean;
    poePortCount?: number;
    switchSpeed?: "megabit" | "gigabit";
    diskCapacityTB?: number;
    isSurveillanceDisk?: boolean;
    compatibleBracketCodes?: string[];
    bracketCodeOwn?: string;
  };
  categoryPriority?: 1 | 2 | 3 | null;
};

export function getProductImageUrl(product?: Pick<CenikProduct, "aaData" | "povezavaDoSlike"> | null) {
  return product?.aaData?.image?.trim() || product?.povezavaDoSlike?.trim() || "";
}

export async function fetchCenikProducts(): Promise<CenikProduct[]> {
  const response = await fetch("/api/cenik/products");
  return parseApiResponse<CenikProduct[]>(response, "Cenika ni mogoče pridobiti.");
}

export async function fetchKompatibilniNosilci(kameraId: string): Promise<CenikProduct[]> {
  const response = await fetch(`/api/zahteve/predlogi/nosilci?kameraId=${encodeURIComponent(kameraId)}`);
  return parseApiResponse<CenikProduct[]>(response, "Nosilcev ni mogoče pridobiti.");
}
