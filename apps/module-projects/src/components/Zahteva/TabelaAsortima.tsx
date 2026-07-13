import { PhotoManager, usePhotoCount, type PhotoContext } from "@aintel/ui";
import { Camera, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getProductImageUrl, type CenikProduct } from "../../api";
import type { AsortimaVariant, Lokacija, Videonadzor } from "./utils";
import { assignmentCount, productLabel } from "./utils";

type TabelaAsortimaProps = {
  projectId: string;
  zahtevaId: string;
  sistemId: string;
  videonadzor: Videonadzor;
  productById: Map<string, CenikProduct>;
  onAssign: (lokacijaId: string, variantId: string) => void;
  onRenameLokacija: (lokacijaId: string, ime: string) => void;
  onAddVarianta: () => void;
  onRemoveVarianta: (variantId: string) => void;
};

export function buildZahtevaLocationPhotoItemId(zahtevaId: string, sistemId: string, lokacijaId: string) {
  return `zahteva-location:${zahtevaId}:${sistemId}:${lokacijaId}`;
}

export function TabelaAsortima({
  projectId,
  zahtevaId,
  sistemId,
  videonadzor,
  productById,
  onAssign,
  onRenameLokacija,
  onAddVarianta,
  onRemoveVarianta,
}: TabelaAsortimaProps) {
  const [photoDialog, setPhotoDialog] = useState<{ lokacija: Lokacija; context: PhotoContext } | null>(null);
  const [photoCountRefreshKey, setPhotoCountRefreshKey] = useState(0);

  return (
    <>
      <div className="zahteva-table-scroll">
        <table className="zahteva-asortima-table">
          <thead>
            <tr>
              <th>Lokacija</th>
              <th className="zahteva-photo-column">Slike</th>
              {videonadzor.asortima.map((variant) => (
                <VariantHeader
                  key={variant.id}
                  variant={variant}
                  videonadzor={videonadzor}
                  productById={productById}
                  onRemove={() => onRemoveVarianta(variant.id)}
                />
              ))}
              <th className="zahteva-add-column">
                <button type="button" onClick={onAddVarianta} aria-label="Dodaj varianto">
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {videonadzor.lokacije.map((lokacija) => (
              <LokacijaRow
                key={lokacija.id}
                projectId={projectId}
                zahtevaId={zahtevaId}
                sistemId={sistemId}
                lokacija={lokacija}
                variants={videonadzor.asortima}
                productById={productById}
                photoCountRefreshKey={photoCountRefreshKey}
                onOpenPhotos={(context) => setPhotoDialog({ lokacija, context })}
                onAssign={onAssign}
                onRename={onRenameLokacija}
              />
            ))}
            <tr className="zahteva-empty-row">
              <td>Lokacija {videonadzor.lokacije.length + 1}...</td>
              <td />
              {videonadzor.asortima.map((variant) => <td key={variant.id}>□</td>)}
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
          description="Fotografije se prenesejo v Pripravo pri kameri na tej lokaciji."
          inlineCameraCapture
          onPhotoCountChange={() => setPhotoCountRefreshKey((value) => value + 1)}
        />
      ) : null}
    </>
  );
}

function ProductPairImages({ camera, bracket }: { camera?: CenikProduct | null; bracket?: CenikProduct | null }) {
  return (
    <span className="zahteva-product-pair-images">
      {getProductImageUrl(camera) ? <img src={getProductImageUrl(camera)} alt="" /> : <span className="zahteva-image-empty" />}
      {bracket ? (
        getProductImageUrl(bracket) ? <img src={getProductImageUrl(bracket)} alt="" /> : <span className="zahteva-image-empty" />
      ) : (
        <span className="zahteva-image-empty" />
      )}
    </span>
  );
}

function VariantHeader({
  variant,
  videonadzor,
  productById,
  onRemove,
}: {
  variant: AsortimaVariant;
  videonadzor: Videonadzor;
  productById: Map<string, CenikProduct>;
  onRemove: () => void;
}) {
  const camera = productById.get(variant.kameraProductId);
  const bracket = variant.nosilecProductId ? productById.get(variant.nosilecProductId) : null;
  const count = assignmentCount(videonadzor, variant.id);
  return (
    <th>
      <button type="button" className="zahteva-variant-head" onClick={onRemove} title="Odstrani varianto">
        <span className="zahteva-variant-letter">{variant.id}</span>
        <ProductPairImages camera={camera} bracket={bracket} />
        <small>{productLabel(camera)}</small>
        <small>{bracket ? productLabel(bracket) : "Brez nosilca"}</small>
        <b>×{count}</b>
      </button>
    </th>
  );
}

function cameraInfo(camera?: CenikProduct | null) {
  const mp = camera?.classification?.maxResolutionMP ? `${camera.classification.maxResolutionMP}MP` : "";
  const housing = camera?.classification?.cameraHousing ?? "";
  return [mp, housing].filter(Boolean).join(" ") || productLabel(camera);
}

function bracketInfo(bracket?: CenikProduct | null) {
  return bracket ? productLabel(bracket) : "Brez nosilca";
}

function LokacijaRow({
  projectId,
  zahtevaId,
  sistemId,
  lokacija,
  variants,
  productById,
  photoCountRefreshKey,
  onOpenPhotos,
  onAssign,
  onRename,
}: {
  projectId: string;
  zahtevaId: string;
  sistemId: string;
  lokacija: Lokacija;
  variants: AsortimaVariant[];
  productById: Map<string, CenikProduct>;
  photoCountRefreshKey: number;
  onOpenPhotos: (context: PhotoContext) => void;
  onAssign: (lokacijaId: string, variantId: string) => void;
  onRename: (lokacijaId: string, ime: string) => void;
}) {
  const missing = !lokacija.asortimaIdAssigned;
  const photoContext = useMemo<PhotoContext>(
    () => ({
      projectId,
      phase: "requirements",
      itemId: buildZahtevaLocationPhotoItemId(zahtevaId, sistemId, lokacija.id),
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
      {variants.map((variant) => {
        const checked = lokacija.asortimaIdAssigned === variant.id;
        const camera = productById.get(variant.kameraProductId);
        const bracket = variant.nosilecProductId ? productById.get(variant.nosilecProductId) : null;
        return (
          <td key={variant.id}>
            <button
              type="button"
              className={`zahteva-assignment-button ${checked ? "is-selected" : ""}`}
              onClick={() => onAssign(lokacija.id, variant.id)}
              aria-label={`Dodeli varianto ${variant.id}`}
            >
              {checked ? (
                <span className="zahteva-assignment-info">
                  <ProductPairImages camera={camera} bracket={bracket} />
                  <small>{cameraInfo(camera)}</small>
                  <small>{bracketInfo(bracket)}</small>
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
