import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { TableRowActions } from "@aintel/ui";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Category, ProjectStatus, ProjectSummary } from "../types";

interface ProjectListProps {
  projects: ProjectSummary[];
  onSelectProject: (projectId: string) => void;
  categories: Category[];
  onEditProject: (project: ProjectSummary) => void;
  onDeleteProject: (project: ProjectSummary) => void;
  readOnly?: boolean;
  hideFilters?: boolean;
  filteredProjects?: ProjectSummary[];
}

const statusColors: Record<ProjectStatus, string> = {
  draft: "project-status-chip project-status-chip--draft",
  offered: "project-status-chip project-status-chip--offered",
  ordered: "project-status-chip project-status-chip--ordered",
  "in-progress": "project-status-chip project-status-chip--in-progress",
  completed: "project-status-chip project-status-chip--completed",
  invoiced: "project-status-chip project-status-chip--invoiced",
};

const statusLabels: Record<ProjectStatus, string> = {
  draft: "Osnutek",
  offered: "Ponujeno",
  ordered: "Naročeno",
  "in-progress": "V teku",
  completed: "Zaključeno",
  invoiced: "Zaračunano",
};

const numberFormatter = new Intl.NumberFormat("sl-SI", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatAmount(value: number) {
  return `${numberFormatter.format(Number.isFinite(value) ? value : 0)} EUR`;
}

function formatDate(value: string) {
  if (!value) return "Brez datuma";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("sl-SI");
}

export function ProjectList({
  projects,
  onSelectProject,
  categories,
  onEditProject,
  onDeleteProject,
  readOnly = false,
  hideFilters = false,
  filteredProjects: externalFilteredProjects,
}: ProjectListProps) {
  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => map.set(category.slug, category.name));
    return map;
  }, [categories]);

  const filteredProjects = externalFilteredProjects ?? projects;

  if (filteredProjects.length === 0) {
    return (
      <div className="space-y-4">
        {!hideFilters ? <div className="text-sm text-muted-foreground">Filtri so na voljo v glavi seznama.</div> : null}
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Ni najdenih projektov.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="projects-table-shell hidden rounded-[var(--radius-card)] border bg-card overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Projekt</TableHead>
              <TableHead>Stranka</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ponudba</TableHead>
              <TableHead className="text-right">Računi</TableHead>
              <TableHead>Datum</TableHead>
              {!readOnly ? <TableHead className="text-right">Akcije</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProjects.map((project, index) => (
              <TableRow
                key={project._id ?? project.id ?? `${project.title}-${index}`}
                className="cursor-pointer"
                onClick={() => onSelectProject(project.id)}
              >
                <TableCell className="font-medium">
                  <div className="flex flex-col gap-1">
                    <span>{project.title}</span>
                    {project.categories && project.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {project.categories.map((categoryId) => {
                          const label = categoryLookup.get(categoryId);
                          if (!label) return null;
                          return (
                            <Badge key={`${project.id}-${categoryId}`} variant="outline">
                              {label}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>{project.customer}</TableCell>
                <TableCell>
                  <Badge className={statusColors[project.status]}>{statusLabels[project.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">{formatAmount(project.quotedTotalWithVat)}</TableCell>
                <TableCell className="text-right">{formatAmount(project.invoiceAmount)}</TableCell>
                <TableCell>{formatDate(project.createdAt)}</TableCell>
                {!readOnly ? (
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    <TableRowActions
                      onEdit={() => onEditProject(project)}
                      onDelete={() => onDeleteProject(project)}
                      deleteConfirmTitle="Izbriši projekt"
                      deleteConfirmMessage="Si prepričan, da želiš izbrisati ta projekt? Tega dejanja ni mogoče razveljaviti."
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {filteredProjects.map((project, index) => (
          <article
            key={project._id ?? project.id ?? `${project.title}-${index}`}
            className="rounded-xl border border-border bg-card p-3 shadow-sm"
            onClick={() => onSelectProject(project.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start gap-2">
                  <h3 className="projects-mobile-card-title text-sm font-semibold leading-5 text-foreground">
                    {project.title}
                  </h3>
                </div>
                <p className="truncate text-xs text-muted-foreground">{project.customer}</p>
              </div>
              {!readOnly ? (
                <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onEditProject(project)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-foreground transition hover:border-primary hover:bg-muted"
                    aria-label={`Uredi ${project.title}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteProject(project)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                    aria-label={`Izbriši ${project.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className={statusColors[project.status]}>{statusLabels[project.status]}</Badge>
              {project.categories.slice(0, 3).map((categoryId) => {
                const label = categoryLookup.get(categoryId);
                if (!label) return null;
                return (
                  <Badge key={`${project.id}-${categoryId}`} variant="outline">
                    {label}
                  </Badge>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-muted px-3 py-2">
                <div className="text-muted-foreground">Ponudba</div>
                <div className="font-semibold text-foreground">{formatAmount(project.quotedTotalWithVat)}</div>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2">
                <div className="text-muted-foreground">Računi</div>
                <div className="font-semibold text-foreground">{formatAmount(project.invoiceAmount)}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{formatDate(project.createdAt)}</span>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectProject(project.id);
                }}
                className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow transition hover:bg-blue-600"
              >
                Odpri
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
