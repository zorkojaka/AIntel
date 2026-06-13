import { PhotoManager, usePhotoCount, type PhotoContext } from "@aintel/ui";
import { Camera, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getProductImageUrl, type CenikProduct } from "../../api";
import type { Alarm, AlarmLokacija, AlarmSenzor } from "./utils";
import { alarmAssignmentCount, productLabel } from "./utils";

type TabelaAlarmProps = {
  projectId: string;
  zahtevaId: string;
  sistemId: string;
  alarm: Alarm;
  productById: Map<string, CenikProduct>;
  onAssign: (lokacijaId: string, senzorId: string) => void;
  onRenameLokacija: (lokacijaId: string, ime: string) => void;
  onAddSenzor: () => void;
  onRemoveSenzor: (senzorId: string) => void;
};

export function buildAlarmLocationPhotoItemId(zahtevaId: string, sistemId: string, lokacijaId: string) {
  return `zahteva-alarm-location:${zahtevaId}:${sistemId}:${lokacijaId}`;
}

export function TabelaAlarm({
  projectId,
  zahtevaId,
  sistemId,
  alarm,
  productById,
  onAssign,
  onRenameLokacija,
  onAddSenzor,
  onRemoveSenzor,
}: TabelaAlarmProps) {
  const [photoDialog, setPhotoDialog] = useState<{ lokacija: AlarmLokacija; context: PhotoContext } | null>(null);
  const [photoCountRefreshKey, setPhotoCountRefreshKey] = useState(0);

  return (
    <>
      <div className="zahteva-table-scroll">
        <table className="zahteva-asortima-table">
          <thead>
            <tr>
              <th>Lokacija</th>
              <th className="zahteva-photo-column">Slike</th>
              {alarm.senzorji.map((senzor) => (
                <SenzorHeader
                  key={senzor.id}
                  senzor={senzor}
                  alarm={alarm}
                  productById={productById}
                  onRemove={() => onRemoveSenzor(senzor.id)}
                />
              ))}
              <th className="zahteva-add-column">
                <button type="button" onClick={onAddSenzor} aria-label="Dodaj senzor">
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {alarm.lokacije.map((lokacija) => (
              <LokacijaRow
                key={lokacija.id}
                projectId={projectId}
                zahtevaId={zahtevaId}
                sistemId={sistemId}
                lokacija={lokacija}
                senzorji={alarm.senzorji}
                productById={productById}
                photoCountRefreshKey={photoCountRefreshKey}
                onOpenPhotos={(context) => setPhotoDialog({ lokacija, context })}
                onAssign={onAssign}
                onRename={onRenameLokacija}
              />
            ))}
            <tr className="zahteva-empty-row">
              <td>Lokacija {alarm.lokacije.length + 1}...</td>
              <td />
              {alarm.senzorji.map((senzor) => <td key={senzor.id}>□</td>)}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {photoDialog ? (
        <PhotoManager
          open={Boolean(photoDialog)}
          onOpenChange={(open) => {
            if (!open) setPhotoDialog(null);
          }}
          context={photoDialog.context}
          title={`Slike lokacije: ${photoDialog.lokacija.ime || photoDialog.lokacija.id}`}
          description="Fotografije se shranijo k lokaciji alarmnega senzorja."
          onPhotoCountChange={() => setPhotoCountRefreshKey((value) => value + 1)}
        />
      ) : null}
    </>
  );
}

function SenzorHeader({
  senzor,
  alarm,
  productById,
  onRemove,
}: {
  senzor: AlarmSenzor;
  alarm: Alarm;
  productById: Map<string, CenikProduct>;
  onRemove: () => void;
}) {
  const product = productById.get(senzor.senzorProductId);
  const count = alarmAssignmentCount(alarm, senzor.id);
  return (
    <th>
      <button type="button" className="zahteva-variant-head" onClick={onRemove} title="Odstrani senzor">
        <span className="zahteva-variant-letter">{senzor.id}</span>
        {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
        <small>{productLabel(product)}</small>
        <b>×{count}</b>
      </button>
    </th>
  );
}

function LokacijaRow({
  projectId,
  zahtevaId,
  sistemId,
  lokacija,
  senzorji,
  productById,
  photoCountRefreshKey,
  onOpenPhotos,
  onAssign,
  onRename,
}: {
  projectId: string;
  zahtevaId: string;
  sistemId: string;
  lokacija: AlarmLokacija;
  senzorji: AlarmSenzor[];
  productById: Map<string, CenikProduct>;
  photoCountRefreshKey: number;
  onOpenPhotos: (context: PhotoContext) => void;
  onAssign: (lokacijaId: string, senzorId: string) => void;
  onRename: (lokacijaId: string, ime: string) => void;
}) {
  const missing = !lokacija.senzorIdAssigned;
  const photoContext = useMemo<PhotoContext>(
    () => ({
      projectId,
      phase: "requirements",
      itemId: buildAlarmLocationPhotoItemId(zahtevaId, sistemId, lokacija.id),
    }),
    [lokacija.id, projectId, sistemId, zahtevaId],
  );

  return (
    <tr className={missing ? "is-warning" : ""}>
      <td>
        <input value={lokacija.ime} onChange={(event) => onRename(lokacija.id, event.target.value)} aria-label="Ime lokacije" />
      </td>
      <td className="zahteva-photo-column">
        <LokacijaPhotoButton context={photoContext} refreshKey={photoCountRefreshKey} onOpen={onOpenPhotos} />
      </td>
      {senzorji.map((senzor) => {
        const checked = lokacija.senzorIdAssigned === senzor.id;
        const product = productById.get(senzor.senzorProductId);
        return (
          <td key={senzor.id}>
            <button
              type="button"
              className={`zahteva-assignment-button ${checked ? "is-selected" : ""}`}
              onClick={() => onAssign(lokacija.id, senzor.id)}
              aria-label={`Dodeli senzor ${senzor.id}`}
            >
              {checked ? (
                <span className="zahteva-assignment-info">
                  {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
                  <small>{productLabel(product)}</small>
                </span>
              ) : null}
            </button>
          </td>
        );
      })}
      <td />
    </tr>
  );
}

function LokacijaPhotoButton({
  context,
  refreshKey,
  onOpen,
}: {
  context: PhotoContext;
  refreshKey: number;
  onOpen: (context: PhotoContext) => void;
}) {
  const { count, refresh } = usePhotoCount(context);

  useEffect(() => {
    if (refreshKey > 0) refresh();
  }, [refresh, refreshKey]);

  return (
    <button
      type="button"
      className={`zahteva-location-photo-button ${count > 0 ? "has-photos" : ""}`}
      data-photo-project-id={context.projectId}
      data-photo-phase={context.phase}
      data-photo-item-id={context.itemId}
      onClick={() => onOpen(context)}
      aria-label={count > 0 ? `Slike lokacije (${count})` : "Dodaj slike lokacije"}
      title="Slike lokacije"
    >
      <Camera className="h-4 w-4" aria-hidden />
      <span>+{count}</span>
    </button>
  );
}
