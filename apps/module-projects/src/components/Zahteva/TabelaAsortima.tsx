import { Plus } from "lucide-react";
import { getProductImageUrl, type CenikProduct } from "../../api";
import type { AsortimaVariant, Lokacija, Videonadzor } from "./utils";
import { assignmentCount, productLabel } from "./utils";

type TabelaAsortimaProps = {
  videonadzor: Videonadzor;
  productById: Map<string, CenikProduct>;
  onAssign: (lokacijaId: string, variantId: string) => void;
  onRenameLokacija: (lokacijaId: string, ime: string) => void;
  onAddVarianta: () => void;
  onRemoveVarianta: (variantId: string) => void;
};

export function TabelaAsortima({
  videonadzor,
  productById,
  onAssign,
  onRenameLokacija,
  onAddVarianta,
  onRemoveVarianta,
}: TabelaAsortimaProps) {
  return (
    <div className="zahteva-table-scroll">
      <table className="zahteva-asortima-table">
        <thead>
          <tr>
            <th>Lokacija</th>
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
              lokacija={lokacija}
              variants={videonadzor.asortima}
              onAssign={onAssign}
              onRename={onRenameLokacija}
            />
          ))}
          <tr className="zahteva-empty-row">
            <td>Lokacija {videonadzor.lokacije.length + 1}...</td>
            {videonadzor.asortima.map((variant) => <td key={variant.id}>□</td>)}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
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
  const count = assignmentCount(videonadzor, variant.id);
  return (
    <th>
      <button type="button" className="zahteva-variant-head" onClick={onRemove} title="Odstrani varianto">
        {getProductImageUrl(camera) ? <img src={getProductImageUrl(camera)} alt="" /> : <span className="zahteva-image-empty" />}
        <span className="zahteva-variant-letter">{variant.id}</span>
        <small>{productLabel(camera)}</small>
        <b>×{count}</b>
      </button>
    </th>
  );
}

function LokacijaRow({
  lokacija,
  variants,
  onAssign,
  onRename,
}: {
  lokacija: Lokacija;
  variants: AsortimaVariant[];
  onAssign: (lokacijaId: string, variantId: string) => void;
  onRename: (lokacijaId: string, ime: string) => void;
}) {
  const missing = !lokacija.asortimaIdAssigned;
  return (
    <tr className={missing ? "is-warning" : ""}>
      <td>
        <input value={lokacija.ime} onChange={(event) => onRename(lokacija.id, event.target.value)} aria-label="Ime lokacije" />
      </td>
      {variants.map((variant) => {
        const checked = lokacija.asortimaIdAssigned === variant.id;
        return (
          <td key={variant.id}>
            <button
              type="button"
              className={`zahteva-assignment-button ${checked ? "is-selected" : ""}`}
              onClick={() => onAssign(lokacija.id, variant.id)}
              aria-label={`Dodeli varianto ${variant.id}`}
            >
              {checked ? "✓" : ""}
            </button>
          </td>
        );
      })}
      <td />
    </tr>
  );
}
