import { useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { ProjectSummary } from "../types";
import { getPhaseProgress, getProjectPhase, getStatusForPhase, phaseDefinitions, ProjectPhase } from "./projectPhases";

interface ProjectKanbanProps {
  projects: ProjectSummary[];
  categoryLookup: Map<string, string>;
  onSelectProject: (projectId: string) => void;
  onProjectDrop: (projectId: string, nextStatus: ProjectSummary["status"]) => Promise<void>;
}

const currencyFormatter = new Intl.NumberFormat("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDate(value: string) {
  if (!value) return "Brez datuma";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("sl-SI");
}

function formatAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "–";
  return `${currencyFormatter.format(value)} EUR`;
}

export function ProjectKanban({ projects, categoryLookup, onSelectProject, onProjectDrop }: ProjectKanbanProps) {
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverPhase, setDragOverPhase] = useState<ProjectPhase | null>(null);

  const grouped = useMemo(() => {
    const initial = new Map<ProjectPhase, ProjectSummary[]>(phaseDefinitions.map((phase) => [phase.id, []]));
    projects.forEach((project) => {
      const phase = getProjectPhase(project);
      initial.get(phase)?.push(project);
    });
    return initial;
  }, [projects]);

  const summary = useMemo(() => {
    const inProgressPhases: ProjectPhase[] = ["zahteve", "ponudbe", "priprava", "izvedba"];
    const inProgress = projects
      .filter((project) => inProgressPhases.includes(getProjectPhase(project)))
      .reduce((sum, project) => sum + (Number.isFinite(project.offerAmount) ? project.offerAmount : 0), 0);
    const invoiced = projects
      .filter((project) => getProjectPhase(project) === "racun")
      .reduce((sum, project) => sum + (Number.isFinite(project.offerAmount) ? project.offerAmount : 0), 0);

    return {
      total: projects.length,
      inProgress,
      invoiced,
    };
  }, [projects]);

  return (
    <div className="space-y-3">
      <div className="kb-summary">
        <span className="kb-pill">Skupaj: {summary.total} projektov</span>
        <span className="kb-pill">V teku: {currencyFormatter.format(summary.inProgress)} €</span>
        <span className="kb-pill">Zaračunano: {currencyFormatter.format(summary.invoiced)} €</span>
      </div>
      <div className="kanban">
        {phaseDefinitions.map((phase) => {
          const phaseProjects = grouped.get(phase.id) ?? [];
          return (
            <section
              key={phase.id}
              className={`kb-col ${dragOverPhase === phase.id ? "is-over" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverPhase(phase.id);
              }}
              onDragLeave={() => setDragOverPhase((current) => (current === phase.id ? null : current))}
              onDrop={async (event) => {
                event.preventDefault();
                setDragOverPhase(null);
                if (!draggedProjectId) return;
                await onProjectDrop(draggedProjectId, getStatusForPhase(phase.id));
                setDraggedProjectId(null);
              }}
            >
              <header className="kb-header" style={{ borderTopColor: phase.color }}>
                <strong>{phase.label}</strong>
                <span className="text-xs text-muted-foreground">{phaseProjects.length}</span>
              </header>
              <div className="space-y-2 p-2">
                {phaseProjects.map((project) => {
                  const progress = getPhaseProgress(project, phase.id);
                  return (
                    <article
                      key={project.id}
                      className="kb-card"
                      draggable={true}
                      onDragStart={() => setDraggedProjectId(project.id)}
                      onDragEnd={() => {
                        setDraggedProjectId(null);
                        setDragOverPhase(null);
                      }}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <strong className="text-sm leading-5">{project.title}</strong>
                        <span className="text-xs text-muted-foreground">{formatDate(project.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{project.customer}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {project.categories.map((categorySlug) => {
                          const label = categoryLookup.get(categorySlug);
                          if (!label) return null;
                          return (
                            <Badge key={`${project.id}-${categorySlug}`} variant="outline">
                              {label}
                            </Badge>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Ponudba</span>
                        <span>{formatAmount(project.offerAmount)}</span>
                      </div>
                      <div className="kb-card-progress" style={{ width: `${progress}%`, backgroundColor: phase.color }} />
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
