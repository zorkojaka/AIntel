import { Plus, Trash2, Video } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import type { Zahteva } from "../../../types";
import type { WizardState } from "../state/useZahtevaWizard";

type StepProps = {
  state: WizardState;
  updateVideonadzor: (updater: (current: Zahteva["videonadzor"]) => Zahteva["videonadzor"]) => void;
};

function createLocationName(index: number) {
  return index === 0 ? "Vhod" : `Lokacija ${index + 1}`;
}

function createLocationId(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${normalized || "lokacija"}-${Date.now().toString(36)}`;
}

export function Korak1Lokacije({ state, updateVideonadzor }: StepProps) {
  const lastInputRef = useRef<HTMLInputElement | null>(null);
  const shouldFocusRef = useRef(false);
  const lokacije = state.videonadzor.lokacije ?? [];

  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    lastInputRef.current?.focus();
    lastInputRef.current?.select();
  }, [lokacije.length]);

  const addLocation = () => {
    shouldFocusRef.current = true;
    updateVideonadzor((current) => {
      const nextName = createLocationName(current.lokacije.length);
      return {
        ...current,
        lokacije: [
          ...current.lokacije,
          {
            id: createLocationId(nextName),
            ime: nextName,
            opis: "",
            kameraId: null,
          },
        ],
      };
    });
  };

  const updateLocation = (id: string, changes: Partial<Zahteva["videonadzor"]["lokacije"][number]>) => {
    updateVideonadzor((current) => ({
      ...current,
      lokacije: current.lokacije.map((lokacija) => (lokacija.id === id ? { ...lokacija, ...changes } : lokacija)),
    }));
  };

  const deleteLocation = (id: string) => {
    updateVideonadzor((current) => ({
      ...current,
      lokacije: current.lokacije.filter((lokacija) => lokacija.id !== id),
    }));
  };

  return (
    <section className="request-wizard-step">
      <div className="request-step-header">
        <div>
          <h3>Kje bodo kamere?</h3>
          <p className="text-sm text-muted-foreground">
            1 lokacija = 1 kamera. Če imaš 3 kamere na dvorišču, dodaj Dvorišče A, B, C.
          </p>
        </div>
        <Button type="button" onClick={addLocation}>
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj lokacijo
        </Button>
      </div>

      <div className="space-y-2">
        {lokacije.length === 0 ? (
          <div className="request-empty-state">Dodaj vsaj eno lokacijo kamere.</div>
        ) : null}
        {lokacije.map((lokacija, index) => (
          <div key={lokacija.id} className="request-location-row">
            <div className="request-location-icon">
              <Video className="h-4 w-4" aria-hidden />
            </div>
            <Input
              ref={index === lokacije.length - 1 ? lastInputRef : undefined}
              value={lokacija.ime}
              onChange={(event) => updateLocation(lokacija.id, { ime: event.target.value })}
              placeholder="Ime lokacije"
              aria-label="Ime lokacije"
            />
            <Input
              value={lokacija.opis ?? ""}
              onChange={(event) => updateLocation(lokacija.id, { opis: event.target.value })}
              placeholder="opis, npr. jug"
              aria-label="Opis lokacije"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => deleteLocation(lokacija.id)}
              aria-label={`Odstrani ${lokacija.ime || "lokacijo"}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}
      </div>

      <div className={`request-step-summary ${lokacije.length > 0 ? "is-ok" : "is-warning"}`}>
        {lokacije.length > 0 ? `${lokacije.length} lokacij = ${lokacije.length} kamer` : "Minimalno 1 lokacija"}
      </div>
    </section>
  );
}
