export type DerivedProjectPhase = "zahteve" | "ponudbe" | "priprava" | "izvedba" | "racun";

function normalizeStatus(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    : "";
}

export function deriveProjectPhase(project: any): DerivedProjectPhase {
  const status = normalizeStatus(project?.status);
  if (status === "invoiced" || status === "zaracunano") return "racun";
  if (status === "in-progress" || status === "completed") return "izvedba";
  if (status === "ordered" || status === "confirmed") return "priprava";
  if (status === "offered") return "ponudbe";
  return "zahteve";
}
