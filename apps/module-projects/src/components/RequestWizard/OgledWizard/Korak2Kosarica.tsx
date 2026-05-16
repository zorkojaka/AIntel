import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchCenikProducts, type CenikProduct } from "../../../api";
import type { Zahteva } from "../../../types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import type { WizardState } from "../state/useZahtevaWizard";
import { IzberiNosilecDialog } from "./IzberiNosilecDialog";

type Korak2Props = {
  state: WizardState;
  updateVideonadzor: (updater: (current: Zahteva["videonadzor"]) => Zahteva["videonadzor"]) => void;
};

const DEFAULT_BRAND = "DVC";
const DEFAULT_HOUSING = "Bullet";
const DEFAULT_RESOLUTION = 4;

function formatPrice(value: number | undefined) {
  return `${Number(value ?? 0).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function nextCartId(existingIds: string[]) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const letter of alphabet) {
    if (!existingIds.includes(letter)) return letter;
  }
  return `V${existingIds.length + 1}`;
}

function productBrand(product: CenikProduct) {
  return product.classification?.manufacturer || product.proizvajalec || "Brez proizvajalca";
}

function cartQuantity(state: WizardState) {
  return (state.videonadzor.kosarica ?? []).reduce((sum, entry) => sum + (Number(entry.kolicina) || 0), 0);
}

export function Korak2Kosarica({ state, updateVideonadzor }: Korak2Props) {
  const [products, setProducts] = useState<CenikProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [housing, setHousing] = useState(DEFAULT_HOUSING);
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
  const [selectedCamera, setSelectedCamera] = useState<CenikProduct | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const cameras = useMemo(
    () => products.filter((product) => product.classification?.productType === "kamera"),
    [products]
  );
  const productById = useMemo(() => new Map(products.map((product) => [product._id, product])), [products]);
  const brands = useMemo(
    () => Array.from(new Set(cameras.map(productBrand).filter(Boolean))).sort((a, b) => a.localeCompare(b, "sl")),
    [cameras]
  );
  const housings = useMemo(
    () => Array.from(new Set(cameras.map((camera) => camera.classification?.cameraHousing).filter(Boolean))) as string[],
    [cameras]
  );
  const resolutions = useMemo(
    () =>
      Array.from(new Set(cameras.map((camera) => camera.classification?.maxResolutionMP).filter((value): value is number => Number.isFinite(value))))
        .sort((a, b) => a - b),
    [cameras]
  );
  const filtered = useMemo(
    () =>
      cameras.filter((camera) => {
        const matchesBrand = productBrand(camera).toLowerCase() === brand.toLowerCase();
        const matchesHousing = camera.classification?.cameraHousing === housing;
        const matchesResolution = Number(camera.classification?.maxResolutionMP) === Number(resolution);
        return matchesBrand && matchesHousing && matchesResolution;
      }),
    [brand, cameras, housing, resolution]
  );

  const needed = state.videonadzor.lokacije.length;
  const currentQuantity = cartQuantity(state);
  const diff = currentQuantity - needed;

  const addToCart = (nosilec: CenikProduct | null) => {
    if (!selectedCamera) return;
    updateVideonadzor((current) => ({
      ...current,
      kosarica: [
        ...current.kosarica,
        {
          id: nextCartId(current.kosarica.map((entry) => entry.id)),
          kameraProductId: selectedCamera._id,
          nosilecProductId: nosilec?._id ?? null,
          kolicina: 1,
        },
      ],
    }));
    setDialogOpen(false);
    setSelectedCamera(null);
  };

  const updateQuantity = (id: string, delta: number) => {
    updateVideonadzor((current) => ({
      ...current,
      kosarica: current.kosarica.map((entry) =>
        entry.id === id ? { ...entry, kolicina: Math.max(1, entry.kolicina + delta) } : entry
      ),
    }));
  };

  const deleteEntry = (id: string) => {
    updateVideonadzor((current) => ({
      ...current,
      kosarica: current.kosarica.filter((entry) => entry.id !== id),
      lokacije: current.lokacije.map((lokacija) => (lokacija.kameraId === id ? { ...lokacija, kameraId: null } : lokacija)),
    }));
  };

  return (
    <section className="request-wizard-step">
      <div className="request-step-header">
        <div>
          <h3>Sestavi košarico</h3>
          <p className="text-sm text-muted-foreground">
            Vsaka kamera ima privzet nosilec. Isti model z drugim nosilcem dodaj kot ločen vnos.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <FilterStrip label="Proizvajalec" values={brands.length ? brands : [DEFAULT_BRAND]} selected={brand} onSelect={setBrand} />
        <FilterStrip label="Tip ohišja" values={housings.length ? housings : [DEFAULT_HOUSING]} selected={housing} onSelect={setHousing} />
        <FilterStrip
          label="Resolucija"
          values={(resolutions.length ? resolutions : [DEFAULT_RESOLUTION]).map((value) => `${value}MP`)}
          selected={`${resolution}MP`}
          onSelect={(value) => setResolution(Number(value.replace("MP", "")))}
        />
      </div>

      <div className="request-product-grid">
        {loading ? <div className="request-empty-state">Nalaganje kamer...</div> : null}
        {!loading && filtered.length === 0 ? (
          <div className="request-empty-state">Za izbrane filtre ni najdenih kamer.</div>
        ) : null}
        {filtered.map((camera) => (
          <article key={camera._id} className="request-product-card">
            {camera.povezavaDoSlike ? (
              <img src={camera.povezavaDoSlike} alt="" className="request-product-image" />
            ) : (
              <div className="request-product-image request-product-image--empty" />
            )}
            <div className="min-w-0 flex-1">
              <h4 className="truncate">{camera.ime}</h4>
              <p className="text-xs text-muted-foreground">
                {camera.classification?.maxResolutionMP ? `${camera.classification.maxResolutionMP}MP` : "Kamera"}
                {camera.classification?.cameraHousing ? ` • ${camera.classification.cameraHousing}` : ""}
                {camera.classification?.irRangeM ? ` • IR ${camera.classification.irRangeM}m` : ""}
                {camera.classification?.lensFocalLength ? ` • ${camera.classification.lensFocalLength}` : ""}
                {camera.classification?.hasPoE ? " • PoE" : ""}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-semibold">{formatPrice(camera.prodajnaCena)}</span>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedCamera(camera);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  v košarico
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="request-cart-summary">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" aria-hidden />
          <h4>Košarica</h4>
        </div>
        {state.videonadzor.kosarica.length === 0 ? (
          <div className="request-empty-state">Košarica je prazna.</div>
        ) : (
          <div className="space-y-2">
            {state.videonadzor.kosarica.map((entry) => {
              const camera = productById.get(entry.kameraProductId);
              const bracket = entry.nosilecProductId ? productById.get(entry.nosilecProductId) : null;
              return (
                <div key={entry.id} className="request-cart-row">
                  <Badge>{entry.id}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {camera?.ime ?? "Kamera"} {bracket ? `+ ${bracket.ime}` : "+ brez nosilca"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatPrice(Number(camera?.prodajnaCena ?? 0) + Number(bracket?.prodajnaCena ?? 0))}
                    </div>
                  </div>
                  <div className="request-qty-control">
                    <Button size="icon" variant="ghost" onClick={() => updateQuantity(entry.id, -1)} aria-label="Zmanjšaj količino">
                      <Minus className="h-4 w-4" aria-hidden />
                    </Button>
                    <span>{entry.kolicina}</span>
                    <Button size="icon" variant="ghost" onClick={() => updateQuantity(entry.id, 1)} aria-label="Povečaj količino">
                      <Plus className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteEntry(entry.id)} aria-label="Odstrani iz košarice">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <div className={`request-step-summary ${diff === 0 && needed > 0 ? "is-ok" : "is-warning"}`}>
          {needed === 0
            ? "Najprej dodaj lokacije."
            : diff === 0
              ? `${currentQuantity} kosov za ${needed} lokacij`
              : diff < 0
                ? `Še ${Math.abs(diff)} kamer manjka`
                : `${diff} preveč v košarici`}
        </div>
      </div>

      <IzberiNosilecDialog
        camera={selectedCamera}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={addToCart}
      />
    </section>
  );
}

function FilterStrip({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="request-filter-row">
      <span className="request-filter-label">{label}</span>
      <div className="request-filter-strip">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className={`request-filter-chip ${selected === value ? "is-active" : ""}`}
            onClick={() => onSelect(value)}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
