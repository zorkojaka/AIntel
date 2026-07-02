import { MemoryStick } from "lucide-react";
import { useMemo } from "react";
import { getProductImageUrl, type CenikProduct } from "../../api";
import type { Videonadzor } from "./utils";
import { formatPrice } from "./utils";

type Props = {
  videonadzor: Videonadzor;
  productById: Map<string, CenikProduct>;
  onChange: (next: Videonadzor) => void;
};

function categoryPriorityRank(product: CenikProduct) {
  return product.categoryPriority ?? 4;
}

function isReolinkMicroSd(product: CenikProduct) {
  const name = (product.ime ?? "").toLocaleLowerCase("sl-SI");
  const manufacturer = `${product.proizvajalec ?? ""} ${product.classification?.manufacturer ?? ""}`.toLocaleLowerCase("sl-SI");
  return /\b(micro\s*sd|microsd)\b/.test(name) && manufacturer.includes("reolink");
}

function selectedQuantity(items: Array<{ productId: string; kolicina: number }>, productId: string) {
  return items.find((item) => item.productId === productId)?.kolicina ?? 0;
}

function assignedCameraCount(videonadzor: Videonadzor) {
  const assigned = videonadzor.lokacije.filter((lokacija) => Boolean(lokacija.asortimaIdAssigned)).length;
  return assigned > 0 ? assigned : videonadzor.asortima.length;
}

export function SekcijaReolinkDodatnaOprema({ videonadzor, productById, onChange }: Props) {
  const microSdCards = useMemo(
    () =>
      Array.from(productById.values())
        .filter(isReolinkMicroSd)
        .sort((a, b) => categoryPriorityRank(a) - categoryPriorityRank(b) || a.prodajnaCena - b.prodajnaCena || a.ime.localeCompare(b.ime, "sl")),
    [productById],
  );

  const setQuantity = (productId: string, quantity: number) => {
    const nextQuantity = Math.max(0, Math.min(99, Math.round(quantity)));
    const byId = new Map((videonadzor.dodatnaOprema ?? []).map((item) => [item.productId, item.kolicina]));
    if (nextQuantity > 0) byId.set(productId, nextQuantity);
    else byId.delete(productId);
    onChange({
      ...videonadzor,
      dodatnaOprema: Array.from(byId.entries()).map(([id, kolicina]) => ({ productId: id, kolicina })),
    });
  };

  return (
    <section className="zahteva-subsection">
      <div className="zahteva-subsection-title">
        <MemoryStick className="h-4 w-4" aria-hidden />
        <h4>MicroSD pomnilniška kartica</h4>
      </div>
      <div className="zahteva-product-track zahteva-alarm-track">
        {microSdCards.map((product) => {
          const quantity = selectedQuantity(videonadzor.dodatnaOprema ?? [], product._id);
          const suggestedQuantity = Math.max(1, assignedCameraCount(videonadzor));
          return (
            <div key={product._id} className={`zahteva-track-card zahteva-alarm-card ${quantity > 0 ? "is-active" : ""}`} title={product.ime}>
              <button type="button" className="zahteva-track-main" onClick={() => setQuantity(product._id, quantity > 0 ? quantity : suggestedQuantity)}>
                {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
                <strong>{product.ime}</strong>
                <small>Reolink MicroSD</small>
                <b>{formatPrice(product.prodajnaCena)}</b>
              </button>
              <div className="zahteva-qty-control">
                <button type="button" onClick={() => setQuantity(product._id, quantity - 1)} aria-label={`Zmanjšaj ${product.ime}`}>-</button>
                <span>{quantity}</span>
                <button type="button" onClick={() => setQuantity(product._id, quantity + 1)} aria-label={`Povečaj ${product.ime}`}>+</button>
              </div>
            </div>
          );
        })}
        {microSdCards.length === 0 ? <div className="zahteva-empty">V ceniku ni Reolink MicroSD kartic.</div> : null}
      </div>
    </section>
  );
}
