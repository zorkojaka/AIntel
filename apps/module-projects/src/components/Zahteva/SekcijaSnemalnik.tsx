import { Square, Server } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

type PoeFilter = "all" | "poe" | "no-poe";

function matchesPoeFilter(product: CenikProduct | undefined, poeFilter: PoeFilter) {
  if (poeFilter === "all") return true;
  const hasPoE = Boolean(product?.classification?.nvrHasPoE);
  return poeFilter === "poe" ? hasPoE : !hasPoE;
}

export function SekcijaSnemalnik({ videonadzor, productById, onChange }: Props) {
  const cameraProducts = useMemo(() => assignedCameraProducts(videonadzor, productById), [productById, videonadzor]);
  const cameraCount = Math.max(cameraProducts.length, videonadzor.lokacije.length);
  const brand = dominantBrand(cameraProducts);
  const allPoE = cameraProducts.length > 0 && cameraProducts.every((camera) => camera.classification?.hasPoE);
  const neededChannels = standardChannels(cameraCount);
  const [selectedChannels, setSelectedChannels] = useState(neededChannels);
  const [poeFilter, setPoeFilter] = useState<PoeFilter>("all");
  const autoAppliedRef = useRef("");
  const manualNoneRef = useRef(false);

  useEffect(() => {
    setSelectedChannels((current) => (current < neededChannels ? neededChannels : current));
  }, [neededChannels]);

  const channelOptions = useMemo(() => {
    const fromProducts = Array.from(productById.values())
      .filter((product) => product.classification?.productType === "snemalnik")
      .map((product) => Number(product.classification?.nvrChannels ?? 0))
      .filter((channels) => channels >= neededChannels);
    return Array.from(new Set([neededChannels, ...fromProducts])).sort((a, b) => a - b);
  }, [neededChannels, productById]);

  const alternatives = useMemo(
    () =>
      Array.from(productById.values())
        .filter((product) => product.classification?.productType === "snemalnik")
        .filter((product) => (product.classification?.nvrChannels ?? 0) === selectedChannels)
        .filter((product) => matchesPoeFilter(product, poeFilter))
        .sort((a, b) => {
          const brandScore =
            Number((b.classification?.manufacturer || b.proizvajalec) === brand) - Number((a.classification?.manufacturer || a.proizvajalec) === brand);
          const poeScore = Number(Boolean(b.classification?.nvrHasPoE) === allPoE) - Number(Boolean(a.classification?.nvrHasPoE) === allPoE);
          return brandScore || poeScore || (a.classification?.nvrChannels ?? 0) - (b.classification?.nvrChannels ?? 0) || a.prodajnaCena - b.prodajnaCena;
        })
        .slice(0, 6),
    [allPoE, brand, poeFilter, productById, selectedChannels],
  );

  useEffect(() => {
    if (manualNoneRef.current || alternatives.length === 0 || cameraCount === 0) return;
    const selected = videonadzor.snemalnik.productId ? productById.get(videonadzor.snemalnik.productId) : null;
    if (selected && selected.classification?.nvrChannels === selectedChannels && matchesPoeFilter(selected, poeFilter)) return;
    const signature = `${cameraCount}|${brand}|${allPoE}|${selectedChannels}|${poeFilter}`;
    if (autoAppliedRef.current === signature) return;
    autoAppliedRef.current = signature;
    onChange({ ...videonadzor, snemalnik: { productId: alternatives[0]._id } });
  }, [allPoE, alternatives, brand, cameraCount, onChange, poeFilter, productById, selectedChannels, videonadzor]);

  const clearSnemalnik = () => {
    manualNoneRef.current = true;
    autoAppliedRef.current = `${cameraCount}|${brand}|${allPoE}|${selectedChannels}|${poeFilter}`;
    onChange({
      ...videonadzor,
      snemalnik: { productId: null },
      disk: { ...videonadzor.disk, productId: null, kolicina: 0, items: [] },
    });
  };

  const selectSnemalnik = (productId: string) => {
    if (videonadzor.snemalnik.productId === productId) {
      clearSnemalnik();
      return;
    }
    manualNoneRef.current = false;
    onChange({ ...videonadzor, snemalnik: { productId: productId } });
  };

  return (
    <section className="zahteva-subsection">
      <div className="zahteva-subsection-title">
        <Server className="h-4 w-4" aria-hidden />
        <h4>Snemalnik</h4>
      </div>
      <div className="zahteva-dialog-filters">
        <FilterStrip
          label="Kanali"
          values={channelOptions.map(String)}
          selected={String(selectedChannels)}
          onSelect={(value) => {
            manualNoneRef.current = false;
            setSelectedChannels(Number(value));
          }}
        />
        <FilterStrip
          label="Napajanje"
          values={["Vse", "PoE", "Brez PoE"]}
          selected={poeFilter === "poe" ? "PoE" : poeFilter === "no-poe" ? "Brez PoE" : "Vse"}
          onSelect={(value) => {
            manualNoneRef.current = false;
            setPoeFilter(value === "PoE" ? "poe" : value === "Brez PoE" ? "no-poe" : "all");
          }}
        />
      </div>
      <div className="zahteva-product-track">
        <button
          type="button"
          className={`zahteva-track-card zahteva-none-card ${!videonadzor.snemalnik.productId ? "is-active" : ""}`}
          onClick={clearSnemalnik}
        >
          <span className="zahteva-image-empty zahteva-none-icon">
            <Square className="h-6 w-6" aria-hidden />
          </span>
          <strong>Brez snemalnika</strong>
          <small>Obstoječi sistem ali cloud snemanje</small>
          <b>0,00 €</b>
        </button>
        {alternatives.map((product, index) => (
          <button
            key={product._id}
            type="button"
            className={`zahteva-track-card ${videonadzor.snemalnik.productId === product._id ? "is-active" : ""} ${index === 0 ? "is-recommended" : ""}`}
            onClick={() => selectSnemalnik(product._id)}
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
        {alternatives.length === 0 ? <div className="zahteva-empty">Ni snemalnikov za izbrane filtre.</div> : null}
      </div>
    </section>
  );
}

function FilterStrip({ label, values, selected, onSelect }: { label: string; values: string[]; selected: string; onSelect: (value: string) => void }) {
  return (
    <div className="zahteva-filter-row">
      <span>{label}</span>
      <div>
        {values.map((value) => (
          <button key={value} type="button" className={selected === value ? "is-active" : ""} onClick={() => onSelect(value)}>
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
