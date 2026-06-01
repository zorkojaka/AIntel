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
  const housings = useMemo(
    () => Array.from(new Set(cameras.map((camera) => camera.classification?.cameraHousing).filter(Boolean))) as string[],
    [cameras],
  );
  const resolutions = useMemo(
    () => Array.from(new Set(cameras.map((camera) => camera.classification?.maxResolutionMP).filter(Boolean))).sort((a, b) => Number(a) - Number(b)),
    [cameras],
  );

  useEffect(() => {
    if (!brand && brands.length) setBrand(brands.includes("DVC") ? "DVC" : brands[0]);
    if (!housing && housings.length) setHousing(housings.includes("Bullet") ? "Bullet" : housings[0]);
    if (!resolution && resolutions.length) setResolution(String(resolutions.includes(4) ? 4 : resolutions[0]));
  }, [brand, brands, housing, housings, resolution, resolutions]);

  const filtered = useMemo(
    () =>
      cameras
        .filter((camera) => !brand || productBrand(camera) === brand)
        .filter((camera) => !housing || camera.classification?.cameraHousing === housing)
        .filter((camera) => !resolution || String(camera.classification?.maxResolutionMP) === resolution)
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
          <FilterStrip label="MP" values={resolutions.map(String)} selected={resolution} onSelect={setResolution} />
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
