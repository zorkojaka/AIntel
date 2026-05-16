import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCenikProducts, type CenikProduct } from "../../api";
import type { ProjectDetails, Zahteva } from "../../types";
import { Card } from "../ui/card";
import { SistemBlok } from "./SistemBlok";
import { SpodnjiCena } from "./SpodnjiCena";
import { TipProjektaTrak } from "./TipProjektaTrak";
import { useZahtevaState } from "./state/useZahtevaState";
import { createVideonadzorSystem, nextSystemId } from "./utils";

type ZahtevaViewProps = {
  project: ProjectDetails;
  onProjectRequestChanged: (zahteva: Zahteva) => void;
  onNavigateOffer: () => void;
};

export function ZahtevaView({ project, onProjectRequestChanged, onNavigateOffer }: ZahtevaViewProps) {
  const { zahteva, loading, saveState, updateZahtevaState } = useZahtevaState(project, onProjectRequestChanged);
  const [products, setProducts] = useState<CenikProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCenikProducts()
      .then((items) => {
        if (!cancelled) setProducts(items);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const productById = useMemo(() => new Map(products.map((product) => [product._id, product])), [products]);

  const addVideonadzor = useCallback(() => {
    updateZahtevaState((current) => ({
      ...current,
      sistemi: [...current.sistemi, createVideonadzorSystem(nextSystemId(current.sistemi))],
    }));
  }, [updateZahtevaState]);

  const saveLabel = saveState === "saving" ? "Shranjujem..." : saveState === "error" ? "Napaka pri shranjevanju" : "Vse shranjeno ✓";

  if (loading || !zahteva) {
    return <Card className="p-4 text-sm text-muted-foreground">Nalaganje zahteve...</Card>;
  }

  return (
    <div className="zahteva-page">
      <div className="zahteva-page-header">
        <div>
          <h2>Zahteva</h2>
          <p>{project.code ?? project.id}: {project.customer}</p>
        </div>
        <span className={`zahteva-save-state is-${saveState}`}>{saveLabel}</span>
      </div>

      <TipProjektaTrak onAddVideonadzor={addVideonadzor} />

      <div className="zahteva-systems">
        {zahteva.sistemi.map((sistem) => (
          <SistemBlok
            key={sistem.id}
            sistem={sistem}
            productById={productById}
            onChange={(next) => {
              updateZahtevaState((current) => ({
                ...current,
                sistemi: current.sistemi.map((entry) => (entry.id === sistem.id ? next : entry)),
              }));
            }}
            onRemove={() => {
              updateZahtevaState((current) => ({
                ...current,
                sistemi: current.sistemi.filter((entry) => entry.id !== sistem.id),
              }));
            }}
          />
        ))}
        {zahteva.sistemi.length === 0 ? <Card className="p-4 text-sm text-muted-foreground">Izberi tip projekta za prvo zahtevo.</Card> : null}
      </div>

      <SpodnjiCena zahteva={zahteva} productById={productById} onNavigateOffer={onNavigateOffer} />
    </div>
  );
}
