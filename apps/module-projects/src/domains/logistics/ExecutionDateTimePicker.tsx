import { useMemo } from "react";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

// Izbirnik datuma in ure izvedbe. Namesto domačega datetime-local (kjer se je
// urni gumb "prepogibal" in ure 9 ni bilo mogoče izbrati) uporabimo zanesljiv
// datumski vnos + ločena spustna izbirnika za uro in minuto. Spustnika se
// izrišeta v portalu z zaznavo roba, zato nista nikoli odrezana.

type Props = {
  /** Vrednost v obliki datetime-local: "YYYY-MM-DDTHH:mm" ali null. */
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
  disabled?: boolean;
};

// Delovne ure (5–21) pokrijejo montaže; minute po četrt ure.
const HOURS = Array.from({ length: 17 }, (_, index) => 5 + index); // 5..21
const MINUTES = [0, 15, 30, 45];
const DEFAULT_HOUR = 8;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parts(value: string | null) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value ?? "");
  if (!match) return { date: "", hour: null as number | null, minute: null as number | null };
  return { date: match[1], hour: Number(match[2]), minute: Number(match[3]) };
}

export function ExecutionDateTimePicker({ value, onChange, className, disabled }: Props) {
  const { date, hour, minute } = useMemo(() => parts(value), [value]);

  // Sestavi vrednost; ob spremembi dela, ki še ni nastavljen, dopolni s smiselno
  // privzeto (danes / 8:00), da je vnos hiter tudi iz praznega.
  const emit = (next: { date?: string; hour?: number; minute?: number }) => {
    const d = next.date ?? date ?? "";
    if (!d) {
      onChange(null);
      return;
    }
    const h = next.hour ?? hour ?? DEFAULT_HOUR;
    const m = next.minute ?? minute ?? 0;
    onChange(`${d}T${pad(h)}:${pad(m)}`);
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <Input
        type="date"
        value={date}
        disabled={disabled}
        onChange={(event) => {
          const nextDate = event.target.value;
          if (!nextDate) {
            onChange(null);
            return;
          }
          emit({ date: nextDate });
        }}
        className="h-12 w-[9.5rem] text-base font-semibold"
      />
      <div className="flex items-center gap-1">
        <Select
          value={hour !== null ? String(hour) : ""}
          onValueChange={(next) => emit({ date: date || todayKey(), hour: Number(next) })}
          disabled={disabled}
        >
          <SelectTrigger className="h-12 w-[5.25rem] text-base font-semibold">
            <SelectValue placeholder="ura" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {HOURS.map((entry) => (
              <SelectItem key={entry} value={String(entry)}>
                {pad(entry)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-lg font-semibold text-muted-foreground">:</span>
        <Select
          value={minute !== null ? String(minute) : ""}
          onValueChange={(next) => emit({ date: date || todayKey(), minute: Number(next) })}
          disabled={disabled}
        >
          <SelectTrigger className="h-12 w-[5.25rem] text-base font-semibold">
            <SelectValue placeholder="min" />
          </SelectTrigger>
          <SelectContent>
            {MINUTES.map((entry) => (
              <SelectItem key={entry} value={String(entry)}>
                {pad(entry)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
