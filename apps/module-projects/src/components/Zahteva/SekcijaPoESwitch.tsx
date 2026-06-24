import { Network } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getProductImageUrl, type CenikProduct } from "../../api";
import type { Videonadzor } from "./utils";
import { assignedCameraProducts, formatPrice, normalizedSelectedItems, standardPorts } from "./utils";

type Props = {
  videonadzor: Videonadzor;
  productById: Map<string, CenikProduct>;
  onChange: (next: Videonadzor) => void;
};

function syncPrimary<T extends { productId: string; kolicina: number }>(items: T[]) {
  const first = items.find((item) => item.kolicina > 0);
  return { productId: first?.productId ?? null, kolicina: first?.kolicina ?? 0, items };
}

function categoryPriorityRank(product: CenikProduct) {
  return product.categoryPriority ?? 4;
}

function productBrand(product: CenikProduct) {
  return product.classification?.manufacturer || product.proizvajalec || "Brez proizvajalca";
}

function defaultManufacturer(values: string[]) {
  return values.includes("DVC") ? "DVC" : values[0] ?? "";
}

function poeSwitchText(product: CenikProduct | undefined) {
  if (!product) return "";
  return [
    product.ime,
    product.kratekOpis,
    product.dolgOpis,
    product.povezavaDoSlike,
    product.aaData?.productCode,
    product.aaData?.rawDescription,
    ...(product.categorySlugs ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function parsedPoePortCount(product: CenikProduct | undefined) {
  const text = poeSwitchText(product);
  const patterns = [
    /poe\s*out\s*port\s*:\s*(\d+)\s*x/i,
    /downlink\s*:\s*(\d+)\s*x[^,;.]*poe\s*port/i,
    /(\d+)\s*x[^,;.]*rj45\s*poe\s*port/i,
    /(\d+)\s*x\s*802\.3[a-z0-9/.+\s-]*poe/i,
    /(\d+)\s*[- ]?portno[^,;.]*poe/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return 0;
}

function poePortCount(product: CenikProduct | undefined) {
  const parsed = parsedPoePortCount(product);
  if (parsed > 0) return parsed;
  return Number(product?.classification?.poePortCount ?? 0);
}

function switchFitRank(product: CenikProduct, neededPorts: number) {
  const ports = poePortCount(product);
  if (neededPorts <= 0) return ports;
  const coversNeed = ports >= neededPorts ? 0 : 1;
  const distance = coversNeed === 0 ? ports - neededPorts : neededPorts - ports + 100;
  return coversNeed * 1000 + distance;
}

export function SekcijaPoESwitch({ videonadzor, productById, onChange }: Props) {
  const cameras = useMemo(() => assignedCameraProducts(videonadzor, productById), [productById, videonadzor]);
  const selectedNvr = videonadzor.snemalnik.productId ? productById.get(videonadzor.snemalnik.productId) : null;
  const allPoE = cameras.length > 0 && cameras.every((camera) => camera.classification?.hasPoE);
  const nvrPoePorts = selectedNvr?.classification?.nvrHasPoE ? selectedNvr.classification.nvrChannels ?? 0 : 0;
  const neededPorts = allPoE ? Math.max(0, cameras.length - nvrPoePorts) : 0;
  const recommendedPorts = standardPorts(neededPorts);
  const selectedItems = normalizedSelectedItems(videonadzor.poeSwitch);
  const selectedPorts = selectedItems.reduce((sum, item) => sum + poePortCount(productById.get(item.productId)) * item.kolicina, 0);
  const [manufacturer, setManufacturer] = useState("");
  const recommendedCardRef = useRef<HTMLDivElement | null>(null);
  const manualNoneRef = useRef(false);

  const allSwitches = useMemo(
    () =>
      Array.from(productById.values())
        .filter((product) => product.classification?.productType === "switch")
        .filter((product) => poePortCount(product) > 0),
    [productById],
  );
  const manufacturers = useMemo(() => Array.from(new Set(allSwitches.map(productBrand))).sort((a, b) => a.localeCompare(b, "sl")), [allSwitches]);
  const manufacturerSwitches = useMemo(
    () => allSwitches.filter((product) => !manufacturer || productBrand(product) === manufacturer),
    [allSwitches, manufacturer],
  );

  useEffect(() => {
    if (!manufacturer && manufacturers.length) setManufacturer(defaultManufacturer(manufacturers));
    else if (manufacturer && !manufacturers.includes(manufacturer)) setManufacturer(defaultManufacturer(manufacturers));
  }, [manufacturer, manufacturers]);

  const alternatives = useMemo(
    () =>
      [...manufacturerSwitches].sort((a, b) => {
        const portScore = poePortCount(a) - poePortCount(b);
        const priority = categoryPriorityRank(a) - categoryPriorityRank(b);
        if (priority !== 0) return priority;
        const fit = switchFitRank(a, neededPorts) - switchFitRank(b, neededPorts);
        if (fit !== 0) return fit;
        return portScore || a.prodajnaCena - b.prodajnaCena;
      }),
    [manufacturerSwitches, neededPorts],
  );

  const recommendedId =
    alternatives
      .filter((product) => poePortCount(product) >= Math.max(neededPorts, recommendedPorts))
      .sort((a, b) => categoryPriorityRank(a) - categoryPriorityRank(b) || poePortCount(a) - poePortCount(b) || a.prodajnaCena - b.prodajnaCena)[0]?._id ?? alternatives[0]?._id;

  useEffect(() => {
    recommendedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, [manufacturer, recommendedId]);

  useEffect(() => {
    if (manualNoneRef.current || neededPorts <= 0 || !recommendedId || videonadzor.poeSwitch.productId === recommendedId) return;
    onChange({ ...videonadzor, poeSwitch: syncPrimary([{ productId: recommendedId, kolicina: 1 }]) });
  }, [neededPorts, onChange, recommendedId, videonadzor]);

  const setQuantity = (productId: string, quantity: number) => {
    const nextQuantity = Math.max(0, Math.min(99, Math.round(quantity)));
    manualNoneRef.current = nextQuantity <= 0;
    const byId = new Map(selectedItems.map((item) => [item.productId, item.kolicina]));
    if (nextQuantity > 0) byId.set(productId, nextQuantity);
    else byId.delete(productId);
    const items = Array.from(byId.entries()).map(([id, kolicina]) => ({ productId: id, kolicina }));
    if (items.length > 0) manualNoneRef.current = false;
    onChange({ ...videonadzor, poeSwitch: syncPrimary(items) });
  };

  const clearSwitches = () => {
    manualNoneRef.current = true;
    onChange({ ...videonadzor, poeSwitch: { productId: null, kolicina: 0, items: [] } });
  };

  return (
    <section className="zahteva-subsection">
      <div className="zahteva-subsection-title">
        <Network className="h-4 w-4" aria-hidden />
        <h4>PoE switch</h4>
        <small>snemalnik ima {nvrPoePorts} PoE</small>
      </div>
      <div className={`zahteva-capacity-note ${selectedPorts >= neededPorts ? "is-ok" : "is-warning"}`}>
        Potrebnih {neededPorts} PoE portov • izbrano {selectedPorts} portov {selectedPorts >= neededPorts ? "✓" : "⚠"}
      </div>
      <div className="zahteva-dialog-filters">
        <FilterStrip label="Proizvajalec" values={manufacturers} selected={manufacturer} onSelect={setManufacturer} />
      </div>
      <div className="zahteva-product-track">
        <button type="button" style={{ order: neededPorts <= 0 ? -1 : 1 }} className={`zahteva-track-card zahteva-none-card ${selectedItems.length === 0 ? "is-active" : ""}`} onClick={clearSwitches}>
          <strong>Brez switcha</strong>
          <small>{neededPorts <= 0 ? "priporočeno" : "ni dovolj portov"}</small>
          <b>0,00 €</b>
        </button>
        {alternatives.map((product) => {
          const quantity = selectedItems.find((item) => item.productId === product._id)?.kolicina ?? 0;
          return (
            <div
              key={product._id}
              ref={product._id === recommendedId ? recommendedCardRef : undefined}
              className={`zahteva-track-card ${quantity > 0 ? "is-active" : ""} ${product._id === recommendedId ? "is-recommended" : ""}`}
            >
              <button type="button" className="zahteva-track-main" onClick={() => setQuantity(product._id, quantity > 0 ? quantity : 1)}>
                {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
                <strong>{product.ime}</strong>
                <small>{poePortCount(product) || "-"} PoE portov</small>
                <b>{formatPrice(product.prodajnaCena)}</b>
              </button>
              <div className="zahteva-qty-control">
                <button type="button" onClick={() => setQuantity(product._id, quantity - 1)} aria-label={`Zmanjšaj ${product.ime}`}>−</button>
                <span>{quantity}</span>
                <button type="button" onClick={() => setQuantity(product._id, quantity + 1)} aria-label={`Povečaj ${product.ime}`}>+</button>
              </div>
            </div>
          );
        })}
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
