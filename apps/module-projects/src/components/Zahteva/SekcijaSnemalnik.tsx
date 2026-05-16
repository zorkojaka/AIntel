import { Server } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { getProductImageUrl, type CenikProduct } from "../../api";
import type { Videonadzor } from "./utils";
import { assignedCameraProducts, formatPrice, standardChannels } from "./utils";

type Props = {
  videonadzor: Videonadzor;
  productById: Map<string, CenikProduct>;
  onChange: (next: Videonadzor) => void;
};

function dominantBrand(products: CenikProduct[]) {
  const counts = new Map<string, number>();
  products.forEach((product) => {
    const brand = product.classification?.manufacturer || product.proizvajalec || "";
    if (!brand) return;
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function hddLabel(slots?: number) {
  const count = Math.max(1, Number(slots) || 1);
  return `${count} ${count === 1 ? "disk" : count === 2 ? "diska" : "diski"}`;
}

export function SekcijaSnemalnik({ videonadzor, productById, onChange }: Props) {
  const cameraProducts = useMemo(() => assignedCameraProducts(videonadzor, productById), [productById, videonadzor]);
  const cameraCount = Math.max(cameraProducts.length, videonadzor.lokacije.length);
  const brand = dominantBrand(cameraProducts);
  const allPoE = cameraProducts.length > 0 && cameraProducts.every((camera) => camera.classification?.hasPoE);
  const neededChannels = standardChannels(cameraCount);
  const autoAppliedRef = useRef("");

  const alternatives = useMemo(
    () =>
      Array.from(productById.values())
        .filter((product) => product.classification?.productType === "snemalnik")
        .filter((product) => (product.classification?.nvrChannels ?? 0) >= neededChannels)
        .sort((a, b) => {
          const brandScore =
            Number((b.classification?.manufacturer || b.proizvajalec) === brand) - Number((a.classification?.manufacturer || a.proizvajalec) === brand);
          const poeScore = Number(Boolean(b.classification?.nvrHasPoE) === allPoE) - Number(Boolean(a.classification?.nvrHasPoE) === allPoE);
          return brandScore || poeScore || (a.classification?.nvrChannels ?? 0) - (b.classification?.nvrChannels ?? 0) || a.prodajnaCena - b.prodajnaCena;
        })
        .slice(0, 6),
    [allPoE, brand, neededChannels, productById],
  );

  useEffect(() => {
    if (videonadzor.snemalnik.productId || alternatives.length === 0 || cameraCount === 0) return;
    const signature = `${cameraCount}|${brand}|${allPoE}`;
    if (autoAppliedRef.current === signature) return;
    autoAppliedRef.current = signature;
    onChange({ ...videonadzor, snemalnik: { productId: alternatives[0]._id } });
  }, [allPoE, alternatives, brand, cameraCount, onChange, videonadzor]);

  return (
    <section className="zahteva-subsection">
      <div className="zahteva-subsection-title">
        <Server className="h-4 w-4" aria-hidden />
        <h4>Snemalnik</h4>
      </div>
      <div className="zahteva-product-track">
        {alternatives.map((product, index) => (
          <button
            key={product._id}
            type="button"
            className={`zahteva-track-card ${videonadzor.snemalnik.productId === product._id ? "is-active" : ""} ${index === 0 ? "is-recommended" : ""}`}
            onClick={() => onChange({ ...videonadzor, snemalnik: { productId: product._id } })}
          >
            {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
            <strong>{product.ime}</strong>
            <small className="zahteva-nvr-spec">
              {product.classification?.nvrChannels ?? "-"} kanalov
              {product.classification?.nvrHasPoE ? " • PoE" : ""} • {hddLabel(product.classification?.nvrHddSlots)}
            </small>
            <b>{formatPrice(product.prodajnaCena)}</b>
          </button>
        ))}
      </div>
    </section>
  );
}
