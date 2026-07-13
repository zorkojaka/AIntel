import type { CenikProduct } from "../../api";
import type { Zahteva } from "../../types";

export type ZahtevaSistem = Zahteva["sistemi"][number];
export type Videonadzor = NonNullable<ZahtevaSistem["videonadzor"]>;
export type Alarm = NonNullable<ZahtevaSistem["alarm"]>;
export type AsortimaVariant = Videonadzor["asortima"][number];
export type Lokacija = Videonadzor["lokacije"][number];
export type AlarmSenzor = Alarm["senzorji"][number];
export type AlarmLokacija = Alarm["lokacije"][number];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function nextSystemId(sistemi: Zahteva["sistemi"]) {
  return `sys-${sistemi.length + 1}`;
}

export function nextVariantId(existing: Array<{ id: string }>) {
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
      lokacije: [{ id: "loc-1", ime: "Lokacija 1", asortimaIdAssigned: null, slike: [] }],
      snemalnik: { productId: null },
      poeSwitch: { productId: null, kolicina: 0, items: [] },
      disk: { productId: null, kolicina: 0, items: [], dniSnemanja: 30, motionRecord: false },
      dodatnaOprema: [],
    },
    execution: {
      scenarioType: "posiljanje",
      estimates: { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0, kilometrinaKm: 0 },
    },
  };
}

export function createWifiKamereSystem(id: string): ZahtevaSistem {
  return {
    ...createVideonadzorSystem(id),
    tip: "wifi_kamere",
    videonadzor: {
      asortima: [],
      lokacije: [{ id: "loc-1", ime: "Lokacija 1", asortimaIdAssigned: null, slike: [] }],
      snemalnik: { productId: null },
      poeSwitch: { productId: null, kolicina: 0, items: [] },
      disk: { productId: null, kolicina: 0, items: [], dniSnemanja: 30, motionRecord: false },
      dodatnaOprema: [],
    },
  };
}

export function createAlarmSystem(id: string): ZahtevaSistem {
  return {
    id,
    tip: "alarm",
    steviloLokacij: 1,
    alarm: {
      senzorji: [],
      lokacije: [{ id: "loc-1", ime: "Lokacija 1", senzorIdAssigned: null, slike: [] }],
      centrala: { productId: null, autoSelected: true },
      upravljanje: [],
      sirene: [],
      pozarPoplava: [],
      dodatnaOprema: [],
    },
    execution: {
      scenarioType: "posiljanje",
      estimates: { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0, kilometrinaKm: 0 },
    },
  };
}

export function syncLokacije(videonadzor: Videonadzor, targetCount: number): Videonadzor {
  const nextCount = Math.max(1, Math.min(64, Math.round(targetCount)));
  let lokacije = [...videonadzor.lokacije];
  if (nextCount > lokacije.length) {
    for (let index = lokacije.length; index < nextCount; index += 1) {
      lokacije.push({ id: `loc-${index + 1}`, ime: `Lokacija ${index + 1}`, asortimaIdAssigned: null, slike: [] });
    }
  } else if (nextCount < lokacije.length) {
    const empty = lokacije.filter((lokacija) => !lokacija.ime.trim() || /^Lokacija \d+$/i.test(lokacija.ime.trim()));
    const filled = lokacije.filter((lokacija) => !empty.includes(lokacija));
    lokacije = [...filled, ...empty].slice(0, nextCount);
  }
  return { ...videonadzor, lokacije };
}

export function syncAlarmLokacije(alarm: Alarm, targetCount: number): Alarm {
  const nextCount = Math.max(1, Math.min(64, Math.round(targetCount)));
  let lokacije = [...alarm.lokacije];
  if (nextCount > lokacije.length) {
    for (let index = lokacije.length; index < nextCount; index += 1) {
      lokacije.push({ id: `loc-${index + 1}`, ime: `Lokacija ${index + 1}`, senzorIdAssigned: null, slike: [] });
    }
  } else if (nextCount < lokacije.length) {
    const empty = lokacije.filter((lokacija) => !lokacija.ime.trim() || /^Lokacija \d+$/i.test(lokacija.ime.trim()));
    const filled = lokacije.filter((lokacija) => !empty.includes(lokacija));
    lokacije = [...filled, ...empty].slice(0, nextCount);
  }
  return { ...alarm, lokacije };
}

export function assignmentCount(videonadzor: Videonadzor, variantId: string) {
  return videonadzor.lokacije.filter((lokacija) => lokacija.asortimaIdAssigned === variantId).length;
}

export function alarmAssignmentCount(alarm: Alarm, senzorId: string) {
  return alarm.lokacije.filter((lokacija) => lokacija.senzorIdAssigned === senzorId).length;
}

export function isDefaultLocationName(value?: string | null) {
  const normalized = (value ?? "").trim();
  return /^Lokacija\s+\d+$/i.test(normalized) || /^loc-\d+$/i.test(normalized);
}

export function isMeaningfulVideoLocation(lokacija: Lokacija) {
  return Boolean(lokacija.asortimaIdAssigned) || !isDefaultLocationName(lokacija.ime) || (lokacija.slike?.length ?? 0) > 0;
}

export function isMeaningfulAlarmLocation(lokacija: AlarmLokacija) {
  return Boolean(lokacija.senzorIdAssigned) || !isDefaultLocationName(lokacija.ime) || (lokacija.slike?.length ?? 0) > 0;
}

export function productLabel(product?: CenikProduct | null) {
  return product?.ime ?? "Ni izbrano";
}

// AIN-P1-16: lastna prodajna statistika (ECO-35) usmerja vrstni red in namig
// »najpogosteje izbrano« — zadnjih 365 dni ima prednost pred vsemi časi.
export function salesQty(product?: CenikProduct | null) {
  const stats = product?.salesStats;
  return Number(stats?.soldQty365 ?? 0) || Number(stats?.soldQty ?? 0) || 0;
}

export function salesCompare(a: CenikProduct, b: CenikProduct) {
  return salesQty(b) - salesQty(a);
}

export function topSellerId(products: CenikProduct[]) {
  let best: CenikProduct | null = null;
  for (const product of products) {
    if (salesQty(product) > 0 && (!best || salesQty(product) > salesQty(best))) best = product;
  }
  return best?._id ?? null;
}

export function formatPrice(value: number | undefined) {
  return `${Number(value ?? 0).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function variantColor(id: string) {
  const colors = ["#7c3aed", "#059669", "#d97706", "#2563eb", "#db2777", "#0f766e", "#9333ea", "#dc2626"];
  const index = Math.max(0, LETTERS.indexOf(id.charAt(0).toUpperCase()));
  return colors[index % colors.length];
}

export function systemTotal(videonadzor: Videonadzor, productById: Map<string, CenikProduct>) {
  const asortimaTotal = videonadzor.asortima.reduce((sum, variant) => {
    const qty = assignmentCount(videonadzor, variant.id);
    const camera = productById.get(variant.kameraProductId);
    const bracket = variant.nosilecProductId ? productById.get(variant.nosilecProductId) : null;
    return sum + qty * (Number(camera?.prodajnaCena ?? 0) + Number(bracket?.prodajnaCena ?? 0));
  }, 0);
  const snemalnik = videonadzor.snemalnik.productId ? productById.get(videonadzor.snemalnik.productId) : null;
  const switchItems = normalizedSelectedItems(videonadzor.poeSwitch);
  const diskItems = normalizedSelectedItems(videonadzor.disk);
  const switchTotal = switchItems.reduce((sum, item) => sum + Number(productById.get(item.productId)?.prodajnaCena ?? 0) * item.kolicina, 0);
  const diskTotal = diskItems.reduce((sum, item) => sum + Number(productById.get(item.productId)?.prodajnaCena ?? 0) * item.kolicina, 0);
  const dodatnaOpremaTotal = (videonadzor.dodatnaOprema ?? []).reduce((sum, item) => sum + Number(productById.get(item.productId)?.prodajnaCena ?? 0) * item.kolicina, 0);
  return asortimaTotal + Number(snemalnik?.prodajnaCena ?? 0) + switchTotal + diskTotal + dodatnaOpremaTotal;
}

export function alarmTotal(alarm: Alarm, productById: Map<string, CenikProduct>) {
  const sensorsTotal = alarm.senzorji.reduce((sum, senzor) => {
    const qty = alarmAssignmentCount(alarm, senzor.id);
    const product = productById.get(senzor.senzorProductId);
    return sum + qty * Number(product?.prodajnaCena ?? 0);
  }, 0);
  const centrala = alarm.centrala.productId ? productById.get(alarm.centrala.productId) : null;
  const equipment = [...alarm.upravljanje, ...alarm.sirene, ...alarm.pozarPoplava, ...(alarm.dodatnaOprema ?? [])];
  const equipmentTotal = equipment.reduce((sum, item) => sum + Number(productById.get(item.productId)?.prodajnaCena ?? 0) * item.kolicina, 0);
  return sensorsTotal + Number(centrala?.prodajnaCena ?? 0) + equipmentTotal;
}

export function normalizedSelectedItems(input?: { productId?: string | null; kolicina?: number; items?: Array<{ productId: string; kolicina: number }> }) {
  const items = (input?.items ?? [])
    .map((item) => ({ productId: item.productId, kolicina: Math.max(0, Number(item.kolicina) || 0) }))
    .filter((item) => item.productId && item.kolicina > 0);
  if (items.length > 0) return items;
  const qty = Math.max(0, Number(input?.kolicina ?? (input?.productId ? 1 : 0)) || 0);
  return input?.productId && qty > 0 ? [{ productId: input.productId, kolicina: qty }] : [];
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
