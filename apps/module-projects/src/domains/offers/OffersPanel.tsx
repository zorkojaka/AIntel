import type { ProjectDetails } from "../../types";
import { OffersTab } from "../../components/OffersTab";

interface OffersPanelProps {
  project: ProjectDetails;
  refreshProject: () => Promise<void>;
}

export function OffersPanel({ project }: OffersPanelProps) {
  return <OffersTab projectId={project.id} />;
}
