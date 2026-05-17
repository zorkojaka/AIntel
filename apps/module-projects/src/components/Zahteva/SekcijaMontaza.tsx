import { Wrench } from "lucide-react";
import { useState } from "react";
import type { Videonadzor } from "./utils";

type Props = {
  videonadzor: Videonadzor;
  onChange: (next: Videonadzor) => void;
};

type ZascitniMaterial = Videonadzor["montaza"]["zascitniMaterial"];

export function SekcijaMontaza({ videonadzor, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const montaza = videonadzor.montaza;

  const update = (changes: Partial<typeof montaza>) => {
    onChange({ ...videonadzor, montaza: { ...montaza, ...changes } });
  };

  return (
    <section className="zahteva-subsection">
      <div className="zahteva-montaza-line">
        <Wrench className="h-4 w-4" aria-hidden />
        <strong>Montaža:</strong>
        <label>
          <input type="checkbox" checked={montaza.vkljuceno} onChange={(event) => update({ vkljuceno: event.target.checked })} />
          Na ključ
        </label>
        <span>{montaza.napeljava ? `${montaza.metrov}m • ${montaza.zascitniMaterial ?? "brez"}` : "samo oprema"}</span>
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          uredi
        </button>
      </div>
      {expanded ? (
        <div className="zahteva-montaza-details">
          <label>
            <input type="checkbox" checked={montaza.napeljava} onChange={(event) => update({ napeljava: event.target.checked })} />
            Na ključ z napeljavo
          </label>
          <div className="zahteva-meter-strip">
            {[10, 25, 50, 75, 100].map((value) => (
              <button key={value} type="button" className={montaza.metrov === value ? "is-active" : ""} onClick={() => update({ metrov: value })}>
                {value}m
              </button>
            ))}
          </div>
          <select value={montaza.zascitniMaterial ?? "brez"} onChange={(event) => update({ zascitniMaterial: event.target.value as ZascitniMaterial })}>
            <option value="brez">brez</option>
            <option value="kanal">kanal</option>
            <option value="cev">cev</option>
          </select>
        </div>
      ) : null}
    </section>
  );
}
