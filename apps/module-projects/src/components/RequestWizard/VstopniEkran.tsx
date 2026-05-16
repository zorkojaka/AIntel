import { ArrowRight, Bell, Boxes, Camera, Home, Package, Shield, Video } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

type VstopniEkranProps = {
  selectedTip: "videonadzor";
  creating: "ogled" | "preskoceno" | null;
  onStartOgled: () => void;
  onSkipToOffer: () => void;
};

const disabledTypes = [
  { label: "Alarm", icon: Bell },
  { label: "Domofon", icon: Shield },
  { label: "Pametna hiša", icon: Home },
];

export function VstopniEkran({ selectedTip, creating, onStartOgled, onSkipToOffer }: VstopniEkranProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h2>Tip projekta</h2>
          <p className="text-sm text-muted-foreground">Izberi področje za fazo Zahteve.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="request-option request-option--active"
            aria-pressed={selectedTip === "videonadzor"}
          >
            <Video className="h-5 w-5" aria-hidden />
            <span className="request-option__title">Videonadzor</span>
          </button>
          {disabledTypes.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" className="request-option request-option--disabled" disabled>
                <Icon className="h-5 w-5" aria-hidden />
                <span className="request-option__title">{item.label}</span>
                <Badge variant="secondary">kmalu</Badge>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2>Pot do ponudbe</h2>
          <p className="text-sm text-muted-foreground">Za MVP je aktiven ogled za videonadzor ali ročni prehod v ponudbo.</p>
        </div>
        <div className="grid gap-3">
          <Card className="request-path-card">
            <div className="request-path-card__icon">
              <Camera className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3>Ogled</h3>
              <p className="text-sm text-muted-foreground">Korak po koraku: lokacije, kamere, nosilci, snemalnik in montaža.</p>
              <span className="text-xs font-medium text-muted-foreground">5-10 min</span>
            </div>
            <Button onClick={onStartOgled} disabled={creating !== null}>
              {creating === "ogled" ? "Ustvarjam..." : "Začni"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </Card>

          <Card className="request-path-card request-path-card--disabled" aria-disabled="true">
            <div className="request-path-card__icon">
              <Package className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3>Paket</h3>
                <Badge variant="secondary">kmalu</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Pripravljeni paketi za tipične scenarije.</p>
            </div>
            <Button disabled variant="secondary">Ni na voljo</Button>
          </Card>

          <Card className="request-path-card">
            <div className="request-path-card__icon">
              <Boxes className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3>Preskoči - ročno v Ponudbi</h3>
              <p className="text-sm text-muted-foreground">Direkt v Ponudbo, postavke dodaš ročno iz cenika.</p>
            </div>
            <Button variant="outline" onClick={onSkipToOffer} disabled={creating !== null}>
              {creating === "preskoceno" ? "Ustvarjam..." : "Preskoči"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </Card>
        </div>
      </section>
    </div>
  );
}
