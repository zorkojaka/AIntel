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
    const brand = productBrand(product);
    if (brand === "Brez proizvajalca") return;
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function productBrand(product: CenikProduct) {
  const slugs = product.categorySlugs ?? [];
  if (product.classification?.manufacturer) return product.classification.manufacturer;
  if (product.proizvajalec) return product.proizvajalec;
  if (/\bdrn[-\s]/i.test(`${product.ime ?? ""} ${product.aaData?.productCode ?? ""}`)) return "DVC";
  if (slugs.some((slug) => slug.toLowerCase() === "dvc")) return "DVC";
  return "Brez proizvajalca";
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

function poeGroup(product: CenikProduct) {
  return product.classification?.nvrHasPoE ? 0 : 1;
}

function categoryPriorityRank(product: CenikProduct) {
  return product.categoryPriority ?? 4;
}

function recorderText(product: CenikProduct) {
  return [
    product.ime,
    product.externalId,
    product.externalKey,
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

function recorderChannels(product: CenikProduct) {
  const classified = Number(product.classification?.nvrChannels ?? 0);
  if (classified > 0) return classified;
  const text = recorderText(product);
  const prefixMatch = text.match(/\b(4|8|16|32|64)\s*[- ]*(?:kanal(?:ni|ov)?|channel|ch|kamer|cameras)\b/i);
  if (prefixMatch) return Number(prefixMatch[1]);
  const labelMatch = text.match(/\b(?:number of cameras|kamer(?:e|a)?)\s*:\s*(4|8|16|32|64)\b/i);
  return labelMatch ? Number(labelMatch[1]) : 0;
}

function isIpRecorder(product: CenikProduct) {
  const text = recorderText(product);
  if (/\b(dra|dvr|ahd|analog)\b/i.test(text)) return false;
  const isRecorderCategory = (product.categorySlugs ?? []).some((slug) => slug.toLowerCase() === "snemalnik");
  return product.classification?.productType === "snemalnik" || isRecorderCategory || /\b(drn|nvr)\b/i.test(text);
}

export function SekcijaSnemalnik({ videonadzor, productById, onChange }: Props) {
  const cameraProducts = useMemo(() => assignedCameraProducts(videonadzor, productById), [productById, videonadzor]);
  const cameraCount = Math.max(cameraProducts.length, videonadzor.lokacije.length);
  const cameraBrand = dominantBrand(cameraProducts);
  const allPoE = cameraProducts.length > 0 && cameraProducts.every((camera) => camera.classification?.hasPoE);
  const neededChannels = standardChannels(cameraCount);
  const [manufacturer, setManufacturer] = useState("");
  const [selectedChannels, setSelectedChannels] = useState(neededChannels);
  const [poeFilter, setPoeFilter] = useState<PoeFilter>("all");
  const autoAppliedRef = useRef("");
  const manualNoneRef = useRef(false);
  const recommendedCardRef = useRef<HTMLButtonElement | null>(null);

  const allRecorders = useMemo(
    () => Array.from(productById.values()).filter(isIpRecorder),
    [productById],
  );
  const manufacturers = useMemo(() => Array.from(new Set(allRecorders.map(productBrand))).sort((a, b) => a.localeCompare(b, "sl")), [allRecorders]);
  const manufacturerOptions = useMemo(() => ["Vsi", ...manufacturers], [manufacturers]);
  const manufacturerRecorders = useMemo(
    () => allRecorders.filter((product) => !manufacturer || productBrand(product) === manufacturer),
    [allRecorders, manufacturer],
  );

  useEffect(() => {
    if (manufacturer && !manufacturers.includes(manufacturer)) setManufacturer("");
  }, [manufacturer, manufacturers]);

  const channelOptions = useMemo(() => {
    const fromProducts = manufacturerRecorders
      .map(recorderChannels)
      .filter((channels) => channels > 0);
    return Array.from(new Set([neededChannels, ...fromProducts])).sort((a, b) => a - b);
  }, [manufacturerRecorders, neededChannels]);

  useEffect(() => {
    if (selectedChannels < neededChannels) {
      setSelectedChannels(neededChannels);
      return;
    }
    if (channelOptions.length && !channelOptions.includes(selectedChannels)) setSelectedChannels(channelOptions[0]);
  }, [channelOptions, neededChannels, selectedChannels]);

  const alternatives = useMemo(
    () =>
      manufacturerRecorders
        .filter((product) => matchesPoeFilter(product, poeFilter))
        .sort((a, b) => {
          const channelScore = recorderChannels(a) - recorderChannels(b);
          const visiblePoeScore = poeFilter === "all" ? poeGroup(a) - poeGroup(b) : 0;
          const priorityScore = categoryPriorityRank(a) - categoryPriorityRank(b);
          const brandScore =
            Number(productBrand(b) === cameraBrand) - Number(productBrand(a) === cameraBrand);
          const poeScore = Number(Boolean(b.classification?.nvrHasPoE) === allPoE) - Number(Boolean(a.classification?.nvrHasPoE) === allPoE);
          return channelScore || visiblePoeScore || priorityScore || brandScore || poeScore || a.prodajnaCena - b.prodajnaCena;
        }),
    [allPoE, cameraBrand, manufacturerRecorders, poeFilter],
  );

  const recommendedId = useMemo(() => {
    const withEnoughChannels = alternatives.filter((product) => recorderChannels(product) >= selectedChannels);
    const preferred = [...withEnoughChannels].sort((a, b) => {
      const poeScore = poeFilter === "all" && allPoE ? poeGroup(a) - poeGroup(b) : 0;
      return poeScore || categoryPriorityRank(a) - categoryPriorityRank(b) || recorderChannels(a) - recorderChannels(b) || a.prodajnaCena - b.prodajnaCena;
    })[0];
    return preferred?._id ?? alternatives[0]?._id ?? null;
  }, [allPoE, alternatives, poeFilter, selectedChannels]);

  useEffect(() => {
    if (manualNoneRef.current || !recommendedId || cameraCount === 0) return;
    const signature = `${cameraCount}|${cameraBrand}|${manufacturer}|${allPoE}|${selectedChannels}|${poeFilter}|${recommendedId}`;
    if (autoAppliedRef.current === signature) return;
    autoAppliedRef.current = signature;
    if (videonadzor.snemalnik.productId === recommendedId) return;
    onChange({ ...videonadzor, snemalnik: { productId: recommendedId } });
  }, [allPoE, cameraBrand, cameraCount, manufacturer, onChange, poeFilter, recommendedId, selectedChannels, videonadzor]);

  useEffect(() => {
    recommendedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, [manufacturer, poeFilter, recommendedId, selectedChannels]);

  const clearSnemalnik = () => {
    manualNoneRef.current = true;
    autoAppliedRef.current = `${cameraCount}|${cameraBrand}|${manufacturer}|${allPoE}|${selectedChannels}|${poeFilter}|${recommendedId ?? ""}`;
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
          label="Proizvajalec"
          values={manufacturerOptions}
          selected={manufacturer || "Vsi"}
          onSelect={(value) => {
            manualNoneRef.current = false;
            setManufacturer(value === "Vsi" ? "" : value);
          }}
        />
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
        {alternatives.map((product) => (
          <button
            key={product._id}
            ref={product._id === recommendedId ? recommendedCardRef : undefined}
            type="button"
            className={`zahteva-track-card ${videonadzor.snemalnik.productId === product._id ? "is-active" : ""} ${product._id === recommendedId ? "is-recommended" : ""}`}
            onClick={() => selectSnemalnik(product._id)}
          >
            {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
            <strong>{product.ime}</strong>
            <small className="zahteva-nvr-spec">
              {recorderChannels(product) || "-"} kanalov
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
