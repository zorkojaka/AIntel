import { Network } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { getProductImageUrl, type CenikProduct } from "../../api";
import type { Videonadzor } from "./utils";
import { assignedCameraProducts, formatPrice, standardPorts } from "./utils";

type Props = {
  videonadzor: Videonadzor;
  productById: Map<string, CenikProduct>;
  onChange: (next: Videonadzor) => void;
};

export function SekcijaPoESwitch({ videonadzor, productById, onChange }: Props) {
  const cameras = useMemo(() => assignedCameraProducts(videonadzor, productById), [productById, videonadzor]);
  const selectedNvr = videonadzor.snemalnik.productId ? productById.get(videonadzor.snemalnik.productId) : null;
  const allPoE = cameras.length > 0 && cameras.every((camera) => camera.classification?.hasPoE);
  const nvrPoePorts = selectedNvr?.classification?.nvrHasPoE ? selectedNvr.classification.nvrChannels ?? 0 : 0;
  const neededPorts = allPoE ? Math.max(0, cameras.length - nvrPoePorts) : 0;
  const recommendedPorts = standardPorts(neededPorts);
  const autoAppliedRef = useRef("");

  const alternatives = useMemo(
    () =>
      Array.from(productById.values())
        .filter((product) => product.classification?.productType === "switch")
        .filter((product) => (product.classification?.poePortCount ?? 0) >= Math.max(1, recommendedPorts))
        .sort((a, b) => (a.classification?.poePortCount ?? 0) - (b.classification?.poePortCount ?? 0) || a.prodajnaCena - b.prodajnaCena)
        .slice(0, 6),
    [productById, recommendedPorts],
  );

  useEffect(() => {
    const signature = `${neededPorts}|${alternatives[0]?._id ?? ""}`;
    if (autoAppliedRef.current === signature) return;
    autoAppliedRef.current = signature;
    if (neededPorts <= 0 && videonadzor.poeSwitch.productId) {
      onChange({ ...videonadzor, poeSwitch: { productId: null } });
    } else if (neededPorts > 0 && !videonadzor.poeSwitch.productId && alternatives[0]) {
      onChange({ ...videonadzor, poeSwitch: { productId: alternatives[0]._id } });
    }
  }, [alternatives, neededPorts, onChange, videonadzor]);

  return (
    <section className="zahteva-subsection">
      <div className="zahteva-subsection-title">
        <Network className="h-4 w-4" aria-hidden />
        <h4>PoE switch</h4>
        <small>snemalnik ima {nvrPoePorts} PoE</small>
      </div>
      <div className="zahteva-product-track">
        <button
          type="button"
          className={`zahteva-track-card zahteva-none-card ${!videonadzor.poeSwitch.productId ? "is-active is-recommended" : ""}`}
          onClick={() => onChange({ ...videonadzor, poeSwitch: { productId: null } })}
        >
          <strong>Brez switcha</strong>
          <small>{neededPorts <= 0 ? "priporočen" : "ročno izbrano"}</small>
          <b>0,00 €</b>
        </button>
        {alternatives.map((product) => (
          <button
            key={product._id}
            type="button"
            className={`zahteva-track-card ${videonadzor.poeSwitch.productId === product._id ? "is-active" : ""}`}
            onClick={() => onChange({ ...videonadzor, poeSwitch: { productId: product._id } })}
          >
            {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
            <strong>{product.ime}</strong>
            <small>{product.classification?.poePortCount ?? "-"} PoE portov</small>
            <b>{formatPrice(product.prodajnaCena)}</b>
          </button>
        ))}
      </div>
    </section>
  );
}
