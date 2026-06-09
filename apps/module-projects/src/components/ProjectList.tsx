import { Archive, CalendarDays, CheckCircle2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
  onArchiveProject?: (project: ProjectSummary) => void;
  onUnarchiveProject?: (project: ProjectSummary) => void;
  onCloseProject?: (project: ProjectSummary) => void;
  onReopenProject?: (project: ProjectSummary) => void;
  readOnly?: boolean;
  hideFilters?: boolean;
  hideFinancials?: boolean;
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

const statusSortOrder: Record<ProjectStatus, number> = {
  draft: 0,
  offered: 1,
  ordered: 2,
  "in-progress": 3,
  completed: 4,
  invoiced: 5,
};

type SortColumn = "projekt" | "stranka" | "status" | "ponudba" | "racuni" | "datum";
type SortDir = "asc" | "desc";

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

function compareText(a?: string, b?: string) {
  return (a ?? "").localeCompare(b ?? "", "sl", { sensitivity: "base" });
}

function getDateValue(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function canCloseProject(project: ProjectSummary) {
  return project.status === "invoiced" || project.phaseSignals?.hasIssuedInvoice === true;
}

const lifecycleButtonClasses =
  "inline-flex h-8 w-8 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function ProjectList({
  projects,
  onSelectProject,
  categories,
  onEditProject,
  onDeleteProject,
  onArchiveProject,
  onUnarchiveProject,
  onCloseProject,
  onReopenProject,
  readOnly = false,
  hideFilters = false,
  hideFinancials = false,
  filteredProjects: externalFilteredProjects,
}: ProjectListProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("datum");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => map.set(category.slug, category.name));
    return map;
  }, [categories]);

  const filteredProjects = externalFilteredProjects ?? projects;
  const sortedProjects = useMemo(() => {
    return [...filteredProjects].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "projekt":
          cmp = compareText(a.title, b.title);
          break;
        case "stranka":
          cmp = compareText(a.customer, b.customer);
          break;
        case "status":
          cmp = (statusSortOrder[a.status] ?? 0) - (statusSortOrder[b.status] ?? 0);
          break;
        case "ponudba":
          cmp = hideFinancials ? 0 : (a.quotedTotalWithVat ?? 0) - (b.quotedTotalWithVat ?? 0);
          break;
        case "racuni":
          cmp = hideFinancials ? 0 : (a.invoiceAmount ?? 0) - (b.invoiceAmount ?? 0);
          break;
        case "datum":
          cmp = getDateValue(a.createdAt) - getDateValue(b.createdAt);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredProjects, hideFinancials, sortColumn, sortDir]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDir(column === "datum" ? "desc" : "asc");
  };

  const renderSortableHeader = (column: SortColumn, label: string, className = "") => {
    const headerClassName = column === "racuni" && !className.includes("w-") ? `w-32 ${className}` : className;
    return hideFinancials && (column === "ponudba" || column === "racuni") ? null : <TableHead className={headerClassName}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 select-none font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-foreground ${
          headerClassName.includes("text-right") ? "w-full justify-end" : ""
        }`}
        onClick={() => handleSort(column)}
        aria-label={`Razvrsti po stolpcu ${label}`}
        aria-sort={sortColumn === column ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        <span>{label}</span>
        <span className="inline-block w-3 text-xs">{sortColumn === column ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</span>
      </button>
    </TableHead>;
  };

  const renderLifecycleActions = (project: ProjectSummary) => (
    <>
      {project.closedAt ? (
        <button
          type="button"
          className={lifecycleButtonClasses}
          onClick={() => onReopenProject?.(project)}
          title="Ponovno odpri projekt"
          aria-label={`Ponovno odpri ${project.title}`}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      ) : canCloseProject(project) ? (
        <button
          type="button"
          className={lifecycleButtonClasses}
          onClick={() => onCloseProject?.(project)}
          title="Zaključi projekt"
          aria-label={`Zaključi ${project.title}`}
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      ) : null}
      {project.archivedAt ? (
        <button
          type="button"
          className={lifecycleButtonClasses}
          onClick={() => onUnarchiveProject?.(project)}
          title="Vrni iz arhiva"
          aria-label={`Vrni iz arhiva ${project.title}`}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          className={lifecycleButtonClasses}
          onClick={() => onArchiveProject?.(project)}
          title="Arhiviraj projekt"
          aria-label={`Arhiviraj ${project.title}`}
        >
          <Archive className="h-4 w-4" />
        </button>
      )}
    </>
  );

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
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              {renderSortableHeader("projekt", "Projekt", hideFinancials ? "w-[38%]" : "w-[28%]")}
              {renderSortableHeader("stranka", "Stranka", hideFinancials ? "w-[24%]" : "w-[18%]")}
              {renderSortableHeader("status", "Status", "w-32")}
              {!hideFinancials ? renderSortableHeader("ponudba", "Ponudba", "w-32 text-right") : null}
              {renderSortableHeader("racuni", "Računi", "text-right")}
              {renderSortableHeader("datum", "Datum", "w-28")}
              {!readOnly ? <TableHead className="w-40 text-right">Akcije</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedProjects.map((project, index) => (
              <TableRow
                key={project._id ?? project.id ?? `${project.title}-${index}`}
                className="cursor-pointer"
                onClick={() => onSelectProject(project.id)}
              >
                <TableCell className="whitespace-normal align-top font-medium">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="break-words leading-5">{project.title}</span>
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
                <TableCell className="whitespace-normal align-top">
                  <span className="block break-words leading-5">{project.customer}</span>
                </TableCell>
                <TableCell className="align-top">
                  <Badge className={statusColors[project.status]}>{statusLabels[project.status]}</Badge>
                </TableCell>
                {!hideFinancials ? <TableCell className="text-right align-top">{formatAmount(project.quotedTotalWithVat)}</TableCell> : null}
                {!hideFinancials ? <TableCell className="text-right align-top">{formatAmount(project.invoiceAmount)}</TableCell> : null}
                <TableCell className="align-top">{formatDate(project.createdAt)}</TableCell>
                {!readOnly ? (
                  <TableCell className="text-right align-top" onClick={(event) => event.stopPropagation()}>
                    <div className="flex shrink-0 justify-end gap-1">
                      {renderLifecycleActions(project)}
                      <TableRowActions
                        onEdit={() => onEditProject(project)}
                        onDelete={() => onDeleteProject(project)}
                        deleteConfirmTitle="Izbriši projekt"
                        deleteConfirmMessage="Si prepričan, da želiš izbrisati ta projekt? Tega dejanja ni mogoče razveljaviti."
                      />
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {sortedProjects.map((project, index) => (
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
                  {renderLifecycleActions(project)}
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

            {!hideFinancials ? <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-muted px-3 py-2">
                <div className="text-muted-foreground">Ponudba</div>
                <div className="font-semibold text-foreground">{formatAmount(project.quotedTotalWithVat)}</div>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2">
                <div className="text-muted-foreground">Računi</div>
                <div className="font-semibold text-foreground">{formatAmount(project.invoiceAmount)}</div>
              </div>
            </div> : null}

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
