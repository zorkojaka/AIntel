import { CheckCircle2, Circle, Dot } from "lucide-react";
import type { ProjectDetails } from "../../types";
import { useProjectTimeline, StepKey, StepStatus } from "./useProjectTimeline";

type ProjectQuickNavProps = {
  project: ProjectDetails;
  activeStep: StepKey;
  onSelectStep: (key: StepKey) => void;
};

const statusStyles: Record<StepStatus, string> = {
  done: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  inProgress: "bg-amber-100 text-amber-700 border border-amber-200",
  pending: "bg-muted text-muted-foreground border border-muted-foreground/20",
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
              className={`flex h-7 w-7 items-center justify-center rounded-full ${isActive ? "bg-primary-foreground/15" : statusStyles[step.status]
                }`}
            >
              <StatusIcon status={step.status} />
            </span>
            <div className="flex-1">
              <div className="font-medium">{step.label}</div>
              {step.meta && (
                <div className={`text-xs ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {step.meta}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </nav>
  );
}
