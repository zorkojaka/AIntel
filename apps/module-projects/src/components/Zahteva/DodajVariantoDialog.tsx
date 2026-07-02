import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchCenikProducts, fetchKompatibilniNosilci, getProductImageUrl, type CenikProduct } from "../../api";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { formatPrice } from "./utils";

type DodajVariantoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (camera: CenikProduct, brackets: Array<CenikProduct | null>) => void;
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

function optionKey(value?: string | number | null) {
  return String(value ?? "").trim().toLocaleLowerCase("sl-SI");
}

function isIpCamera(product: CenikProduct) {
  return optionKey(product.classification?.productType) === "kamera" && optionKey(product.classification?.cameraTechnology) === "ip video";
}

function isReolinkProduct(product: CenikProduct) {
  const text = `${product.ime ?? ""} ${product.proizvajalec ?? ""} ${product.classification?.manufacturer ?? ""} ${(product.categorySlugs ?? []).join(" ")}`.toLowerCase();
  return text.includes("reolink");
}

function isCameraLikeProduct(product: CenikProduct) {
  const text = `${product.ime ?? ""} ${(product.categorySlugs ?? []).join(" ")}`.toLowerCase();
  return optionKey(product.classification?.productType) === "kamera" || /\b(kamera|camera)\b/i.test(text);
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
    (!filters.housing || optionKey(camera.classification?.cameraHousing) === optionKey(filters.housing)) &&
    (!filters.resolution || Number(camera.classification?.maxResolutionMP) === Number(filters.resolution)) &&
    (!filters.reolinkKind || reolinkCameraKind(camera) === filters.reolinkKind)
  );
}

export function DodajVariantoDialog({ open, onOpenChange, onConfirm, cameraMode = "ip" }: DodajVariantoDialogProps) {
  const [products, setProducts] = useState<CenikProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState("");
  const [reolinkKind, setReolinkKind] = useState<ReolinkCameraKind | "">("");
  const [housing, setHousing] = useState("");
  const [resolution, setResolution] = useState("");
  const [selectedCamera, setSelectedCamera] = useState<CenikProduct | null>(null);
  const [brackets, setBrackets] = useState<CenikProduct[]>([]);
  const [selectedBracketIds, setSelectedBracketIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || products.length > 0) return;
    setLoading(true);
    fetchCenikProducts()
      .then(setProducts)
      .catch((error) => toast.error(error instanceof Error ? error.message : "Cenika ni mogoče pridobiti."))
      .finally(() => setLoading(false));
  }, [open, products.length]);

  const cameras = useMemo(
    () => products.filter((product) => cameraMode === "reolink_wifi" ? isReolinkProduct(product) && isCameraLikeProduct(product) : isIpCamera(product)),
    [cameraMode, products],
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
  const brandAndTypeCameras = useMemo(
    () =>
      cameras.filter(
        (camera) =>
          (!brand || brandKey(productBrand(camera)) === brandKey(brand)) &&
          (cameraMode !== "reolink_wifi" || !reolinkKind || reolinkCameraKind(camera) === reolinkKind),
      ),
    [brand, cameraMode, cameras, reolinkKind],
  );
  const housings = useMemo(
    () => uniqueOptions(brandAndTypeCameras.map((camera) => camera.classification?.cameraHousing).filter(Boolean) as string[]),
    [brandAndTypeCameras],
  );
  const housingCameras = useMemo(
    () => brandAndTypeCameras.filter((camera) => !housing || optionKey(camera.classification?.cameraHousing) === optionKey(housing)),
    [brandAndTypeCameras, housing],
  );
  const resolutions = useMemo(
    () =>
      Array.from(
        new Set(housingCameras.map((camera) => camera.classification?.maxResolutionMP).filter(Boolean)),
      )
        .map(String)
        .sort((a, b) => Number(a) - Number(b)),
    [housingCameras],
  );

  useEffect(() => {
    if (brand && !brands.some((entry) => brandKey(entry) === brandKey(brand))) setBrand("");
    if (reolinkKind && !reolinkKinds.includes(reolinkKind)) setReolinkKind("");
    if (housing && !housings.some((entry) => optionKey(entry) === optionKey(housing))) setHousing("");
    if (resolution && !resolutions.some((entry) => Number(entry) === Number(resolution))) setResolution("");
  }, [brand, brands, cameraMode, housing, housings, reolinkKind, reolinkKinds, resolution, resolutions]);

  const filtered = useMemo(
    () =>
      cameras
        .filter((camera) => cameraMatches(camera, { brand, housing, resolution, reolinkKind: cameraMode === "reolink_wifi" && reolinkKind ? reolinkKind : undefined }))
        .slice(0, 24),
    [brand, cameraMode, cameras, housing, reolinkKind, resolution],
  );

  const selectCamera = (camera: CenikProduct) => {
    setSelectedCamera(camera);
    setSelectedBracketIds([]);
    fetchKompatibilniNosilci(camera._id)
      .then(setBrackets)
      .catch((error) => toast.error(error instanceof Error ? error.message : "Nosilcev ni mogoče pridobiti."));
  };

  const toggleBracket = (id: string) => {
    setSelectedBracketIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  };

  const confirm = () => {
    if (!selectedCamera) return;
    const selected = selectedBracketIds.map((id) => brackets.find((bracket) => bracket._id === id)).filter(Boolean) as CenikProduct[];
    onConfirm(selectedCamera, selected.length ? selected : [null]);
    setSelectedCamera(null);
    setSelectedBracketIds([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="zahteva-dialog">
        <DialogHeader>
          <DialogTitle>Dodaj varianto</DialogTitle>
        </DialogHeader>

        <div className="zahteva-dialog-filters">
          <FilterStrip label="Proizvajalec" values={brands} selected={brand} onSelect={setBrand} />
          {cameraMode === "reolink_wifi" ? (
            <FilterStrip
              label="Tip"
              values={reolinkKinds.map((kind) => REOLINK_CAMERA_KIND_LABELS[kind])}
              selected={reolinkKind ? REOLINK_CAMERA_KIND_LABELS[reolinkKind] : ""}
              onSelect={(value) => {
                const nextKind = (Object.keys(REOLINK_CAMERA_KIND_LABELS) as ReolinkCameraKind[]).find((kind) => REOLINK_CAMERA_KIND_LABELS[kind] === value);
                setReolinkKind(nextKind ?? "");
              }}
            />
          ) : null}
          <FilterStrip label="Ohišje" values={housings} selected={housing} onSelect={setHousing} />
          <FilterStrip label="MP" values={resolutions} selected={resolution} onSelect={setResolution} />
        </div>

        <div className="zahteva-camera-list">
          {loading ? <div className="zahteva-empty">Nalaganje kamer...</div> : null}
          {!loading && filtered.length === 0 ? <div className="zahteva-empty">Ni kamer za izbrane filtre.</div> : null}
          {filtered.map((camera) => (
            <button
              key={camera._id}
              type="button"
              className={`zahteva-camera-option ${selectedCamera?._id === camera._id ? "is-active" : ""}`}
              onClick={() => selectCamera(camera)}
            >
              {getProductImageUrl(camera) ? <img src={getProductImageUrl(camera)} alt="" /> : <span />}
              <span className="min-w-0">
                <strong>{camera.ime}</strong>
                <small>
                  {camera.classification?.maxResolutionMP ? `${camera.classification.maxResolutionMP}MP` : "Kamera"}
                  {" • IP"}
                  {camera.classification?.cameraHousing ? ` • ${camera.classification.cameraHousing}` : ""}
                  {camera.classification?.hasPoE ? " • PoE" : ""}
                </small>
              </span>
              <b>{formatPrice(camera.prodajnaCena)}</b>
            </button>
          ))}
        </div>

        {selectedCamera ? (
          <div className="zahteva-bracket-list">
            <div className="text-sm font-semibold">Nosilci</div>
            <button type="button" className={`zahteva-bracket-option ${selectedBracketIds.length === 0 ? "is-active" : ""}`} onClick={() => setSelectedBracketIds([])}>
              Brez nosilca
            </button>
            {brackets.map((bracket) => (
              <button
                key={bracket._id}
                type="button"
                className={`zahteva-bracket-option ${selectedBracketIds.includes(bracket._id) ? "is-active" : ""}`}
                onClick={() => toggleBracket(bracket._id)}
              >
                {getProductImageUrl(bracket) ? <img src={getProductImageUrl(bracket)} alt="" /> : <span />}
                <span>{bracket.ime}</span>
                <b>{formatPrice(bracket.prodajnaCena)}</b>
              </button>
            ))}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Prekliči
          </Button>
          <Button type="button" onClick={confirm} disabled={!selectedCamera}>
            Dodaj varianto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function uniqueOptions(values: string[]) {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const key = optionKey(value);
    if (key && !byKey.has(key)) byKey.set(key, value);
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "sl"));
}

function FilterStrip({ label, values, selected, onSelect }: { label: string; values: string[]; selected: string; onSelect: (value: string) => void }) {
  const options = ["Vse", ...values];
  return (
    <div className="zahteva-filter-row">
      <span>{label}</span>
      <div>
        {options.map((value) => (
          <button
            key={value}
            type="button"
            className={optionKey(value) === optionKey("Vse") ? (!selected ? "is-active" : "") : optionKey(selected) === optionKey(value) ? "is-active" : ""}
            onClick={() => onSelect(optionKey(value) === optionKey("Vse") ? "" : value)}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
