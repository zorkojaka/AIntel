import { CheckCircle2, Circle, Dot } from "lucide-react";
import type { ProjectDetails } from "../../types";
import { useProjectTimeline, StepKey, StepStatus } from "./useProjectTimeline";

type ProjectQuickNavProps = {
  project: ProjectDetails;
  activeStep: StepKey;
  onSelectStep: (key: StepKey) => void;
};

const statusStyles: Record<StepStatus, string> = {
  done: "bg-emerald-500 text-white",
  inProgress: "bg-amber-400 text-amber-950",
  pending: "bg-gray-200 text-gray-600",
};

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
  if (status === "inProgress") {
    return <Dot className="h-4 w-4" />;
  }
  return <Circle className="h-3.5 w-3.5" />;
}

export function ProjectQuickNav({ project, activeStep, onSelectStep }: ProjectQuickNavProps) {
  const steps = useProjectTimeline(project);

  return (
    <nav className="space-y-1">
      {steps.map((step) => {
        const isActive = step.key === activeStep;
        const metaText = typeof step.meta === "string" ? step.meta.trim() : "";
        const logisticsSummary = step.key === "logistics" ? step.logisticsSummary : undefined;
        const circleClass =
          logisticsSummary != null
            ? logisticsSummary.done
              ? statusStyles.done
              : logisticsSummary.material.level === "none" && logisticsSummary.workOrder.level === "none"
                ? statusStyles.pending
                : statusStyles.inProgress
            : statusStyles[step.status];

        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onSelectStep(step.key)}
            className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between gap-3 transition-colors ${
              isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border border-white/40 shadow-sm ${circleClass} ${
                isActive ? "ring-2 ring-primary/50" : ""
              }`}
            >
              <StatusIcon status={step.status} />
            </span>
            <div className="flex-1">
              <div className="font-medium">{step.label}</div>
              {logisticsSummary ? (
                <div className={`text-xs ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"} space-y-0.5`}>
                  <div>
                    Material: <span className="font-medium">{logisticsSummary.material.label}</span>
                  </div>
                  <div>
                    Nalog: <span className="font-medium">{logisticsSummary.workOrder.label}</span>
                  </div>
                </div>
              ) : metaText ? (
                <div className={`text-xs ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{metaText}</div>
              ) : null}
            </div>
          </button>
        );
      })}
    </nav>
  );
}
