import { HardDrive, Network, Server, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  fetchCenikProducts,
  fetchPredlogDisk,
  fetchPredlogSnemalnik,
  fetchPredlogSwitch,
  getProductImageUrl,
  type CenikProduct,
} from "../../../api";
import type { Zahteva } from "../../../types";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";
import type { WizardState } from "../state/useZahtevaWizard";

type Korak4Props = {
  state: WizardState;
  updateVideonadzor: (updater: (current: Zahteva["videonadzor"]) => Zahteva["videonadzor"]) => void;
};

type DiskSuggestion = {
  storage: { requiredTB: number; recommendedDiskTB: number; totalMbps: number };
  product: CenikProduct | null;
};

function formatPrice(value: number | undefined) {
  return `${Number(value ?? 0).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function standardChannels(count: number) {
  return [4, 8, 16, 32, 64].find((value) => value >= count) ?? 64;
}

function standardPorts(count: number) {
  return [0, 4, 8, 16, 24].find((value) => value >= count) ?? 24;
}

function productBrand(product?: CenikProduct | null) {
  return product?.classification?.manufacturer || product?.proizvajalec || "";
}

function assignedCameraProductIds(state: WizardState) {
  const byVariant = new Map(state.videonadzor.kosarica.map((entry) => [entry.id, entry.kameraProductId]));
  const assigned = state.videonadzor.lokacije
    .map((lokacija) => (lokacija.kameraId ? byVariant.get(lokacija.kameraId) : null))
    .filter((id): id is string => Boolean(id));
  if (assigned.length > 0) return assigned;
  return state.videonadzor.kosarica.map((entry) => entry.kameraProductId);
}

function dominantBrand(products: CenikProduct[]) {
  const counts = new Map<string, number>();
  products.forEach((product) => {
    const brand = productBrand(product);
    if (!brand) return;
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function Korak4SnemalnikDodatki({ state, updateVideonadzor }: Korak4Props) {
  const [products, setProducts] = useState<CenikProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [diskSuggestion, setDiskSuggestion] = useState<DiskSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const autoAppliedRef = useRef<string>("");
  const cameraIds = useMemo(() => assignedCameraProductIds(state), [state]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCenikProducts()
      .then((items) => {
        if (!cancelled) setProducts(items);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Cenika ni mogoče pridobiti.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const productById = useMemo(() => new Map(products.map((product) => [product._id, product])), [products]);
  const cameraProducts = useMemo(() => cameraIds.map((id) => productById.get(id)).filter((p): p is CenikProduct => Boolean(p)), [cameraIds, productById]);
  const cameraCount = cameraIds.length;
  const allPoE = cameraProducts.length > 0 && cameraProducts.every((product) => product.classification?.hasPoE);
  const brand = dominantBrand(cameraProducts);
  const selectedNvr = state.videonadzor.snemalnik.productId ? productById.get(state.videonadzor.snemalnik.productId) : null;
  const selectedSwitch = state.videonadzor.poeSwitch.productId ? productById.get(state.videonadzor.poeSwitch.productId) : null;
  const selectedDisk = state.videonadzor.disk.productId ? productById.get(state.videonadzor.disk.productId) : null;
  const nvrPoePorts = selectedNvr?.classification?.nvrHasPoE ? selectedNvr.classification.nvrChannels ?? 0 : 0;
  const neededSwitchPorts = allPoE ? Math.max(0, cameraCount - nvrPoePorts) : 0;

  const nvrAlternatives = products
    .filter((product) => product.classification?.productType === "snemalnik")
    .filter((product) => (product.classification?.nvrChannels ?? 0) >= standardChannels(cameraCount))
    .slice()
    .sort((a, b) => (a.classification?.nvrChannels ?? 0) - (b.classification?.nvrChannels ?? 0) || a.prodajnaCena - b.prodajnaCena)
    .slice(0, 8);
  const switchAlternatives = products
    .filter((product) => product.classification?.productType === "switch")
    .filter((product) => (product.classification?.poePortCount ?? 0) >= standardPorts(neededSwitchPorts))
    .slice()
    .sort((a, b) => (a.classification?.poePortCount ?? 0) - (b.classification?.poePortCount ?? 0) || a.prodajnaCena - b.prodajnaCena)
    .slice(0, 8);
  const diskAlternatives = products
    .filter((product) => product.classification?.productType === "disk")
    .filter((product) => product.classification?.isSurveillanceDisk !== false)
    .slice()
    .sort((a, b) => (a.classification?.diskCapacityTB ?? 0) - (b.classification?.diskCapacityTB ?? 0) || a.prodajnaCena - b.prodajnaCena)
    .slice(0, 10);
  const dodatki = products
    .filter((product) => product.classification?.productType === "pribor" || product.classification?.productType === "kabel")
    .slice(0, 8);

  const applySuggestion = async (force = false) => {
    if (cameraCount === 0) {
      toast.info("Najprej dodaj kamere in dodelitve.");
      return;
    }
    const signature = `${cameraIds.join(",")}|${state.videonadzor.disk.dniSnemanja}|${state.videonadzor.disk.motionRecord}|${state.videonadzor.snemalnik.productId ?? ""}`;
    if (!force && autoAppliedRef.current === signature) return;
    autoAppliedRef.current = signature;
    setSuggesting(true);
    try {
      const [nvr, diskResult] = await Promise.all([
        fetchPredlogSnemalnik({ kanali: cameraCount, brand, poe: allPoE }),
        fetchPredlogDisk({
          cameraIds,
          dni: state.videonadzor.disk.dniSnemanja || 30,
          motionRecord: state.videonadzor.disk.motionRecord,
        }),
      ]);
      const storageResult = diskResult && "storage" in diskResult ? diskResult : null;
      setDiskSuggestion(storageResult);
      const suggestedNvrPoePorts = nvr?.classification?.nvrHasPoE ? nvr.classification.nvrChannels ?? 0 : 0;
      const switchPorts = allPoE ? Math.max(0, cameraCount - suggestedNvrPoePorts) : 0;
      const poeSwitch = switchPorts > 0 ? await fetchPredlogSwitch(switchPorts) : null;

      updateVideonadzor((current) => ({
        ...current,
        snemalnik: {
          productId: force || !current.snemalnik.productId ? nvr?._id ?? null : current.snemalnik.productId,
          kanali: nvr?.classification?.nvrChannels ?? standardChannels(cameraCount),
          hasPoE: Boolean(nvr?.classification?.nvrHasPoE),
        },
        poeSwitch: {
          productId: force || !current.poeSwitch.productId ? poeSwitch?._id ?? null : current.poeSwitch.productId,
          portov: poeSwitch?.classification?.poePortCount ?? standardPorts(switchPorts),
        },
        disk: {
          ...current.disk,
          productId: force || !current.disk.productId ? storageResult?.product?._id ?? null : current.disk.productId,
          kapaciteta: storageResult?.product?.classification?.diskCapacityTB ?? storageResult?.storage.recommendedDiskTB ?? current.disk.kapaciteta,
        },
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Predlogov ni mogoče pridobiti.");
    } finally {
      setSuggesting(false);
    }
  };

  useEffect(() => {
    if (!products.length || state.videonadzor.snemalnik.productId || cameraCount === 0) return;
    void applySuggestion(false);
  }, [products.length, cameraCount]);

  const selectNvr = (product: CenikProduct | null) => {
    updateVideonadzor((current) => ({
      ...current,
      snemalnik: {
        productId: product?._id ?? null,
        kanali: product?.classification?.nvrChannels ?? standardChannels(cameraCount),
        hasPoE: Boolean(product?.classification?.nvrHasPoE),
      },
    }));
  };

  const selectSwitch = (product: CenikProduct | null) => {
    updateVideonadzor((current) => ({
      ...current,
      poeSwitch: {
        productId: product?._id ?? null,
        portov: product?.classification?.poePortCount ?? 0,
      },
    }));
  };

  const selectDisk = (product: CenikProduct | null) => {
    updateVideonadzor((current) => ({
      ...current,
      disk: {
        ...current.disk,
        productId: product?._id ?? null,
        kapaciteta: product?.classification?.diskCapacityTB ?? 0,
      },
    }));
  };

  const updateDiskSettings = (changes: Partial<Zahteva["videonadzor"]["disk"]>) => {
    updateVideonadzor((current) => ({ ...current, disk: { ...current.disk, ...changes } }));
  };

  const toggleAccessory = (product: CenikProduct) => {
    updateVideonadzor((current) => {
      const exists = current.dodatnaOprema.some((entry) => entry.productId === product._id);
      return {
        ...current,
        dodatnaOprema: exists
          ? current.dodatnaOprema.filter((entry) => entry.productId !== product._id)
          : [...current.dodatnaOprema, { productId: product._id, kolicina: 1 }],
      };
    });
  };

  return (
    <section className="request-wizard-step">
      <div className="request-step-header">
        <div>
          <h3>Snemalnik + PoE switch + disk</h3>
          <p className="text-sm text-muted-foreground">Predlogi temeljijo na dodeljenih kamerah, PoE podatkih in DVC izračunu diska.</p>
        </div>
        <Button onClick={() => void applySuggestion(true)} disabled={suggesting || loading || cameraCount === 0}>
          {suggesting ? "Računam..." : "Osveži predloge"}
        </Button>
      </div>

      <div className="request-equipment-grid">
        <EquipmentPanel
          icon={<Server className="h-4 w-4" aria-hidden />}
          title="Snemalnik"
          selected={selectedNvr}
          emptyText="Snemalnik še ni izbran."
          details={selectedNvr ? `${selectedNvr.classification?.nvrChannels ?? "-"} kanalov${selectedNvr.classification?.nvrHasPoE ? " • PoE" : ""}` : ""}
          alternatives={nvrAlternatives}
          selectedId={state.videonadzor.snemalnik.productId ?? null}
          onSelect={selectNvr}
        />

        <EquipmentPanel
          icon={<Network className="h-4 w-4" aria-hidden />}
          title="PoE switch"
          selected={selectedSwitch}
          emptyText={neededSwitchPorts > 0 ? `Potreben je switch za vsaj ${standardPorts(neededSwitchPorts)} portov.` : "Ni potreben - snemalnik pokrije PoE portov."}
          details={selectedSwitch ? `${selectedSwitch.classification?.poePortCount ?? "-"} PoE portov` : ""}
          alternatives={switchAlternatives}
          selectedId={state.videonadzor.poeSwitch.productId ?? null}
          onSelect={selectSwitch}
          allowNone
        />

        <div className="request-equipment-panel">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" aria-hidden />
            <h4>Disk in snemanje</h4>
          </div>
          <div className="request-form-grid">
            <label>
              <span>Dni snemanja</span>
              <Input
                type="number"
                min={7}
                max={90}
                value={state.videonadzor.disk.dniSnemanja}
                onChange={(event) => updateDiskSettings({ dniSnemanja: Number(event.target.value) || 30 })}
              />
            </label>
            <label className="request-checkbox-line">
              <Checkbox
                checked={state.videonadzor.disk.motionRecord}
                onChange={(event) => updateDiskSettings({ motionRecord: event.target.checked })}
              />
              Snemanje motion
            </label>
          </div>
          {diskSuggestion ? (
            <div className="request-storage-note">
              Potreben prostor: {diskSuggestion.storage.requiredTB} TB. Predlog po DVC formuli: {diskSuggestion.storage.recommendedDiskTB} TB.
            </div>
          ) : null}
          <ProductChoiceCard product={selectedDisk} emptyText="Disk še ni izbran." selected />
          <ProductTrack products={diskAlternatives} selectedId={state.videonadzor.disk.productId ?? null} onSelect={selectDisk} />
        </div>
      </div>

      <div className="request-equipment-panel">
        <div className="flex items-center justify-between gap-2">
          <h4>Dodatna oprema</h4>
          <span className="text-xs text-muted-foreground">Klik za dodaj/odstrani</span>
        </div>
        <div className="request-filter-strip">
          {dodatki.length === 0 ? <span className="text-sm text-muted-foreground">Ni predlagane dodatne opreme.</span> : null}
          {dodatki.map((product) => {
            const selected = state.videonadzor.dodatnaOprema.some((entry) => entry.productId === product._id);
            return (
              <button
                key={product._id}
                type="button"
                className={`request-accessory-chip ${selected ? "is-active" : ""}`}
                onClick={() => toggleAccessory(product)}
              >
                {getProductImageUrl(product) ? (
                  <img src={getProductImageUrl(product)} alt="" className="request-accessory-image" />
                ) : (
                  <span className="request-accessory-image request-product-image--empty" />
                )}
                {selected ? <Trash2 className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                {product.ime}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EquipmentPanel({
  icon,
  title,
  selected,
  emptyText,
  details,
  alternatives,
  selectedId,
  onSelect,
  allowNone,
}: {
  icon: ReactNode;
  title: string;
  selected?: CenikProduct | null;
  emptyText: string;
  details?: string;
  alternatives: CenikProduct[];
  selectedId: string | null;
  onSelect: (product: CenikProduct | null) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="request-equipment-panel">
      <div className="flex items-center gap-2">
        {icon}
        <h4>{title}</h4>
      </div>
      <ProductChoiceCard product={selected} emptyText={emptyText} details={details} selected />
      {allowNone ? (
        <Button variant="outline" size="sm" onClick={() => onSelect(null)}>
          Brez switcha
        </Button>
      ) : null}
      <ProductTrack products={alternatives} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}

function ProductTrack({
  products,
  selectedId,
  onSelect,
}: {
  products: CenikProduct[];
  selectedId: string | null;
  onSelect: (product: CenikProduct) => void;
}) {
  return (
    <div className="request-equipment-track">
      {products.map((product) => (
        <button
          type="button"
          key={product._id}
          className={`request-equipment-choice ${selectedId === product._id ? "is-active" : ""}`}
          onClick={() => onSelect(product)}
        >
          {getProductImageUrl(product) ? (
            <img src={getProductImageUrl(product)} alt="" className="request-equipment-choice__image" />
          ) : (
            <span className="request-equipment-choice__image request-product-image--empty" />
          )}
          <span className="truncate font-medium">{product.ime}</span>
          <span>{formatPrice(product.prodajnaCena)}</span>
        </button>
      ))}
    </div>
  );
}

function ProductChoiceCard({
  product,
  emptyText,
  details,
  selected,
}: {
  product?: CenikProduct | null;
  emptyText: string;
  details?: string;
  selected?: boolean;
}) {
  if (!product) {
    return <div className="request-empty-state">{emptyText}</div>;
  }
  return (
    <div className={`request-selected-product ${selected ? "is-selected" : ""}`}>
      {getProductImageUrl(product) ? (
        <img src={getProductImageUrl(product)} alt="" className="request-selected-product__image" />
      ) : (
        <span className="request-selected-product__image request-product-image--empty" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{product.ime}</div>
        <div className="text-xs text-muted-foreground">{details || product.kratekOpis || "Izbrana oprema"}</div>
      </div>
      <div className="font-semibold">{formatPrice(product.prodajnaCena)}</div>
    </div>
  );
}
