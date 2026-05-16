import { useRef } from "react";

type TrakStevilaProps = {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function TrakStevila({ value, min = 1, max = 64, onChange }: TrakStevilaProps) {
  const startXRef = useRef<number | null>(null);
  const values = [value - 2, value - 1, value, value + 1, value + 2].filter((entry) => entry >= min && entry <= max);

  const commitDelta = (delta: number) => {
    if (delta === 0) return;
    onChange(clamp(value + delta, min, max));
  };

  return (
    <div
      className="zahteva-number-dial"
      onPointerDown={(event) => {
        startXRef.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (startXRef.current == null) return;
        const diff = event.clientX - startXRef.current;
        startXRef.current = null;
        if (Math.abs(diff) < 18) return;
        commitDelta(diff < 0 ? 1 : -1);
      }}
      role="group"
      aria-label="Število kamer"
    >
      {values.map((entry) => (
        <button
          key={entry}
          type="button"
          className={`zahteva-number-dial__item ${entry === value ? "is-active" : ""}`}
          onClick={() => onChange(entry)}
          aria-pressed={entry === value}
        >
          {entry}
        </button>
      ))}
    </div>
  );
}
