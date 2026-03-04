import type { OfferCandidate, ProjectOfferItem } from "./types";

export async function fetchRequirementVariants(categorySlug?: string) {
  const query = categorySlug ? `?categorySlug=${encodeURIComponent(categorySlug)}` : "";
  const response = await fetch(`/api/requirement-templates/variants${query}`);
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.error ?? "Ne morem pridobiti variant.");
  }
  return (payload.data ?? []) as { variantSlug: string; label: string }[];
}

export async function fetchOfferCandidates(projectId: string): Promise<OfferCandidate[]> {
  const response = await fetch(`/api/projects/${projectId}/offer-candidates`);
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.error ?? "Ne morem generirati ponudbe iz zahtev.");
  }
  return payload.data ?? [];
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
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.error ?? "Napaka pri nalaganju cenika.");
  }
  return (payload.data ?? []).map((p: any) => ({
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
