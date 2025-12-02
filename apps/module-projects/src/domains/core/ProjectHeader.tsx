import { ArrowLeft, Save } from "lucide-react";
import { ProjectDetails, ProjectStatus } from "../../types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

export type ProjectHeaderProps = {
  project: ProjectDetails;
  status: ProjectStatus;
  onStatusChange: (value: string) => void;
  onBack: () => void;
  onRefresh: () => void;
};

export function ProjectHeader({ project, status, onStatusChange, onBack, onRefresh }: ProjectHeaderProps) {
  return (
    <div className="border-b bg-card sticky top-0 z-10">
      <div className="max-w-[1280px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onRefresh}>
              <Save className="w-4 h-4 mr-2" />
              Osveži
            </Button>
            <Select value={status} onValueChange={onStatusChange}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Osnutek</SelectItem>
                <SelectItem value="offered">Ponujeno</SelectItem>
                <SelectItem value="ordered">Naročeno</SelectItem>
                <SelectItem value="in-progress">V teku</SelectItem>
                <SelectItem value="completed">Zaključeno</SelectItem>
                <SelectItem value="invoiced">Zaračunano</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
