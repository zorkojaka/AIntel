import { deriveProjectPhase, type DerivedProjectPhase } from "@aintel/shared/utils/deriveProjectPhase";
import { ProjectStatus, ProjectSummary } from "../types";

export type ProjectPhase = DerivedProjectPhase;

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
  { id: "izvedba", label: "Izvedba", color: "#534AB7", statuses: ["in-progress", "completed"] },
  { id: "racun", label: "Račun", color: "#085041", statuses: ["invoiced"] },
];

export function getProjectPhase(project: ProjectSummary): ProjectPhase {
  return deriveProjectPhase(project);
}

export function getStatusForPhase(phase: ProjectPhase): ProjectStatus {
  if (phase === "zahteve") return "draft";
  if (phase === "ponudbe") return "offered";
  if (phase === "priprava") return "ordered";
  if (phase === "izvedba") return "in-progress";
  if (phase === "racun") return "invoiced";
  return "draft";
}

export function getPhaseProgress(project: ProjectSummary, phase: ProjectPhase): number {
  const derivedPhase = deriveProjectPhase(project);

  if (phase === "zahteve") return derivedPhase === "zahteve" ? 20 : 100;
  if (phase === "ponudbe") {
    if (derivedPhase === "ponudbe") return 75;
    if (["priprava", "izvedba", "racun"].includes(derivedPhase)) return 100;
    return 25;
  }
  if (phase === "priprava") {
    if (derivedPhase === "priprava") return 66;
    if (["izvedba", "racun"].includes(derivedPhase)) return 100;
    return 33;
  }
  if (phase === "izvedba") {
    if (derivedPhase === "izvedba") return 70;
    if (derivedPhase === "racun") return 100;
    return 10;
  }
  return derivedPhase === "racun" ? 100 : 85;
}
