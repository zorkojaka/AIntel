import type { CenikProduct } from "../../api";
import type { Zahteva } from "../../types";

export type ZahtevaSistem = Zahteva["sistemi"][number];
export type Videonadzor = NonNullable<ZahtevaSistem["videonadzor"]>;
export type AsortimaVariant = Videonadzor["asortima"][number];
export type Lokacija = Videonadzor["lokacije"][number];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function nextSystemId(sistemi: Zahteva["sistemi"]) {
  return `sys-${sistemi.length + 1}`;
}

export function nextVariantId(existing: AsortimaVariant[]) {
  for (const letter of LETTERS) {
    if (!existing.some((entry) => entry.id === letter)) return letter;
  }
  return `V${existing.length + 1}`;
}

export function createVideonadzorSystem(id: string): ZahtevaSistem {
  return {
    id,
    tip: "videonadzor",
    steviloLokacij: 1,
    videonadzor: {
      asortima: [],
      lokacije: [{ id: "loc-1", ime: "Lokacija 1", asortimaIdAssigned: null }],
      snemalnik: { productId: null },
      poeSwitch: { productId: null },
      disk: { productId: null, dniSnemanja: 30, motionRecord: false },
      dodatnaOprema: [],
      montaza: { vkljuceno: false, napeljava: false, metrov: 0, zascitniMaterial: null },
    },
  };
}

export function syncLokacije(videonadzor: Videonadzor, targetCount: number): Videonadzor {
  const nextCount = Math.max(1, Math.min(64, Math.round(targetCount)));
  let lokacije = [...videonadzor.lokacije];
  if (nextCount > lokacije.length) {
    for (let index = lokacije.length; index < nextCount; index += 1) {
      lokacije.push({ id: `loc-${index + 1}`, ime: `Lokacija ${index + 1}`, asortimaIdAssigned: null });
    }
  } else if (nextCount < lokacije.length) {
    const empty = lokacije.filter((lokacija) => !lokacija.ime.trim() || /^Lokacija \d+$/i.test(lokacija.ime.trim()));
    const filled = lokacije.filter((lokacija) => !empty.includes(lokacija));
    lokacije = [...filled, ...empty].slice(0, nextCount);
  }
  return { ...videonadzor, lokacije };
}

export function assignmentCount(videonadzor: Videonadzor, variantId: string) {
  return videonadzor.lokacije.filter((lokacija) => lokacija.asortimaIdAssigned === variantId).length;
}

export function productLabel(product?: CenikProduct | null) {
  return product?.ime ?? "Ni izbrano";
}

export function formatPrice(value: number | undefined) {
  return `${Number(value ?? 0).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function systemTotal(videonadzor: Videonadzor, productById: Map<string, CenikProduct>) {
  const asortimaTotal = videonadzor.asortima.reduce((sum, variant) => {
    const qty = assignmentCount(videonadzor, variant.id);
    const camera = productById.get(variant.kameraProductId);
    const bracket = variant.nosilecProductId ? productById.get(variant.nosilecProductId) : null;
    return sum + qty * (Number(camera?.prodajnaCena ?? 0) + Number(bracket?.prodajnaCena ?? 0));
  }, 0);
  const snemalnik = videonadzor.snemalnik.productId ? productById.get(videonadzor.snemalnik.productId) : null;
  const poeSwitch = videonadzor.poeSwitch.productId ? productById.get(videonadzor.poeSwitch.productId) : null;
  const disk = videonadzor.disk.productId ? productById.get(videonadzor.disk.productId) : null;
  return asortimaTotal + Number(snemalnik?.prodajnaCena ?? 0) + Number(poeSwitch?.prodajnaCena ?? 0) + Number(disk?.prodajnaCena ?? 0);
}

export function assignedCameraProducts(videonadzor: Videonadzor, productById: Map<string, CenikProduct>) {
  const byVariant = new Map(videonadzor.asortima.map((variant) => [variant.id, variant.kameraProductId]));
  const assigned = videonadzor.lokacije
    .map((lokacija) => (lokacija.asortimaIdAssigned ? byVariant.get(lokacija.asortimaIdAssigned) : null))
    .filter((id): id is string => Boolean(id))
    .map((id) => productById.get(id))
    .filter((product): product is CenikProduct => Boolean(product));
  return assigned.length > 0
    ? assigned
    : videonadzor.asortima.map((variant) => productById.get(variant.kameraProductId)).filter((product): product is CenikProduct => Boolean(product));
}

export function standardChannels(count: number) {
  return [4, 8, 16, 32, 64].find((value) => value >= count) ?? 64;
}

export function standardPorts(count: number) {
  return [0, 4, 8, 16, 24].find((value) => value >= count) ?? 24;
}

function bitrateForResolution(resolutionMP?: number) {
  if (!resolutionMP || resolutionMP <= 2) return 2;
  if (resolutionMP <= 4) return 4;
  if (resolutionMP <= 6) return 6;
  if (resolutionMP <= 8) return 8;
  return 10;
}

export function calculateDvcStorage(cameras: CenikProduct[], savingDays: number, motionRecord: boolean) {
  const totalMbps = cameras.reduce(
    (sum, camera) => sum + bitrateForResolution(camera.classification?.maxResolutionMP),
    0,
  );
  const dailyHours = motionRecord ? 12 : 24;
  const terabytes = (totalMbps * 1000 * 60 * 60 * dailyHours * savingDays) / 8 / 1000 / 1000 / 1000;
  const requiredTB = Number(terabytes.toFixed(2));
  const standardDisks = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
  const recommendedDiskTB = standardDisks.find((tb) => tb >= requiredTB) ?? Math.ceil(requiredTB);
  return { requiredTB, recommendedDiskTB, totalMbps: Number(totalMbps.toFixed(2)) };
}
