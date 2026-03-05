import { TabsList, TabsTrigger } from "./ui/tabs";

export type PhaseRibbonStatus = "done" | "active" | "future";

export type PhaseRibbonStep = {
  key: string;
  label: string;
  status: PhaseRibbonStatus;
  value?: string;
};

type PhaseRibbonProps = {
  steps: PhaseRibbonStep[];
  activeKey?: string | null;
  variant?: "tabs" | "static";
};

const TAB_PHASE_STYLES: Record<PhaseRibbonStatus, { container: string; label: string; iconColor: string }> = {
  done: {
    container: "bg-emerald-500 text-white hover:bg-emerald-500 data-[state=active]:bg-emerald-500",
    label: "text-white",
    iconColor: "text-white/80",
  },
  active: {
    container:
      "bg-amber-500 text-white shadow-sm data-[state=active]:bg-amber-500 hover:bg-amber-500 focus-visible:ring-2 focus-visible:ring-amber-400",
    label: "text-white",
    iconColor: "text-white/80",
  },
  future: {
    container:
      "bg-background text-muted-foreground border border-muted/60 hover:bg-muted/40 data-[state=active]:bg-muted/40",
    label: "text-muted-foreground",
    iconColor: "text-muted-foreground",
  },
};

const ARROW_CUT_PX = 12;
const ARROW_OVERLAP_PX = 12;
const ARROW_RIGHT_PADDING_PX = 16;

const buildArrowClipPath = (isLast: boolean) =>
  isLast
    ? "polygon(0 0, 100% 0, 100% 100%, 0 100%)"
    : `polygon(0 0, calc(100% - ${ARROW_CUT_PX}px) 0, 100% 50%, calc(100% - ${ARROW_CUT_PX}px) 100%, 0 100%)`;

function getPhaseIcon(status: PhaseRibbonStatus) {
  return status === "done" ? "✓" : status === "active" ? "•" : "";
}

export function PhaseRibbon({ steps, activeKey, variant = "static" }: PhaseRibbonProps) {
  if (variant === "tabs") {
    return (
      <>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0 md:hidden">
          {steps.map((step) => {
            const styles = TAB_PHASE_STYLES[step.status];
            const icon = getPhaseIcon(step.status);
            const isActive = activeKey === step.key;
            return (
              <TabsTrigger
                key={step.key}
                value={step.value ?? step.key}
                className={`h-auto basis-[calc(50%-0.25rem)] rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${styles.container}`}
                style={{
                  boxShadow: isActive
                    ? "inset 0 3px 0 0 var(--brand-color), inset 0 -2px 0 0 var(--brand-color)"
                    : undefined,
                }}
              >
                <span className={`inline-flex items-center gap-1 ${styles.label}`}>
                  {step.label}
                  {icon && (
                    <span className={`text-xs opacity-70 ${styles.iconColor}`} aria-hidden>
                      {icon}
                    </span>
                  )}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsList className="hidden w-full overflow-hidden bg-muted/10 p-0 md:flex">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            const clipPath = buildArrowClipPath(isLast);
            const roundedClass = index === 0 ? "rounded-l-md" : isLast ? "rounded-r-md" : "";
            const styles = TAB_PHASE_STYLES[step.status];
            const icon = getPhaseIcon(step.status);
            const isActive = activeKey === step.key;
            return (
              <TabsTrigger
                key={step.key}
                value={step.value ?? step.key}
                style={{
                  clipPath,
                  marginInlineStart: index === 0 ? 0 : -ARROW_OVERLAP_PX,
                  zIndex: steps.length - index,
                  paddingRight: `${ARROW_RIGHT_PADDING_PX}px`,
                  boxShadow: isActive
                    ? "inset 0 4px 0 0 var(--brand-color), inset 0 -2px 0 0 var(--brand-color)"
                    : undefined,
                  borderWidth: isActive ? 0 : undefined,
                  borderStyle: isActive ? "none" : undefined,
                }}
                className={`relative flex flex-1 items-center gap-2 pl-5 py-3 text-sm font-semibold uppercase tracking-wide transition overflow-hidden ${roundedClass} ${styles.container}`}
              >
                <span className={`inline-flex items-center gap-1 ${styles.label} relative z-10`}>
                  {step.label}
                  {icon && (
                    <span className={`text-xs opacity-70 ${styles.iconColor}`} aria-hidden>
                      {icon}
                    </span>
                  )}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </>
    );
  }

  return (
    <>
      <div className="flex w-full flex-wrap gap-2 p-0 md:hidden">
        {steps.map((step) => {
          const styles = TAB_PHASE_STYLES[step.status];
          const icon = getPhaseIcon(step.status);
          const isActive = activeKey === step.key;
          return (
            <div
              key={step.key}
              className={`flex h-auto basis-[calc(50%-0.25rem)] items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${styles.container}`}
              style={{
                boxShadow: isActive
                  ? "inset 0 3px 0 0 var(--brand-color), inset 0 -2px 0 0 var(--brand-color)"
                  : undefined,
              }}
              aria-current={isActive ? "step" : undefined}
            >
              <span className={`inline-flex items-center gap-1 ${styles.label}`}>
                {step.label}
                {icon && (
                  <span className={`text-xs opacity-70 ${styles.iconColor}`} aria-hidden>
                    {icon}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="hidden w-full overflow-hidden bg-muted/10 p-0 md:flex">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const clipPath = buildArrowClipPath(isLast);
          const roundedClass = index === 0 ? "rounded-l-md" : isLast ? "rounded-r-md" : "";
          const styles = TAB_PHASE_STYLES[step.status];
          const icon = getPhaseIcon(step.status);
          const isActive = activeKey === step.key;
          return (
            <div
              key={step.key}
              style={{
                clipPath,
                marginInlineStart: index === 0 ? 0 : -ARROW_OVERLAP_PX,
                zIndex: steps.length - index,
                paddingRight: `${ARROW_RIGHT_PADDING_PX}px`,
                boxShadow: isActive
                  ? "inset 0 4px 0 0 var(--brand-color), inset 0 -2px 0 0 var(--brand-color)"
                  : undefined,
                borderWidth: isActive ? 0 : undefined,
                borderStyle: isActive ? "none" : undefined,
              }}
              className={`relative flex flex-1 items-center gap-2 pl-5 py-3 text-sm font-semibold uppercase tracking-wide transition overflow-hidden ${roundedClass} ${styles.container}`}
              aria-current={isActive ? "step" : undefined}
            >
              <span className={`inline-flex items-center gap-1 ${styles.label} relative z-10`}>
                {step.label}
                {icon && (
                  <span className={`text-xs opacity-70 ${styles.iconColor}`} aria-hidden>
                    {icon}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
