import { Bell, Home, Shield, Video } from "lucide-react";

type TipProjektaTrakProps = {
  onAddVideonadzor: () => void;
  onAddAlarm: () => void;
};

const disabledTypes = [
  { label: "Domofon", icon: Bell },
  { label: "Pametna hiša", icon: Home },
];

export function TipProjektaTrak({ onAddVideonadzor, onAddAlarm }: TipProjektaTrakProps) {
  return (
    <div className="zahteva-type-strip" aria-label="Tipi projektov">
      <button type="button" className="zahteva-type-chip is-active" onClick={onAddVideonadzor}>
        <Video className="h-4 w-4" aria-hidden />
        <span>Videonadzor</span>
      </button>
      <button type="button" className="zahteva-type-chip is-active" onClick={onAddAlarm}>
        <Shield className="h-4 w-4" aria-hidden />
        <span>Alarm</span>
      </button>
      {disabledTypes.map((type) => {
        const Icon = type.icon;
        return (
          <button key={type.label} type="button" className="zahteva-type-chip is-disabled" disabled>
            <Icon className="h-4 w-4" aria-hidden />
            <span>{type.label}</span>
            <small>kmalu</small>
          </button>
        );
      })}
    </div>
  );
}
