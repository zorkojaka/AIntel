import { Camera, Plus, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchKompatibilniNosilci, getProductImageUrl, type CenikProduct } from "../../api";
import { Button } from "../ui/button";
import { formatPrice } from "./utils";

type Props = {
  productById: Map<string, CenikProduct>;
  onAddVariant: (camera: CenikProduct, bracket: CenikProduct | null) => void;
  cameraMode?: "ip" | "reolink_wifi";
};

type ReolinkCameraKind = "wifi" | "wired" | "sim_solar";

const REOLINK_CAMERA_KIND_LABELS: Record<ReolinkCameraKind, string> = {
  wifi: "WiFi",
  wired: "Žične",
  sim_solar: "SIM / solar",
};

function productBrand(product: CenikProduct) {
  const value = product.classification?.manufacturer || product.proizvajalec || "Brez proizvajalca";
  const trimmed = value.trim();
  if (!trimmed) return "Brez proizvajalca";
  if (trimmed.toLocaleLowerCase("sl-SI") === "reolink") return "Reolink";
  return trimmed;
}

function brandKey(value: string) {
  return value.trim().toLocaleLowerCase("sl-SI");
}

function categoryPriorityRank(product: CenikProduct) {
  return product.categoryPriority ?? 4;
}

function isIpCamera(product: CenikProduct) {
  return product.classification?.productType === "kamera" && product.classification.cameraTechnology === "IP video";
}

function isReolinkProduct(product: CenikProduct) {
  const text = `${product.ime ?? ""} ${product.proizvajalec ?? ""} ${product.classification?.manufacturer ?? ""} ${(product.categorySlugs ?? []).join(" ")}`.toLowerCase();
  return text.includes("reolink");
}

function isCameraLikeProduct(product: CenikProduct) {
  const text = `${product.ime ?? ""} ${(product.categorySlugs ?? []).join(" ")}`.toLowerCase();
  return product.classification?.productType === "kamera" || /\b(kamera|camera)\b/i.test(text);
}

function reolinkCameraKind(product: CenikProduct): ReolinkCameraKind {
  const text = `${product.ime ?? ""} ${product.kratekOpis ?? ""} ${product.dolgOpis ?? ""} ${product.aaData?.rawDescription ?? ""} ${(product.categorySlugs ?? []).join(" ")}`.toLocaleLowerCase("sl-SI");
  if (product.classification?.hasSim || product.classification?.supportsSolarPanel || /\b(sim|lte|4g)\b/.test(text) || /solar|sonč|sonc/.test(text)) return "sim_solar";
  if (product.classification?.cameraConnectivity === "poe" || product.classification?.powerMode === "poe" || product.classification?.hasPoE || /\bpoe\b|utp|ethernet|lan/.test(text)) return "wired";
  return "wifi";
}

function cameraMatches(camera: CenikProduct, filters: { brand?: string; housing?: string; resolution?: string; reolinkKind?: ReolinkCameraKind }) {
  return (
    (!filters.brand || brandKey(productBrand(camera)) === brandKey(filters.brand)) &&
    (!filters.housing || camera.classification?.cameraHousing === filters.housing) &&
    (!filters.resolution || String(camera.classification?.maxResolutionMP) === filters.resolution) &&
    (!filters.reolinkKind || reolinkCameraKind(camera) === filters.reolinkKind)
  );
}

function defaultBrand(values: string[]) {
  return values.includes("DVC") ? "DVC" : values[0] ?? "";
}

function defaultHousing(values: string[]) {
  return values.includes("Bullet") ? "Bullet" : values[0] ?? "";
}

function defaultResolution(values: string[]) {
  return values.includes("4") ? "4" : values[0] ?? "";
}

export function SekcijaKameraNosilec({ productById, onAddVariant, cameraMode = "ip" }: Props) {
  const [brand, setBrand] = useState("");
  const [reolinkKind, setReolinkKind] = useState<ReolinkCameraKind>("wifi");
  const [housing, setHousing] = useState("");
  const [resolution, setResolution] = useState("");
  const [selectedCamera, setSelectedCamera] = useState<CenikProduct | null>(null);
  const [brackets, setBrackets] = useState<CenikProduct[]>([]);
  const [selectedBracket, setSelectedBracket] = useState<CenikProduct | null>(null);

  const cameras = useMemo(
    () =>
      Array.from(productById.values())
        .filter((product) => cameraMode === "reolink_wifi" ? isReolinkProduct(product) && isCameraLikeProduct(product) : isIpCamera(product))
        .sort((a, b) => categoryPriorityRank(a) - categoryPriorityRank(b) || productBrand(a).localeCompare(productBrand(b), "sl") || a.prodajnaCena - b.prodajnaCena),
    [cameraMode, productById],
  );
  const brands = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const camera of cameras) {
      const display = productBrand(camera);
      const key = brandKey(display);
      if (!byKey.has(key)) byKey.set(key, display);
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "sl"));
  }, [cameras]);
  const reolinkKinds = useMemo(() => {
    if (cameraMode !== "reolink_wifi") return [];
    return (["wifi", "wired", "sim_solar"] as const).filter((kind) => cameras.some((camera) => reolinkCameraKind(camera) === kind));
  }, [cameraMode, cameras]);
  const brandCameras = useMemo(
    () =>
      cameras.filter(
        (camera) =>
          (!brand || brandKey(productBrand(camera)) === brandKey(brand)) &&
          (cameraMode !== "reolink_wifi" || !reolinkKind || reolinkCameraKind(camera) === reolinkKind),
      ),
    [brand, cameraMode, cameras, reolinkKind],
  );
  const housings = useMemo(
    () =>
      Array.from(
        new Set(brandCameras.map((camera) => camera.classification?.cameraHousing).filter(Boolean)),
      ) as string[],
    [brandCameras],
  );
  const resolutions = useMemo(
    () =>
      Array.from(
        new Set(brandCameras.map((camera) => camera.classification?.maxResolutionMP).filter(Boolean)),
      )
        .map(String)
        .sort((a, b) => Number(a) - Number(b)),
    [brandCameras],
  );

  useEffect(() => {
    if (!brand && brands.length) setBrand(cameraMode === "reolink_wifi" && brands.some((entry) => brandKey(entry) === "reolink") ? "Reolink" : defaultBrand(brands));
    else if (brand && !brands.some((entry) => brandKey(entry) === brandKey(brand))) setBrand(defaultBrand(brands));
    if (cameraMode === "reolink_wifi" && reolinkKinds.length && !reolinkKinds.includes(reolinkKind)) setReolinkKind(reolinkKinds[0]);
    if (!housing && housings.length) setHousing(defaultHousing(housings));
    else if (housing && !housings.includes(housing)) setHousing(defaultHousing(housings));
    if (!resolution && resolutions.length) setResolution(defaultResolution(resolutions));
    else if (resolution && !resolutions.includes(resolution)) setResolution(defaultResolution(resolutions));
  }, [brand, brands, cameraMode, housing, housings, reolinkKind, reolinkKinds, resolution, resolutions]);

  const filteredCameras = useMemo(
    () =>
      cameras
        .filter((camera) => cameraMatches(camera, { brand, housing, resolution, reolinkKind: cameraMode === "reolink_wifi" ? reolinkKind : undefined })),
    [brand, cameraMode, cameras, housing, reolinkKind, resolution],
  );

  const selectCamera = (camera: CenikProduct) => {
    setSelectedCamera(camera);
    setSelectedBracket(null);
    fetchKompatibilniNosilci(camera._id)
      .then((items) => setBrackets([...items].sort((a, b) => categoryPriorityRank(a) - categoryPriorityRank(b) || a.prodajnaCena - b.prodajnaCena)))
      .catch((error) => toast.error(error instanceof Error ? error.message : "Nosilcev ni mogoče pridobiti."));
  };

  const addSelected = () => {
    if (!selectedCamera) return;
    onAddVariant(selectedCamera, selectedBracket);
  };

  return (
    <section className="zahteva-subsection">
      <div className="zahteva-subsection-title">
        <Camera className="h-4 w-4" aria-hidden />
        <h4>Kamera</h4>
      </div>
      <div className="zahteva-dialog-filters">
        <FilterStrip label="Proizvajalec" values={brands} selected={brand} onSelect={setBrand} />
        {cameraMode === "reolink_wifi" ? (
          <FilterStrip
            label="Tip"
            values={reolinkKinds.map((kind) => REOLINK_CAMERA_KIND_LABELS[kind])}
            selected={REOLINK_CAMERA_KIND_LABELS[reolinkKind]}
            onSelect={(value) => {
              const nextKind = (Object.keys(REOLINK_CAMERA_KIND_LABELS) as ReolinkCameraKind[]).find((kind) => REOLINK_CAMERA_KIND_LABELS[kind] === value);
              if (nextKind) setReolinkKind(nextKind);
            }}
          />
        ) : null}
        <FilterStrip label="Ohišje" values={housings} selected={housing} onSelect={setHousing} />
        <FilterStrip label="MP" values={resolutions} selected={resolution} onSelect={setResolution} />
      </div>
      <div className="zahteva-product-track">
        {filteredCameras.map((camera) => (
          <button
            key={camera._id}
            type="button"
            className={`zahteva-track-card ${selectedCamera?._id === camera._id ? "is-active" : ""}`}
            onClick={() => selectCamera(camera)}
          >
            {getProductImageUrl(camera) ? <img src={getProductImageUrl(camera)} alt="" /> : <span className="zahteva-image-empty" />}
            <strong>{camera.ime}</strong>
            <small>
              {camera.classification?.maxResolutionMP ? `${camera.classification.maxResolutionMP}MP` : "Kamera"}
              {" • IP"}
              {camera.classification?.cameraHousing ? ` • ${camera.classification.cameraHousing}` : ""}
              {camera.classification?.hasPoE ? " • PoE" : ""}
            </small>
            <b>{formatPrice(camera.prodajnaCena)}</b>
          </button>
        ))}
        {filteredCameras.length === 0 ? <div className="zahteva-empty">Ni kamer za izbrane filtre.</div> : null}
      </div>

      <div className="zahteva-subsection-title">
        <Wrench className="h-4 w-4" aria-hidden />
        <h4>Nosilec</h4>
      </div>
      <div className="zahteva-product-track">
        <button
          type="button"
          className={`zahteva-track-card zahteva-none-card ${!selectedBracket ? "is-active" : ""}`}
          onClick={() => setSelectedBracket(null)}
        >
          <strong>Brez nosilca</strong>
          <small>{selectedCamera ? "za izbrano kamero" : "najprej izberi kamero"}</small>
          <b>0,00 €</b>
        </button>
        {brackets.map((bracket) => (
          <button
            key={bracket._id}
            type="button"
            className={`zahteva-track-card ${selectedBracket?._id === bracket._id ? "is-active" : ""}`}
            onClick={() => setSelectedBracket(bracket)}
          >
            {getProductImageUrl(bracket) ? <img src={getProductImageUrl(bracket)} alt="" /> : <span className="zahteva-image-empty" />}
            <strong>{bracket.ime}</strong>
            <small>Kompatibilen nosilec</small>
            <b>{formatPrice(bracket.prodajnaCena)}</b>
          </button>
        ))}
      </div>
      <div className="zahteva-inline-action-row">
        <Button type="button" size="sm" onClick={addSelected} disabled={!selectedCamera}>
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj varianto
        </Button>
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
