export const MATERIAL_STATUS_SEQUENCE = ["Naročeno", "Prevzeto", "Pripravljeno"] as const;

export type MaterialStatusSequence = typeof MATERIAL_STATUS_SEQUENCE[number];

const MATERIAL_STATUS_ALIASES: Record<string, MaterialStatusSequence> = {
  "Za naročit": "Naročeno",
};

export function normalizeMaterialStatusLabel(value?: string | null) {
  if (!value) return value ?? null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return MATERIAL_STATUS_ALIASES[trimmed] ?? trimmed;
}

export function getNextMaterialStatus(current?: string | null) {
  const normalized = normalizeMaterialStatusLabel(current);
  if (!normalized) return null;
  const index = MATERIAL_STATUS_SEQUENCE.findIndex((value) => value === normalized);
  if (index === -1 || index === MATERIAL_STATUS_SEQUENCE.length - 1) {
    return null;
  }
  return MATERIAL_STATUS_SEQUENCE[index + 1];
}
