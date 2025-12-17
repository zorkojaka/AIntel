import type { ProjectDetails } from "../../types";
import { OffersTab } from "../../components/OffersTab";

interface OffersPanelProps {
  project: ProjectDetails;
  refreshKey?: number;
}

export function OffersPanel({ project, refreshKey }: OffersPanelProps) {
  return <OffersTab projectId={project.id} refreshKey={refreshKey} />;
}
