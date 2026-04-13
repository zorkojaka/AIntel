import { ProjectStatus, ProjectSummary } from "../types";

export type ProjectPhase = "zahteve" | "ponudbe" | "priprava" | "izvedba" | "racun";

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
  { id: "racun", label: "Račun", color: "#085041", statuses: ["completed", "invoiced"] },
];

const statusToPhase: Record<ProjectStatus, ProjectPhase> = {
  draft: "zahteve",
  offered: "ponudbe",
  ordered: "priprava",
  "in-progress": "izvedba",
  completed: "racun",
  invoiced: "racun",
};

export function getProjectPhase(project: ProjectSummary): ProjectPhase {
  return statusToPhase[project.status];
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
    if (project.status === "ordered") return 66;
    if (project.status === "in-progress" || project.status === "completed" || project.status === "invoiced") return 100;
    return 33;
  }
  if (phase === "izvedba") {
    if (project.status === "in-progress") return 70;
    if (project.status === "completed" || project.status === "invoiced") return 100;
    return 10;
  }
  return project.status === "invoiced" ? 100 : 85;
}
