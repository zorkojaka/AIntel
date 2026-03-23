import { ArrowLeft, Plus, Save } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ProjectDetails, ProjectStatus } from "../../types";

export type ProjectHeaderProps = {
  project: ProjectDetails;
  status: ProjectStatus;
  onBack: () => void;
  onPrimaryAction: () => void;
  onNewProject: () => void;
  primaryActionLabel?: string;
};

const statusLabels: Record<ProjectStatus, string> = {
  draft: "Osnutek",
  offered: "Ponujeno",
  ordered: "Naročeno",
  "in-progress": "V teku",
  completed: "Zaključeno",
  invoiced: "Zaračunano",
};

const statusClasses: Record<ProjectStatus, string> = {
  draft: "project-status-chip project-status-chip--draft",
  offered: "project-status-chip project-status-chip--offered",
  ordered: "project-status-chip project-status-chip--ordered",
  "in-progress": "project-status-chip project-status-chip--in-progress",
  completed: "project-status-chip project-status-chip--completed",
  invoiced: "project-status-chip project-status-chip--invoiced",
};

export function ProjectHeader({
  project,
  status,
  onBack,
  onPrimaryAction,
  onNewProject,
  primaryActionLabel = "Shrani",
}: ProjectHeaderProps) {
  return (
    <div className="sticky top-0 z-20 hidden border-b bg-card md:block">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Nazaj na projekte">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="m-0 truncate">{project.title}</h1>
              <Badge className={statusClasses[status]}>{statusLabels[status]}</Badge>
            </div>
            <p className="m-0 text-sm text-muted-foreground">ID: {project.id}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onNewProject}>
            <Plus className="mr-2 h-4 w-4" />
            Nov projekt
          </Button>
          <Button variant="outline" onClick={onPrimaryAction}>
            <Save className="mr-2 h-4 w-4" />
            {primaryActionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
