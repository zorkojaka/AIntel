import { Camera, Plus, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchKompatibilniNosilci, getProductImageUrl, type CenikProduct } from "../../api";
import { Button } from "../ui/button";
import { formatPrice } from "./utils";

type Props = {
  productById: Map<string, CenikProduct>;
  onAddVariant: (camera: CenikProduct, bracket: CenikProduct | null) => void;
};

function productBrand(product: CenikProduct) {
  return product.classification?.manufacturer || product.proizvajalec || "Brez proizvajalca";
}

function categoryPriorityRank(product: CenikProduct) {
  return product.categoryPriority ?? 4;
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

export function SekcijaKameraNosilec({ productById, onAddVariant }: Props) {
  const [brand, setBrand] = useState("");
  const [housing, setHousing] = useState("");
  const [resolution, setResolution] = useState("");
  const [selectedCamera, setSelectedCamera] = useState<CenikProduct | null>(null);
  const [brackets, setBrackets] = useState<CenikProduct[]>([]);
  const [selectedBracket, setSelectedBracket] = useState<CenikProduct | null>(null);

  const cameras = useMemo(
    () =>
      Array.from(productById.values())
        .filter(isIpCamera)
        .sort((a, b) => categoryPriorityRank(a) - categoryPriorityRank(b) || productBrand(a).localeCompare(productBrand(b), "sl") || a.prodajnaCena - b.prodajnaCena),
    [productById],
  );
  const brands = useMemo(
    () =>
      Array.from(new Set(cameras.filter((camera) => cameraMatches(camera, { housing, resolution })).map(productBrand))).sort((a, b) =>
        a.localeCompare(b, "sl"),
      ),
    [cameras, housing, resolution],
  );
  const housings = useMemo(
    () =>
      Array.from(
        new Set(cameras.filter((camera) => cameraMatches(camera, { brand, resolution })).map((camera) => camera.classification?.cameraHousing).filter(Boolean)),
      ) as string[],
    [brand, cameras, resolution],
  );
  const resolutions = useMemo(
    () =>
      Array.from(
        new Set(cameras.filter((camera) => cameraMatches(camera, { brand, housing })).map((camera) => camera.classification?.maxResolutionMP).filter(Boolean)),
      )
        .map(String)
        .sort((a, b) => Number(a) - Number(b)),
    [brand, cameras, housing],
  );

  useEffect(() => {
    if (!brand && brands.length) setBrand(defaultBrand(brands));
    else if (brand && !brands.includes(brand)) setBrand(defaultBrand(brands));
    if (!housing && housings.length) setHousing(defaultHousing(housings));
    else if (housing && !housings.includes(housing)) setHousing(defaultHousing(housings));
    if (!resolution && resolutions.length) setResolution(defaultResolution(resolutions));
    else if (resolution && !resolutions.includes(resolution)) setResolution(defaultResolution(resolutions));
  }, [brand, brands, housing, housings, resolution, resolutions]);

  const filteredCameras = useMemo(
    () =>
      cameras
        .filter((camera) => cameraMatches(camera, { brand, housing, resolution })),
    [brand, cameras, housing, resolution],
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
        <Button type="button" size="sm" onClick={addSelected} disabled={!selectedCamera}>
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj varianto
        </Button>
      </div>
      <div className="zahteva-dialog-filters">
        <FilterStrip label="Proizvajalec" values={brands} selected={brand} onSelect={setBrand} />
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
