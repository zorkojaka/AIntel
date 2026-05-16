import type { Zahteva } from "../../../types";
import { Button } from "../../ui/button";
import { useZahtevaWizard } from "../state/useZahtevaWizard";
import { Korak1Lokacije } from "./Korak1Lokacije";
import { Korak2Kosarica } from "./Korak2Kosarica";
import { Korak3Dodelitev } from "./Korak3Dodelitev";
import { Korak4SnemalnikDodatki } from "./Korak4SnemalnikDodatki";
import { Korak5Montaza } from "./Korak5Montaza";
import { Korak6Pregled } from "./Korak6Pregled";

type OgledWizardProps = {
  zahteva: Zahteva;
  onSaved: (zahteva: Zahteva) => void;
  onNavigateOffer: () => void;
  onBackToEntry: () => void;
};

export function OgledWizard({ zahteva, onSaved, onNavigateOffer, onBackToEntry }: OgledWizardProps) {
  const { state, updateVideonadzor, saveNow } = useZahtevaWizard(zahteva, onSaved);

  if (!state) {
    return <div className="text-sm text-muted-foreground">Nalaganje zahteve...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-md border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2>Ogled za videonadzor</h2>
          <p className="text-sm text-muted-foreground">{state.saving || state.dirty ? "Shranjujem..." : "Vse shranjeno ✓"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onBackToEntry}>Vstopni ekran</Button>
        </div>
      </div>
      <Korak1Lokacije state={state} updateVideonadzor={updateVideonadzor} />
      <Korak2Kosarica state={state} updateVideonadzor={updateVideonadzor} />
      <Korak3Dodelitev state={state} updateVideonadzor={updateVideonadzor} />
      <Korak4SnemalnikDodatki state={state} updateVideonadzor={updateVideonadzor} />
      <Korak5Montaza state={state} updateVideonadzor={updateVideonadzor} />
      <Korak6Pregled state={state} saveNow={saveNow} onNavigateOffer={onNavigateOffer} />
    </div>
  );
}
