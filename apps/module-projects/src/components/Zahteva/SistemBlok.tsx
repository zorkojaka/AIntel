import { Trash2, Video } from "lucide-react";
import { useState } from "react";
import type { CenikProduct } from "../../api";
import { Button } from "../ui/button";
import { DodajVariantoDialog } from "./DodajVariantoDialog";
import { SekcijaDisk } from "./SekcijaDisk";
import { SekcijaMontaza } from "./SekcijaMontaza";
import { SekcijaPoESwitch } from "./SekcijaPoESwitch";
import { SekcijaSnemalnik } from "./SekcijaSnemalnik";
import { TabelaAsortima } from "./TabelaAsortima";
import { TrakStevila } from "./TrakStevila";
import type { ZahtevaSistem } from "./utils";
import { formatPrice, nextVariantId, syncLokacije, systemTotal } from "./utils";

type SistemBlokProps = {
  projectId: string;
  zahtevaId: string;
  sistem: ZahtevaSistem;
  productById: Map<string, CenikProduct>;
  onChange: (next: ZahtevaSistem) => void;
  onRemove: () => void;
};

export function SistemBlok({ projectId, zahtevaId, sistem, productById, onChange, onRemove }: SistemBlokProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const videonadzor = sistem.videonadzor;
  if (sistem.tip !== "videonadzor" || !videonadzor) return null;
  const total = systemTotal(videonadzor, productById);

  const updateVideo = (nextVideo: typeof videonadzor) => {
    onChange({ ...sistem, steviloLokacij: nextVideo.lokacije.length, videonadzor: nextVideo });
  };

  const setCount = (value: number) => {
    updateVideo(syncLokacije(videonadzor, value));
  };

  const addVariants = (camera: CenikProduct, brackets: Array<CenikProduct | null>) => {
    let variants = [...videonadzor.asortima];
    const addedIds: string[] = [];
    brackets.forEach((bracket) => {
      const id = nextVariantId(variants);
      variants = [...variants, { id, kameraProductId: camera._id, nosilecProductId: bracket?._id ?? null }];
      addedIds.push(id);
    });
    const lokacije = videonadzor.lokacije.map((lokacija, index) =>
      !lokacija.asortimaIdAssigned && index === 0 && addedIds[0]
        ? { ...lokacija, asortimaIdAssigned: addedIds[0] }
        : lokacija,
    );
    updateVideo({ ...videonadzor, asortima: variants, lokacije });
  };

  const assign = (lokacijaId: string, variantId: string) => {
    updateVideo({
      ...videonadzor,
      lokacije: videonadzor.lokacije.map((lokacija) =>
        lokacija.id === lokacijaId
          ? { ...lokacija, asortimaIdAssigned: lokacija.asortimaIdAssigned === variantId ? null : variantId }
          : lokacija,
      ),
    });
  };

  const removeVariant = (variantId: string) => {
    updateVideo({
      ...videonadzor,
      asortima: videonadzor.asortima.filter((variant) => variant.id !== variantId),
      lokacije: videonadzor.lokacije.map((lokacija) =>
        lokacija.asortimaIdAssigned === variantId ? { ...lokacija, asortimaIdAssigned: null } : lokacija,
      ),
    });
  };

  return (
    <section className="zahteva-system-block">
      <header className="zahteva-system-header">
        <div className="zahteva-system-title">
          <Video className="h-5 w-5" aria-hidden />
          <h3>Videonadzor</h3>
        </div>
        <TrakStevila value={sistem.steviloLokacij} min={1} max={64} onChange={setCount} />
        <strong className="zahteva-system-price">{formatPrice(total)}</strong>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Odstrani sistem">
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </header>

      <TabelaAsortima
        projectId={projectId}
        zahtevaId={zahtevaId}
        sistemId={sistem.id}
        videonadzor={videonadzor}
        productById={productById}
        onAssign={assign}
        onRenameLokacija={(lokacijaId, ime) => {
          updateVideo({
            ...videonadzor,
            lokacije: videonadzor.lokacije.map((lokacija) => (lokacija.id === lokacijaId ? { ...lokacija, ime } : lokacija)),
          });
        }}
        onAddVarianta={() => setDialogOpen(true)}
        onRemoveVarianta={removeVariant}
      />

      <SekcijaSnemalnik videonadzor={videonadzor} productById={productById} onChange={updateVideo} />
      <SekcijaPoESwitch videonadzor={videonadzor} productById={productById} onChange={updateVideo} />
      <SekcijaDisk videonadzor={videonadzor} productById={productById} onChange={updateVideo} />
      <SekcijaMontaza videonadzor={videonadzor} onChange={updateVideo} />

      <DodajVariantoDialog open={dialogOpen} onOpenChange={setDialogOpen} onConfirm={addVariants} />
    </section>
  );
}
