import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { nadaljujZahtevaNaPonudbo, type CenikProduct } from "../../api";
import type { Zahteva } from "../../types";
import { Button } from "../ui/button";
import { alarmTotal, formatPrice, systemTotal } from "./utils";

type Props = {
  zahteva: Zahteva;
  productById: Map<string, CenikProduct>;
  onNavigateOffer: () => void;
};

export function SpodnjiCena({ zahteva, productById, onNavigateOffer }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const total = zahteva.sistemi.reduce((sum, sistem) => {
    if (sistem.tip === "videonadzor" && sistem.videonadzor) return sum + systemTotal(sistem.videonadzor, productById);
    if (sistem.tip === "alarm" && sistem.alarm) return sum + alarmTotal(sistem.alarm, productById);
    return sum;
  }, 0);

  const submit = async () => {
    setSubmitting(true);
    try {
      await nadaljujZahtevaNaPonudbo(zahteva._id);
      toast.success("Ponudba je ustvarjena.");
      onNavigateOffer();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Zahteve ni mogoče nadaljevati v ponudbo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="zahteva-bottom-total">
      <div>
        <span>Skupaj zahteva</span>
        <strong>{formatPrice(total)}</strong>
      </div>
      <Button type="button" onClick={() => void submit()} disabled={submitting}>
        {submitting ? "Ustvarjam..." : "Nadaljuj na ponudbo"}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    </section>
  );
}
