import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { updateZahteva } from "../../../api";
import type { Zahteva } from "../../../types";

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface WizardState {
  step: WizardStep;
  zahtevaId: string;
  videonadzor: Zahteva["videonadzor"];
  dirty: boolean;
  saving: boolean;
  lastSaved: Date | null;
}

export function useZahtevaWizard(zahteva: Zahteva | null, onSaved?: (zahteva: Zahteva) => void) {
  const [state, setState] = useState<WizardState | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const latestStateRef = useRef<WizardState | null>(null);

  useEffect(() => {
    if (!zahteva) {
      setState(null);
      latestStateRef.current = null;
      return;
    }
    const next: WizardState = {
      step: 1,
      zahtevaId: zahteva._id,
      videonadzor: zahteva.videonadzor,
      dirty: false,
      saving: false,
      lastSaved: zahteva.updatedAt ? new Date(zahteva.updatedAt) : null,
    };
    setState(next);
    latestStateRef.current = next;
  }, [zahteva?._id]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const saveNow = useCallback(async () => {
    const current = latestStateRef.current;
    if (!current || !current.dirty) return true;
    try {
      setState((prev) => (prev && prev.zahtevaId === current.zahtevaId ? { ...prev, saving: true } : prev));
      const saved = await updateZahteva(current.zahtevaId, {
        videonadzor: current.videonadzor,
      } as Partial<Zahteva>);
      setState((prev) =>
        prev && prev.zahtevaId === current.zahtevaId
          ? {
              ...prev,
              dirty: prev.videonadzor === current.videonadzor ? false : prev.dirty,
              saving: false,
              lastSaved: new Date(saved.updatedAt ?? Date.now()),
            }
          : prev
      );
      onSaved?.(saved);
      return true;
    } catch (error) {
      setState((prev) => (prev && prev.zahtevaId === current.zahtevaId ? { ...prev, saving: false } : prev));
      toast.error(error instanceof Error ? error.message : "Zahteve ni mogoče shraniti.");
      return false;
    }
  }, [onSaved]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      void saveNow();
    }, 500);
  }, [saveNow]);

  const updateVideonadzor = useCallback(
    (updater: (current: Zahteva["videonadzor"]) => Zahteva["videonadzor"]) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          videonadzor: updater(prev.videonadzor),
          dirty: true,
        };
        latestStateRef.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const setStep = useCallback((step: WizardStep) => {
    setState((prev) => (prev ? { ...prev, step } : prev));
  }, []);

  useEffect(
    () => () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    },
    []
  );

  return useMemo(
    () => ({
      state,
      setStep,
      updateVideonadzor,
      saveNow,
    }),
    [saveNow, setStep, state, updateVideonadzor]
  );
}
