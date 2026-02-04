import { ArrowLeft, Plus, Save } from "lucide-react";
import { ProjectDetails, ProjectStatus } from "../../types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

export type ProjectHeaderProps = {
  project: ProjectDetails;
  status: ProjectStatus;
  onBack: () => void;
  onRefresh: () => void;
  onNewProject: () => void;
};

export function ProjectHeader({ project, status, onBack, onRefresh, onNewProject }: ProjectHeaderProps) {
  return (
    <div className="border-b bg-card">
      <div className="max-w-[1280px] mx-auto px-6 py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Nazaj na projekte">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="m-0">{project.title}</h1>
                <Badge
                  className={
                    status === "draft"
                      ? "bg-gray-100 text-gray-700"
                      : status === "offered"
                        ? "bg-blue-100 text-blue-700"
                        : status === "ordered"
                          ? "bg-purple-100 text-purple-700"
                          : status === "in-progress"
                            ? "bg-yellow-100 text-yellow-700"
                            : status === "completed"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                  }
                >
                  {status === "draft"
                    ? "Osnutek"
                    : status === "offered"
                      ? "Ponujeno"
                      : status === "ordered"
                        ? "Naročeno"
                        : status === "in-progress"
                          ? "V teku"
                          : status === "completed"
                            ? "Zaključeno"
                            : status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground m-0">ID: {project.id}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onNewProject}>
              <Plus className="mr-2 h-4 w-4" />
              Nov projekt
            </Button>
            <Button variant="outline" onClick={onRefresh}>
              <Save className="w-4 h-4 mr-2" />
              Osveži
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
