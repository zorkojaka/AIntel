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
};

function productBrand(product: CenikProduct) {
  return product.classification?.manufacturer || product.proizvajalec || "Brez proizvajalca";
}

function isIpCamera(product: CenikProduct) {
  return product.classification?.productType === "kamera" && product.classification.cameraTechnology === "IP video";
}

function cameraMatches(camera: CenikProduct, filters: { brand?: string; housing?: string; resolution?: string }) {
  return (
    (!filters.brand || productBrand(camera) === filters.brand) &&
    (!filters.housing || camera.classification?.cameraHousing === filters.housing) &&
    (!filters.resolution || String(camera.classification?.maxResolutionMP) === filters.resolution)
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

export function DodajVariantoDialog({ open, onOpenChange, onConfirm }: DodajVariantoDialogProps) {
  const [products, setProducts] = useState<CenikProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState("");
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

  const cameras = useMemo(() => products.filter(isIpCamera), [products]);
  const brands = useMemo(() => Array.from(new Set(cameras.map(productBrand))).sort((a, b) => a.localeCompare(b, "sl")), [cameras]);
  const brandCameras = useMemo(() => cameras.filter((camera) => !brand || productBrand(camera) === brand), [brand, cameras]);
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
    if (!brand && brands.length) setBrand(defaultBrand(brands));
    else if (brand && !brands.includes(brand)) setBrand(defaultBrand(brands));
    if (!housing && housings.length) setHousing(defaultHousing(housings));
    else if (housing && !housings.includes(housing)) setHousing(defaultHousing(housings));
    if (!resolution && resolutions.length) setResolution(defaultResolution(resolutions));
    else if (resolution && !resolutions.includes(resolution)) setResolution(defaultResolution(resolutions));
  }, [brand, brands, housing, housings, resolution, resolutions]);

  const filtered = useMemo(
    () =>
      cameras
        .filter((camera) => cameraMatches(camera, { brand, housing, resolution }))
        .slice(0, 24),
    [brand, cameras, housing, resolution],
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
