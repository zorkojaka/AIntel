import { Cable, Hammer } from "lucide-react";
import type { Zahteva } from "../../../types";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";
import type { WizardState } from "../state/useZahtevaWizard";

type Korak5Props = {
  state: WizardState;
  updateVideonadzor: (updater: (current: Zahteva["videonadzor"]) => Zahteva["videonadzor"]) => void;
};

export function Korak5Montaza({ state, updateVideonadzor }: Korak5Props) {
  const montaza = state.videonadzor.montaza;
  const cameraCount = state.videonadzor.lokacije.filter((lokacija) => lokacija.kameraId).length || state.videonadzor.lokacije.length;

  const updateMontaza = (changes: Partial<Zahteva["videonadzor"]["montaza"]>) => {
    updateVideonadzor((current) => ({ ...current, montaza: { ...current.montaza, ...changes } }));
  };

  return (
    <section className="request-wizard-step">
      <div className="request-step-header">
        <div>
          <h3>Montaža in napeljava</h3>
          <p className="text-sm text-muted-foreground">Izbira določa storitve in material, ki se dodajo ob zaključku zahteve.</p>
        </div>
      </div>

      <div className="request-montaza-grid">
        <div className="request-equipment-panel">
          <div className="flex items-center gap-2">
            <Hammer className="h-4 w-4" aria-hidden />
            <h4>Montaža</h4>
          </div>
          <label className="request-radio-row">
            <input
              type="radio"
              checked={montaza.vkljuceno}
              onChange={() => updateMontaza({ vkljuceno: true, napeljava: montaza.napeljava, metrov: montaza.metrov || 50 })}
            />
            Da, na ključ
          </label>
          <label className="request-radio-row">
            <input
              type="radio"
              checked={!montaza.vkljuceno}
              onChange={() => updateMontaza({ vkljuceno: false, napeljava: false, metrov: 0, zascitniMaterial: null })}
            />
            Ne, samo oprema
          </label>
        </div>

        {montaza.vkljuceno ? (
          <div className="request-equipment-panel">
            <div className="flex items-center gap-2">
              <Cable className="h-4 w-4" aria-hidden />
              <h4>Napeljava</h4>
            </div>
            <label className="request-checkbox-line">
              <Checkbox
                checked={montaza.napeljava}
                onChange={(event) =>
                  updateMontaza({
                    napeljava: event.target.checked,
                    metrov: event.target.checked ? montaza.metrov || Math.max(20, cameraCount * 10) : 0,
                    zascitniMaterial: event.target.checked ? montaza.zascitniMaterial ?? "kanal" : null,
                  })
                }
              />
              Delamo napeljavo kablov
            </label>

            {montaza.napeljava ? (
              <>
                <label className="request-field-label">
                  Ocenjeni metri kabla
                  <Input
                    type="number"
                    min={0}
                    value={montaza.metrov}
                    onChange={(event) => updateMontaza({ metrov: Math.max(0, Number(event.target.value) || 0) })}
                  />
                </label>
                <div className="request-segmented">
                  {[
                    { value: "kanal", label: "Plastični kanal" },
                    { value: "cev", label: "Gibljiva cev" },
                    { value: "brez", label: "Brez" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={montaza.zascitniMaterial === option.value ? "is-active" : ""}
                      onClick={() => updateMontaza({ zascitniMaterial: option.value as "kanal" | "cev" | "brez" })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="request-step-summary is-ok">
        {montaza.vkljuceno
          ? `Dodane bodo storitve montaže za ${cameraCount} kamer${montaza.napeljava ? ` in ${montaza.metrov} m napeljave` : ""}.`
          : "V ponudbo se doda samo izbrana oprema."}
      </div>
    </section>
  );
}
