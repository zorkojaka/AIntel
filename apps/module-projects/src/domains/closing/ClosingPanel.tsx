import { Card } from "../../components/ui/card";
import type { ProjectDetails } from "../../types";

interface ClosingPanelProps {
  project: ProjectDetails;
}

export function ClosingPanel({ project }: ClosingPanelProps) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold">Zaključek projekta</h3>
      <p className="text-sm text-muted-foreground mt-2">
        Priprava zaključnih dokumentov in statistike za projekt {project.title} bo na voljo v naslednjih
        fazah.
      </p>
    </Card>
  );
}
