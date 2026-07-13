import type { OfferVersionSummary } from "@aintel/shared/types/offers";

import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

type OfferVersionSelectorProps = {
  versions: OfferVersionSummary[];
  selectedOfferId: string | null;
  formatCurrency: (value: number) => string;
  onChangeVersion: (offerId: string) => void;
  onCreateNewVersion: () => void;
  onCloneVersion: () => void;
  onDeleteVersion: () => void;
};

export function OfferVersionSelector({
  versions,
  selectedOfferId,
  formatCurrency,
  onChangeVersion,
  onCreateNewVersion,
  onCloneVersion,
  onDeleteVersion,
}: OfferVersionSelectorProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Verzija ponudbe
        </span>
        <Select value={selectedOfferId ?? ""} onValueChange={onChangeVersion}>
          <SelectTrigger className="min-w-[260px]">
            <SelectValue placeholder="Izberi verzijo ponudbe" />
          </SelectTrigger>
          <SelectContent>
            {versions.map((version) => (
              <SelectItem key={version._id} value={version._id}>
                {version.title} –{" "}
                {formatCurrency(
                  version.totalGrossAfterDiscount ?? version.totalWithVat ?? version.totalGross ?? 0
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onCreateNewVersion}>
          Nova verzija
        </Button>
        <Button size="sm" variant="outline" onClick={onCloneVersion} disabled={!selectedOfferId}>
          Kopiraj verzijo
        </Button>
        <Button size="sm" variant="destructive" disabled={!selectedOfferId} onClick={onDeleteVersion}>
          Izbriši verzijo
        </Button>
      </div>
    </div>
  );
}
