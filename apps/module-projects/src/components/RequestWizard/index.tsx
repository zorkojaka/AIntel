import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createZahteva, fetchZahteva } from "../../api";
import type { ProjectDetails, Zahteva } from "../../types";
import { Card } from "../ui/card";
import { VstopniEkran } from "./VstopniEkran";
import { OgledWizard } from "./OgledWizard";

type RequestWizardProps = {
  project: ProjectDetails;
  onProjectRequestChanged: (zahteva: Zahteva) => void;
  onNavigateOffer: () => void;
  onNavigateOgled: () => void;
  routeMode?: "entry" | "ogled";
};

export function RequestWizard({
  project,
  onProjectRequestChanged,
  onNavigateOffer,
  onNavigateOgled,
  routeMode = "entry",
}: RequestWizardProps) {
  const [zahteva, setZahteva] = useState<Zahteva | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<"ogled" | "preskoceno" | null>(null);
  const [mode, setMode] = useState<"entry" | "ogled">(routeMode);
  const activeRequestId = project.activeRequestId ?? null;
  const shouldShowWizard = useMemo(
    () => mode === "ogled" || (routeMode === "ogled" && zahteva?.pot === "ogled"),
    [mode, routeMode, zahteva?.pot]
  );

  useEffect(() => {
    setMode(routeMode);
  }, [routeMode]);

  useEffect(() => {
    let cancelled = false;
    if (!activeRequestId) {
      setZahteva(null);
      return;
    }
    setLoading(true);
    fetchZahteva(activeRequestId)
      .then((data) => {
        if (!cancelled) setZahteva(data);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Zahteve ni mogoče pridobiti.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRequestId]);

  const handleSaved = useCallback(
    (saved: Zahteva) => {
      setZahteva(saved);
      onProjectRequestChanged(saved);
    },
    [onProjectRequestChanged]
  );

  const handleStartOgled = useCallback(async () => {
    setCreating("ogled");
    try {
      const created = await createZahteva({
        projectId: project.id,
        tipProjekta: "videonadzor",
        pot: "ogled",
      });
      handleSaved(created);
      setMode("ogled");
      onNavigateOgled();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Zahteve ni mogoče ustvariti.");
    } finally {
      setCreating(null);
    }
  }, [handleSaved, onNavigateOgled, project.id]);

  const handleSkipToOffer = useCallback(async () => {
    setCreating("preskoceno");
    try {
      const created = await createZahteva({
        projectId: project.id,
        tipProjekta: "videonadzor",
        pot: "preskoceno",
      });
      handleSaved(created);
      onNavigateOffer();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Zahteve ni mogoče ustvariti.");
    } finally {
      setCreating(null);
    }
  }, [handleSaved, onNavigateOffer, project.id]);

  if (loading) {
    return <Card className="p-4 text-sm text-muted-foreground">Nalaganje zahteve...</Card>;
  }

  if (shouldShowWizard && zahteva?.pot === "ogled") {
    return (
      <OgledWizard
        zahteva={zahteva}
        onSaved={handleSaved}
        onNavigateOffer={onNavigateOffer}
        onBackToEntry={() => {
          setMode("entry");
          window.history.pushState({ moduleId: "projects" }, "", `/projects/${project.id}/zahteva`);
        }}
      />
    );
  }

  return (
    <VstopniEkran
      selectedTip="videonadzor"
      creating={creating}
      onStartOgled={handleStartOgled}
      onSkipToOffer={handleSkipToOffer}
    />
  );
}
