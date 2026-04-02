import type { ProjectDetails } from "../../types";
import { OffersTab } from "../../components/OffersTab";

interface OffersPanelProps {
  project: ProjectDetails;
  refreshKey?: number;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
  onCommunicationChanged?: () => void;
}

export function OffersPanel({
  project,
  refreshKey,
  onDirtyChange,
  onRegisterSaveHandler,
  onCommunicationChanged,
}: OffersPanelProps) {
  return (
    <OffersTab
      projectId={project.id}
      refreshKey={refreshKey}
      onDirtyChange={onDirtyChange}
      onRegisterSaveHandler={onRegisterSaveHandler}
      onCommunicationChanged={onCommunicationChanged}
    />
  );
}
