import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createZahteva, fetchZahteva, updateZahteva } from "../../../api";
import type { ProjectDetails, Zahteva } from "../../../types";

type SaveState = "saved" | "saving" | "error";

export type ZahtevaState = {
  zahteva: Zahteva | null;
  loading: boolean;
  saveState: SaveState;
  saveNow: () => Promise<void>;
  updateZahtevaState: (updater: (current: Zahteva) => Zahteva) => void;
};

export function useZahtevaState(project: ProjectDetails, onProjectRequestChanged: (zahteva: Zahteva) => void): ZahtevaState {
  const [zahteva, setZahteva] = useState<Zahteva | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveTimerRef = useRef<number | null>(null);
  const latestRef = useRef<Zahteva | null>(null);
  const onProjectRequestChangedRef = useRef(onProjectRequestChanged);

  useEffect(() => {
    latestRef.current = zahteva;
  }, [zahteva]);

  useEffect(() => {
    onProjectRequestChangedRef.current = onProjectRequestChanged;
  }, [onProjectRequestChanged]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        const loaded = project.activeRequestId
          ? await fetchZahteva(project.activeRequestId)
          : await createZahteva({ projectId: project.id });
        if (cancelled) return;
        setZahteva(loaded);
        latestRef.current = loaded;
        setSaveState("saved");
        onProjectRequestChangedRef.current(loaded);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Zahteve ni mogoče naložiti.");
          setSaveState("error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [project.activeRequestId, project.id]);

  const saveCurrent = useCallback(async () => {
    const current = latestRef.current;
    if (!current) return;
    setSaveState("saving");
    try {
      const saved = await updateZahteva(current._id, { sistemi: current.sistemi });
      setZahteva((prev) => {
        if (!prev || prev._id !== saved._id) return prev;
        return prev.sistemi === current.sistemi ? saved : prev;
      });
      onProjectRequestChangedRef.current(saved);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      toast.error(error instanceof Error ? error.message : "Zahteve ni mogoče shraniti.");
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      void saveCurrent();
    }, 500);
  }, [saveCurrent]);

  const saveNow = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await saveCurrent();
  }, [saveCurrent]);

  const updateZahtevaState = useCallback(
    (updater: (current: Zahteva) => Zahteva) => {
      setZahteva((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        latestRef.current = next;
        return next;
      });
      setSaveState("saving");
      scheduleSave();
    },
    [scheduleSave],
  );

  return useMemo(
    () => ({ zahteva, loading, saveState, saveNow, updateZahtevaState }),
    [loading, saveNow, saveState, updateZahtevaState, zahteva],
  );
}
