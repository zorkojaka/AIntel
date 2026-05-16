import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchCenikProducts, zakljuciZahteva, type CenikProduct } from "../../../api";
import { Button } from "../../ui/button";
import type { WizardState } from "../state/useZahtevaWizard";

type ReviewLine = {
  section: string;
  productId?: string | null;
  name: string;
  quantity: number;
  price: number;
};

type Korak6Props = {
  state: WizardState;
  saveNow: () => Promise<boolean>;
  onNavigateOffer: () => void;
};

function formatPrice(value: number | undefined) {
  return `${Number(value ?? 0).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function findService(products: CenikProduct[], patterns: RegExp[]) {
  return products.find((product) => patterns.some((pattern) => pattern.test(product.ime)));
}

function lineFromProduct(section: string, product: CenikProduct | undefined | null, quantity: number): ReviewLine | null {
  if (!product || quantity <= 0) return null;
  return {
    section,
    productId: product._id,
    name: product.ime,
    quantity,
    price: Number(product.prodajnaCena ?? 0),
  };
}

export function Korak6Pregled({ state, saveNow, onNavigateOffer }: Korak6Props) {
  const [products, setProducts] = useState<CenikProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);

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
  const lines = useMemo(() => {
    const current = state.videonadzor;
    const result: ReviewLine[] = [];
    current.kosarica.forEach((entry) => {
      const camera = productById.get(entry.kameraProductId);
      const bracket = entry.nosilecProductId ? productById.get(entry.nosilecProductId) : null;
      const cameraLine = lineFromProduct("Kamere", camera, entry.kolicina);
      const bracketLine = lineFromProduct("Nosilci", bracket, entry.kolicina);
      if (cameraLine) result.push(cameraLine);
      if (bracketLine) result.push(bracketLine);
    });
    [
      lineFromProduct("Snemalnik", current.snemalnik.productId ? productById.get(current.snemalnik.productId) : null, 1),
      lineFromProduct("PoE", current.poeSwitch.productId ? productById.get(current.poeSwitch.productId) : null, 1),
      lineFromProduct("Disk", current.disk.productId ? productById.get(current.disk.productId) : null, 1),
    ].forEach((line) => {
      if (line) result.push(line);
    });
    current.dodatnaOprema.forEach((entry) => {
      const line = lineFromProduct("Dodatki", productById.get(entry.productId), entry.kolicina);
      if (line) result.push(line);
    });

    if (current.montaza.vkljuceno) {
      const cameraCount = current.lokacije.filter((lokacija) => lokacija.kameraId).length || current.lokacije.length;
      const montaza = findService(products, [/montaža.*kamera/i, /montaza.*kamera/i]);
      const zagon = findService(products, [/zagon.*snemaln/i]);
      const montazaLine = lineFromProduct("Storitve", montaza, cameraCount);
      const zagonLine = lineFromProduct("Storitve", zagon, 1);
      if (montazaLine) result.push(montazaLine);
      if (zagonLine) result.push(zagonLine);

      if (current.montaza.napeljava) {
        const utp = findService(products, [/utp.*kabel/i]);
        const utpLine = lineFromProduct("Napeljava", utp, current.montaza.metrov);
        if (utpLine) result.push(utpLine);
        if (current.montaza.zascitniMaterial === "kanal") {
          const kanal = findService(products, [/plastič.*kanal/i, /plastic.*kanal/i]);
          const polaganje = findService(products, [/polaganje.*kanal/i]);
          const kanalLine = lineFromProduct("Napeljava", kanal, current.montaza.metrov);
          const polaganjeLine = lineFromProduct("Storitve", polaganje, current.montaza.metrov);
          if (kanalLine) result.push(kanalLine);
          if (polaganjeLine) result.push(polaganjeLine);
        }
        if (current.montaza.zascitniMaterial === "cev") {
          const cev = findService(products, [/gibljiv.*cev/i]);
          const polaganje = findService(products, [/polaganje.*cev/i]);
          const cevLine = lineFromProduct("Napeljava", cev, current.montaza.metrov);
          const polaganjeLine = lineFromProduct("Storitve", polaganje, current.montaza.metrov);
          if (cevLine) result.push(cevLine);
          if (polaganjeLine) result.push(polaganjeLine);
        }
      }
    }
    return result;
  }, [productById, products, state.videonadzor]);

  const sections = Array.from(new Set(lines.map((line) => line.section)));
  const total = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
  const canFinish =
    state.videonadzor.lokacije.length > 0 &&
    state.videonadzor.kosarica.length > 0 &&
    state.videonadzor.lokacije.every((lokacija) => Boolean(lokacija.kameraId));

  const finish = async () => {
    if (!canFinish) {
      toast.error("Pred zaključkom pokrij vse lokacije s kamerami.");
      return;
    }
    setFinishing(true);
    try {
      const saved = await saveNow();
      if (!saved) return;
      await zakljuciZahteva(state.zahtevaId);
      toast.success("Zahteva zaključena. Ponudba je ustvarjena.");
      onNavigateOffer();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Zahteve ni mogoče zaključiti.");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <section className="request-wizard-step">
      <div className="request-step-header">
        <div>
          <h3>Pregled in zaključek</h3>
          <p className="text-sm text-muted-foreground">Preglej material in storitve, nato ustvari ponudbo v osnutku.</p>
        </div>
        <Button onClick={() => void finish()} disabled={finishing || loading || !canFinish}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {finishing ? "Zaključujem..." : "Zaključi zahtevo in ustvari ponudbo"}
        </Button>
      </div>

      {!canFinish ? (
        <div className="request-step-summary is-warning">Vse lokacije morajo imeti dodeljeno kamero.</div>
      ) : null}

      <div className="request-review">
        {sections.map((section) => (
          <div key={section} className="request-review-section">
            <h4>{section}</h4>
            {lines
              .filter((line) => line.section === section)
              .map((line, index) => (
                <div key={`${section}-${line.productId ?? line.name}-${index}`} className="request-review-line">
                  <span className="min-w-0 truncate">{line.name}</span>
                  <span>{line.quantity}×</span>
                  <span>{formatPrice(line.quantity * line.price)}</span>
                </div>
              ))}
          </div>
        ))}
        {lines.length === 0 ? <div className="request-empty-state">Ni še izbranih postavk za ponudbo.</div> : null}
      </div>

      <div className="request-review-total">
        <span>Skupaj brez popustov</span>
        <strong>{formatPrice(total)}</strong>
      </div>
    </section>
  );
}
