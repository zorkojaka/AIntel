import type { CSSProperties } from "react";
import type { Zahteva } from "../../../types";
import { Badge } from "../../ui/badge";
import type { WizardState } from "../state/useZahtevaWizard";

type Korak3Props = {
  state: WizardState;
  updateVideonadzor: (updater: (current: Zahteva["videonadzor"]) => Zahteva["videonadzor"]) => void;
};

const COLORS = ["#7c3aed", "#16a34a", "#f97316", "#db2777", "#0d9488", "#2563eb", "#ca8a04"];

function countAssignments(lokacije: Zahteva["videonadzor"]["lokacije"]) {
  const counts = new Map<string, number>();
  lokacije.forEach((lokacija) => {
    if (!lokacija.kameraId) return;
    counts.set(lokacija.kameraId, (counts.get(lokacija.kameraId) ?? 0) + 1);
  });
  return counts;
}

export function Korak3Dodelitev({ state, updateVideonadzor }: Korak3Props) {
  const { lokacije, kosarica } = state.videonadzor;
  const assignmentCounts = countAssignments(lokacije);
  const assigned = lokacije.filter((lokacija) => lokacija.kameraId).length;
  const missing = lokacije.length - assigned;
  const overAssigned = kosarica
    .map((entry) => ({ id: entry.id, allowed: entry.kolicina, actual: assignmentCounts.get(entry.id) ?? 0 }))
    .filter((entry) => entry.actual > entry.allowed);

  const selectCamera = (locationId: string, cameraId: string) => {
    updateVideonadzor((current) => {
      const currentLocation = current.lokacije.find((lokacija) => lokacija.id === locationId);
      const currentlySelected = currentLocation?.kameraId ?? null;
      const nextCameraId = currentlySelected === cameraId ? null : cameraId;
      const targetCart = current.kosarica.find((entry) => entry.id === cameraId);
      if (!targetCart) return current;

      if (nextCameraId) {
        const currentCounts = countAssignments(current.lokacije);
        const targetCount = currentCounts.get(cameraId) ?? 0;
        if (currentlySelected !== cameraId && targetCount >= targetCart.kolicina) {
          return current;
        }
      }

      return {
        ...current,
        lokacije: current.lokacije.map((lokacija) =>
          lokacija.id === locationId ? { ...lokacija, kameraId: nextCameraId } : lokacija
        ),
      };
    });
  };

  return (
    <section className="request-wizard-step">
      <div className="request-step-header">
        <div>
          <h3>Dodeli kamere lokacijam</h3>
          <p className="text-sm text-muted-foreground">Klikni katero varianto na katero lokacijo.</p>
        </div>
      </div>

      {lokacije.length === 0 || kosarica.length === 0 ? (
        <div className="request-empty-state">Za dodelitev potrebuješ vsaj eno lokacijo in eno varianto v košarici.</div>
      ) : (
        <div className="request-assignment-scroll">
          <table className="request-assignment-table">
            <thead>
              <tr>
                <th>Lokacija</th>
                {kosarica.map((entry, index) => {
                  const assignedCount = assignmentCounts.get(entry.id) ?? 0;
                  return (
                    <th key={entry.id}>
                      <span className="request-variant-head">
                        <span className="request-variant-color" style={{ background: COLORS[index % COLORS.length] }} />
                        {entry.id}
                      </span>
                      <span className="request-variant-count">{assignedCount}/{entry.kolicina}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lokacije.map((lokacija) => (
                <tr key={lokacija.id}>
                  <td>
                    <div className="font-medium">{lokacija.ime || "Brez imena"}</div>
                    {lokacija.opis ? <div className="text-xs text-muted-foreground">{lokacija.opis}</div> : null}
                  </td>
                  {kosarica.map((entry, index) => {
                    const checked = lokacija.kameraId === entry.id;
                    const assignedCount = assignmentCounts.get(entry.id) ?? 0;
                    const disabled = !checked && assignedCount >= entry.kolicina;
                    return (
                      <td key={entry.id}>
                        <button
                          type="button"
                          className={`request-assignment-cell ${checked ? "is-selected" : ""}`}
                          style={{ "--variant-color": COLORS[index % COLORS.length] } as CSSProperties}
                          onClick={() => selectCamera(lokacija.id, entry.id)}
                          disabled={disabled}
                          aria-label={`Dodeli varianto ${entry.id} lokaciji ${lokacija.ime}`}
                        >
                          {checked ? "✓" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="request-assignment-footer">
        <Badge variant={missing === 0 && overAssigned.length === 0 && lokacije.length > 0 ? "default" : "secondary"}>
          Dodeljeno: {assigned} od {lokacije.length}
        </Badge>
        {overAssigned.length > 0 ? (
          <span className="text-sm text-destructive">
            {overAssigned.map((entry) => `Varianta ${entry.id} ima ${entry.allowed}, dodeljeno ${entry.actual}`).join(". ")}
          </span>
        ) : missing === 0 && lokacije.length > 0 ? (
          <span className="text-sm font-medium text-emerald-700">Vse lokacije pokrite</span>
        ) : (
          <span className="text-sm text-muted-foreground">{missing} lokacij brez kamere</span>
        )}
      </div>
    </section>
  );
}
