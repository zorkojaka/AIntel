import { Shield, Trash2, Video, Wifi } from "lucide-react";
import { useState } from "react";
import type { CenikProduct, ExecutionRuleSettings } from "../../api";
import { Button } from "../ui/button";
import { DodajVariantoDialog } from "./DodajVariantoDialog";
import { SekcijaDisk } from "./SekcijaDisk";
import { SekcijaAlarmOprema } from "./SekcijaAlarmOprema";
import { SekcijaIzvedba } from "./SekcijaIzvedba";
import { SekcijaKameraNosilec } from "./SekcijaKameraNosilec";
import { SekcijaPoESwitch } from "./SekcijaPoESwitch";
import { SekcijaSnemalnik } from "./SekcijaSnemalnik";
import { TabelaAlarm } from "./TabelaAlarm";
import { TabelaAsortima } from "./TabelaAsortima";
import { TrakStevila } from "./TrakStevila";
import type { ZahtevaSistem } from "./utils";
import { alarmTotal, formatPrice, nextVariantId, syncAlarmLokacije, syncLokacije, systemTotal } from "./utils";

type SistemBlokProps = {
  projectId: string;
  zahtevaId: string;
  sistem: ZahtevaSistem;
  executionSettings: ExecutionRuleSettings | null;
  productById: Map<string, CenikProduct>;
  onChange: (next: ZahtevaSistem) => void;
  onRemove: () => void;
};

export function SistemBlok({ projectId, zahtevaId, sistem, executionSettings, productById, onChange, onRemove }: SistemBlokProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const videonadzor = sistem.videonadzor;
  const alarm = sistem.alarm;

  const updateVideo = (nextVideo: typeof videonadzor) => {
    if (!nextVideo) return;
    onChange({ ...sistem, steviloLokacij: nextVideo.lokacije.length, videonadzor: nextVideo });
  };

  const updateAlarm = (nextAlarm: typeof alarm) => {
    if (!nextAlarm) return;
    onChange({ ...sistem, steviloLokacij: nextAlarm.lokacije.length, alarm: nextAlarm });
  };

  if (sistem.tip === "alarm" && alarm) {
    const total = alarmTotal(alarm, productById);
    const setAlarmCount = (value: number) => {
      updateAlarm(syncAlarmLokacije(alarm, value));
    };
    const assignAlarm = (lokacijaId: string, senzorId: string) => {
      updateAlarm({
        ...alarm,
        lokacije: alarm.lokacije.map((lokacija) =>
          lokacija.id === lokacijaId
            ? { ...lokacija, senzorIdAssigned: lokacija.senzorIdAssigned === senzorId ? null : senzorId }
            : lokacija,
        ),
      });
    };
    const removeSenzor = (senzorId: string) => {
      updateAlarm({
        ...alarm,
        senzorji: alarm.senzorji.filter((senzor) => senzor.id !== senzorId),
        lokacije: alarm.lokacije.map((lokacija) =>
          lokacija.senzorIdAssigned === senzorId ? { ...lokacija, senzorIdAssigned: null } : lokacija,
        ),
      });
    };
    const addSenzor = (product: CenikProduct) => {
      const id = nextVariantId(alarm.senzorji);
      const wasEmpty = alarm.senzorji.length === 0;
      const lokacije = wasEmpty
        ? alarm.lokacije.map((lokacija) => ({ ...lokacija, senzorIdAssigned: id }))
        : alarm.lokacije.map((lokacija, index) =>
            !lokacija.senzorIdAssigned && index === 0 ? { ...lokacija, senzorIdAssigned: id } : lokacija,
          );
      updateAlarm({
        ...alarm,
        senzorji: [...alarm.senzorji, { id, senzorProductId: product._id }],
        lokacije,
        centrala: { ...alarm.centrala, autoSelected: true },
      });
    };

    return (
      <section className="zahteva-system-block">
        <header className="zahteva-system-header">
          <div className="zahteva-system-title">
            <Shield className="h-5 w-5" aria-hidden />
            <h3>Alarm</h3>
          </div>
          <TrakStevila value={sistem.steviloLokacij} min={1} max={64} onChange={setAlarmCount} />
          <strong className="zahteva-system-price">{formatPrice(total)}</strong>
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Odstrani sistem">
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </header>

        <TabelaAlarm
          projectId={projectId}
          zahtevaId={zahtevaId}
          sistemId={sistem.id}
          alarm={alarm}
          productById={productById}
          onAssign={assignAlarm}
          onRenameLokacija={(lokacijaId, ime) => {
            updateAlarm({
              ...alarm,
              lokacije: alarm.lokacije.map((lokacija) => (lokacija.id === lokacijaId ? { ...lokacija, ime } : lokacija)),
            });
          }}
          onAddSenzor={() => {
            document.querySelector<HTMLElement>(`[data-alarm-sensor-picker="${sistem.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onRemoveSenzor={removeSenzor}
        />

        <div data-alarm-sensor-picker={sistem.id}>
          <SekcijaAlarmOprema alarm={alarm} productById={productById} onChange={updateAlarm} onAddSenzor={addSenzor} />
        </div>
        <SekcijaIzvedba
          sistem={sistem}
          settings={executionSettings}
          productById={productById}
          onChange={(execution) => onChange({ ...sistem, execution })}
        />
      </section>
    );
  }

  const isWifiKamere = sistem.tip === "wifi_kamere";
  if ((sistem.tip !== "videonadzor" && !isWifiKamere) || !videonadzor) return null;
  const total = systemTotal(videonadzor, productById);

  const setCount = (value: number) => {
    updateVideo(syncLokacije(videonadzor, value));
  };

  const addVariants = (camera: CenikProduct, brackets: Array<CenikProduct | null>) => {
    let variants = [...videonadzor.asortima];
    const addedIds: string[] = [];
    const wasEmpty = variants.length === 0;
    brackets.forEach((bracket) => {
      const id = nextVariantId(variants);
      variants = [...variants, { id, kameraProductId: camera._id, nosilecProductId: bracket?._id ?? null }];
      addedIds.push(id);
    });
    const firstAddedId = addedIds[0];
    const lokacije =
      wasEmpty && firstAddedId
        ? videonadzor.lokacije.map((lokacija) => ({ ...lokacija, asortimaIdAssigned: firstAddedId }))
        : videonadzor.lokacije.map((lokacija, index) =>
            !lokacija.asortimaIdAssigned && index === 0 && firstAddedId
              ? { ...lokacija, asortimaIdAssigned: firstAddedId }
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
          {isWifiKamere ? <Wifi className="h-5 w-5" aria-hidden /> : <Video className="h-5 w-5" aria-hidden />}
          <h3>{isWifiKamere ? "WiFi kamere" : "Videonadzor"}</h3>
        </div>
        <TrakStevila value={sistem.steviloLokacij} min={1} max={64} onChange={setCount} />
        <strong className="zahteva-system-price">{formatPrice(total)}</strong>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Odstrani sistem">
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </header>

      <SekcijaKameraNosilec
        productById={productById}
        cameraMode={isWifiKamere ? "reolink_wifi" : "ip"}
        onAddVariant={(camera, bracket) => addVariants(camera, [bracket])}
      />
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
      {!isWifiKamere ? (
        <>
          <SekcijaSnemalnik videonadzor={videonadzor} productById={productById} onChange={updateVideo} />
          <SekcijaPoESwitch videonadzor={videonadzor} productById={productById} onChange={updateVideo} />
          <SekcijaDisk videonadzor={videonadzor} productById={productById} onChange={updateVideo} />
        </>
      ) : null}
      <SekcijaIzvedba
        sistem={sistem}
        settings={executionSettings}
        productById={productById}
        onChange={(execution) => onChange({ ...sistem, execution })}
      />

      <DodajVariantoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cameraMode={isWifiKamere ? "reolink_wifi" : "ip"}
        onConfirm={addVariants}
      />
    </section>
  );
}
