import { MemoryStick, Package } from "lucide-react";
import type { ReactNode } from "react";
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

function isMicroSdCard(product: CenikProduct) {
  const name = (product.ime ?? "").toLocaleLowerCase("sl-SI");
  return /\b(micro\s*sd|microsd)\b/.test(name) && /\b(128|256|512)\s*gb\b/.test(name);
}

function isReolinkJunctionBox(product: CenikProduct) {
  const text = `${product.ime ?? ""} ${product.proizvajalec ?? ""} ${product.classification?.manufacturer ?? ""} ${(product.categorySlugs ?? []).join(" ")}`.toLocaleLowerCase("sl-SI");
  const isReolink = /\b(reolink|reo)\b/.test(text);
  const isJunctionBox = /junction\s*box|junctionbox|\bd20\b|doza|podnož|podnoz|nosilec/.test(text);
  const isCamera = product.classification?.productType === "kamera" || /\bkamera|camera\b/.test(text);
  return isReolink && isJunctionBox && !isCamera;
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
        .filter(isMicroSdCard)
        .sort((a, b) => categoryPriorityRank(a) - categoryPriorityRank(b) || a.prodajnaCena - b.prodajnaCena || a.ime.localeCompare(b.ime, "sl")),
    [productById],
  );
  const junctionBoxes = useMemo(
    () =>
      Array.from(productById.values())
        .filter(isReolinkJunctionBox)
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
    <>
      <AccessorySection
        icon={<MemoryStick className="h-4 w-4" aria-hidden />}
        title="MicroSD pomnilniška kartica"
        products={microSdCards}
        emptyText="V ceniku ni MicroSD kartic 128GB, 256GB ali 512GB."
        items={videonadzor.dodatnaOprema ?? []}
        suggestedQuantity={Math.max(1, assignedCameraCount(videonadzor))}
        onSetQuantity={setQuantity}
      />
      <AccessorySection
        icon={<Package className="h-4 w-4" aria-hidden />}
        title="Reolink nosilec / junction box"
        products={junctionBoxes}
        emptyText="V ceniku ni Reolink D20/JunctionBox nosilca."
        items={videonadzor.dodatnaOprema ?? []}
        suggestedQuantity={Math.max(1, assignedCameraCount(videonadzor))}
        onSetQuantity={setQuantity}
      />
    </>
  );
}

function AccessorySection({
  icon,
  title,
  products,
  emptyText,
  items,
  suggestedQuantity,
  onSetQuantity,
}: {
  icon: ReactNode;
  title: string;
  products: CenikProduct[];
  emptyText: string;
  items: Array<{ productId: string; kolicina: number }>;
  suggestedQuantity: number;
  onSetQuantity: (productId: string, quantity: number) => void;
}) {
  return (
    <section className="zahteva-subsection">
      <div className="zahteva-subsection-title">
        {icon}
        <h4>{title}</h4>
      </div>
      <div className="zahteva-product-track zahteva-alarm-track">
        {products.map((product) => {
          const quantity = selectedQuantity(items, product._id);
          return (
            <div key={product._id} className={`zahteva-track-card zahteva-alarm-card ${quantity > 0 ? "is-active" : ""}`} title={product.ime}>
              <button type="button" className="zahteva-track-main" onClick={() => onSetQuantity(product._id, quantity > 0 ? quantity : suggestedQuantity)}>
                {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
                <strong>{product.ime}</strong>
                <small>{title}</small>
                <b>{formatPrice(product.prodajnaCena)}</b>
              </button>
              <div className="zahteva-qty-control">
                <button type="button" onClick={() => onSetQuantity(product._id, quantity - 1)} aria-label={`Zmanjšaj ${product.ime}`}>-</button>
                <span>{quantity}</span>
                <button type="button" onClick={() => onSetQuantity(product._id, quantity + 1)} aria-label={`Povečaj ${product.ime}`}>+</button>
              </div>
            </div>
          );
        })}
        {products.length === 0 ? <div className="zahteva-empty">{emptyText}</div> : null}
      </div>
    </section>
  );
}
