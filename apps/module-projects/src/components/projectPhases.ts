import { ProjectStatus, ProjectSummary } from "../types";

export type ProjectPhase = "zahteve" | "ponudbe" | "priprava" | "izvedba" | "predaja" | "racun";

export type PhaseDefinition = {
  id: ProjectPhase;
  label: string;
  color: string;
  statuses: ProjectStatus[];
};

export const phaseDefinitions: PhaseDefinition[] = [
  { id: "zahteve", label: "Zahteve", color: "#888780", statuses: ["draft"] },
  { id: "ponudbe", label: "Ponudbe", color: "#185FA5", statuses: ["offered"] },
  { id: "priprava", label: "Priprava", color: "#BA7517", statuses: ["ordered"] },
  { id: "izvedba", label: "Izvedba", color: "#534AB7", statuses: ["in-progress"] },
  { id: "predaja", label: "Predaja", color: "#0F766E", statuses: ["completed"] },
  { id: "racun", label: "Račun", color: "#085041", statuses: ["completed", "invoiced"] },
];

const statusToPhase: Record<ProjectStatus, ProjectPhase> = {
  draft: "zahteve",
  offered: "ponudbe",
  ordered: "priprava",
  "in-progress": "izvedba",
  completed: "predaja",
  invoiced: "racun",
};

export function deriveProjectPhase(project: ProjectSummary): ProjectPhase {
  const signals = project.phaseSignals;

  if (signals?.hasIssuedInvoice || project.status === "invoiced") return "racun";
  if (signals?.hasSignedDelivery || signals?.allExecutionUnitsCompleted) return "predaja";
  if (signals?.hasWorkOrder) return "izvedba";
  if (signals?.hasConfirmedOffer || project.status === "ordered" || project.status === "in-progress") return "priprava";
  if (signals?.hasOffers || project.status === "offered") return "ponudbe";
  return statusToPhase[project.status] ?? "zahteve";
}

export function getProjectPhase(project: ProjectSummary): ProjectPhase {
  return deriveProjectPhase(project);
}

export function getStatusForPhase(phase: ProjectPhase): ProjectStatus {
  if (phase === "zahteve") return "draft";
  if (phase === "ponudbe") return "offered";
  if (phase === "priprava") return "ordered";
  if (phase === "izvedba") return "in-progress";
  return "completed";
}

export function getPhaseProgress(project: ProjectSummary, phase: ProjectPhase): number {
  if (phase === "zahteve") return project.status === "draft" ? 20 : 100;
  if (phase === "ponudbe") {
    if (project.status === "offered") return 75;
    if (project.status === "ordered" || project.status === "in-progress" || project.status === "completed" || project.status === "invoiced") return 100;
    return 25;
  }
  if (phase === "priprava") {
    const derivedPhase = deriveProjectPhase(project);
    if (derivedPhase === "priprava") return 66;
    if (["izvedba", "predaja", "racun"].includes(derivedPhase)) return 100;
    return 33;
  }
  if (phase === "izvedba") {
    const derivedPhase = deriveProjectPhase(project);
    if (derivedPhase === "izvedba") return 70;
    if (derivedPhase === "predaja" || derivedPhase === "racun") return 100;
    return 10;
  }
  if (phase === "predaja") {
    const derivedPhase = deriveProjectPhase(project);
    if (derivedPhase === "racun") return 100;
    return 85;
  }
  return project.status === "invoiced" ? 100 : 85;
}
