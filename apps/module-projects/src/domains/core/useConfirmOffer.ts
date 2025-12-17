import { useCallback, useState } from "react";
import { toast } from "sonner";
import { triggerProjectRefresh } from "./useProject";

interface UseConfirmOfferOptions {
  projectId?: string | null;
  onConfirmed?: () => Promise<void> | void;
}

interface UseConfirmOfferResult {
  confirmingId: string | null;
  isConfirming: boolean;
  confirmOffer: (offerId?: string | null) => Promise<boolean>;
}

export function useConfirmOffer({ projectId, onConfirmed }: UseConfirmOfferOptions): UseConfirmOfferResult {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const confirmOffer = useCallback(
    async (offerId?: string | null) => {
      if (!projectId || !offerId) return false;
      setConfirmingId(offerId);
      try {
        const response = await fetch(`/api/projects/${projectId}/offers/${offerId}/confirm`, { method: "POST" });
        const payload = await response.json();
        if (!payload.success) {
          toast.error(payload.error ?? "Ponudbe ni mogoče potrditi.");
          return false;
        }
        toast.success("Ponudba potrjena.");
        await Promise.allSettled([
          onConfirmed?.(),
          triggerProjectRefresh(projectId),
        ]);
        return true;
      } catch (error) {
        toast.error("Ponudbe ni mogoče potrditi.");
        return false;
      } finally {
        setConfirmingId(null);
      }
    },
    [projectId, onConfirmed],
  );

  return {
    confirmOffer,
    confirmingId,
    isConfirming: confirmingId !== null,
  };
}
