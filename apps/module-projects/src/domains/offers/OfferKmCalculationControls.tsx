import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import type { ProjectDetails } from "../../types";
import {
  compareRouteAddresses,
  formatKm,
  formatProjectRouteAddress,
  type KmCalculationState,
  type OfferLineItemForm,
} from "./offerEditorUtils";

type OfferKmCalculationProps = {
  item: OfferLineItemForm;
  isKmItem: boolean;
  state: KmCalculationState;
  disabled: boolean;
  projectDetails: ProjectDetails | null;
  onCalculate: (item: OfferLineItemForm) => void;
  onOpenAddressEditor: () => void;
};

export function shouldShowOfferKmAddressComparison({
  isKmItem,
  state,
  projectDetails,
}: Pick<OfferKmCalculationProps, "isKmItem" | "state" | "projectDetails">) {
  if (!isKmItem || state.status !== "calculated") {
    return false;
  }

  const projectAddress = formatProjectRouteAddress(projectDetails);
  const comparison = compareRouteAddresses(projectAddress, state.result.naslovProjekt);
  return comparison.zanesljivost !== "visoka";
}

function OfferKmReliabilityNote({
  isKmItem,
  state,
  projectDetails,
}: Pick<OfferKmCalculationProps, "isKmItem" | "state" | "projectDetails">) {
  if (!isKmItem) {
    return null;
  }

  if (state.status === "loading") {
    return <span className="text-xs text-muted-foreground">računam...</span>;
  }

  if (state.status === "manual") {
    return <span className="text-xs text-muted-foreground">ročno</span>;
  }

  if (state.status === "error") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="text-xs font-medium text-destructive underline-offset-2 hover:underline">
            ⚠ napaka
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 text-xs" align="start">
          {state.message || "Naslova ni bilo mogoče najti. Vnesi km ročno."}
        </PopoverContent>
      </Popover>
    );
  }

  if (state.status !== "calculated") {
    return null;
  }

  const projectAddress = formatProjectRouteAddress(projectDetails);
  const comparison = compareRouteAddresses(projectAddress, state.result.naslovProjekt);
  const isHigh = comparison.zanesljivost === "visoka";
  const label = isHigh ? `✓ ${projectAddress || state.result.naslovProjekt}` : "⚠ glej";
  const className = isHigh ? "text-emerald-700" : "text-amber-700";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={`max-w-[220px] truncate text-xs font-medium underline-offset-2 hover:underline ${className}`}>
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-1 text-xs" align="start">
        <p>Od: {state.result.naslovPodjetje}</p>
        <p>Do: {state.result.naslovProjekt}</p>
        <p>Zanesljivost: {state.result.zanesljivostProcent ?? "?"}%</p>
        {projectAddress ? <p>Projekt: {projectAddress}</p> : null}
        <p>Geocoder: {state.result.naslovProjekt}</p>
        <p>
          {formatKm(state.result.razdaljaEnosmerno)} km × 2 = {formatKm(state.result.razdaljaSkupaj)} km.
        </p>
        {!isHigh ? <p>{comparison.razlog}. Preveri naslov, če ni točen.</p> : null}
        {state.result.razlog ? <p>{state.result.razlog}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

export function OfferKmCalculationButton({
  item,
  isKmItem,
  state,
  disabled,
  projectDetails,
  onCalculate,
}: OfferKmCalculationProps) {
  if (!isKmItem) {
    return null;
  }

  const isLoading = state.status === "loading";
  const disabledNote = disabled ? "Nastavi naslov podjetja in API ključ" : null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8 shrink-0"
        disabled={disabled || isLoading}
        onClick={() => onCalculate(item)}
        aria-label="Izračunaj kilometrino"
        title="Izračunaj kilometrino"
      >
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      </Button>
      {disabledNote ? (
        <span className="text-xs text-muted-foreground">{disabledNote}</span>
      ) : (
        <OfferKmReliabilityNote isKmItem={isKmItem} state={state} projectDetails={projectDetails} />
      )}
    </div>
  );
}

export function OfferKmAddressComparison({
  isKmItem,
  state,
  projectDetails,
  onOpenAddressEditor,
}: OfferKmCalculationProps) {
  if (!shouldShowOfferKmAddressComparison({ isKmItem, state, projectDetails })) {
    return null;
  }

  const projectAddress = formatProjectRouteAddress(projectDetails);
  const comparison = compareRouteAddresses(projectAddress, state.result.naslovProjekt);

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div>
        Izračun: {state.result.naslovPodjetje} -&gt; {state.result.naslovProjekt}
      </div>
      <div>Zanesljivost: {state.result.zanesljivostProcent ?? "?"}%</div>
      {projectAddress ? <div>Projekt: {projectAddress}</div> : null}
      <div>
        Geocoder: {state.result.naslovProjekt}
        {comparison.razlog ? ` (${comparison.razlog})` : ""}
      </div>
      <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={onOpenAddressEditor}>
        Popravi naslov
      </button>
    </div>
  );
}

export function OfferKmCalculationMobile(props: OfferKmCalculationProps) {
  if (!props.isKmItem) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <OfferKmCalculationButton {...props} />
      <OfferKmAddressComparison {...props} />
    </div>
  );
}
