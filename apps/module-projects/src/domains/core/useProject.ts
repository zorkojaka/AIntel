import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ProjectDetails } from "../../types";
import type { ProjectLogistics } from "@aintel/shared/types/projects/Logistics";

export type UseProjectResult = {
  project: ProjectDetails | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  setProject: (updater: (prev: ProjectDetails) => ProjectDetails) => void;
};

type RefreshListener = () => Promise<void>;

const projectRefreshListeners = new Map<string, Set<RefreshListener>>();

export function registerProjectRefresh(projectId: string, listener: RefreshListener) {
  if (!projectId || typeof listener !== "function") return;
  const listeners = projectRefreshListeners.get(projectId) ?? new Set<RefreshListener>();
  listeners.add(listener);
  projectRefreshListeners.set(projectId, listeners);
}

export function unregisterProjectRefresh(projectId: string, listener: RefreshListener) {
  if (!projectId) return;
  const listeners = projectRefreshListeners.get(projectId);
  if (!listeners) return;
  listeners.delete(listener);
  if (listeners.size === 0) {
    projectRefreshListeners.delete(projectId);
  }
}

export async function triggerProjectRefresh(projectId: string) {
  const listeners = projectRefreshListeners.get(projectId);
  if (!listeners || listeners.size === 0) return;
  const callbacks = Array.from(listeners);
  await Promise.allSettled(callbacks.map((callback) => callback()));
}

export function mapProject(data: any): ProjectDetails {
  const requirementsArray = Array.isArray(data.requirements) ? data.requirements : [];
  const requirementsText = !Array.isArray(data.requirements) && typeof data.requirements === "string"
    ? data.requirements
    : "";
  return {
    id: data.id,
    title: data.title,
    customer: data.customer?.name ?? data.customer ?? "",
    status: data.status,
    offerAmount: data.offerAmount ?? 0,
    invoiceAmount: data.invoiceAmount ?? 0,
    createdAt: data.createdAt,
    customerDetail: data.customer ?? { name: data.customer ?? "" },
    requirements: requirementsArray,
    requirementsText,
    items: data.items ?? [],
    offers: data.offers ?? [],
    workOrders: data.workOrders ?? [],
    purchaseOrders: data.purchaseOrders ?? [],
    deliveryNotes: data.deliveryNotes ?? [],
    timelineEvents: data.timeline ?? data.timelineEvents ?? [],
    templates: data.templates ?? [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    requirementsTemplateVariantSlug: data.requirementsTemplateVariantSlug,
    logistics: (data.logistics as ProjectLogistics | null) ?? null,
  };
}

async function fetchProjectLogistics(projectId: string): Promise<ProjectLogistics | null> {
  try {
    const response = await fetch(`/api/projects/${projectId}/logistics`);
    const payload = await response.json();
    if (!payload.success || !payload.data) {
      return null;
    }
    const data = payload.data as any;
    return {
      workOrders: data.workOrders ?? [],
      materialOrders: data.materialOrders ?? [],
      materialOrder: data.materialOrder ?? null,
      workOrder: data.workOrder ?? null,
      acceptedOfferId: data.acceptedOfferId ?? null,
      confirmedOfferVersionId: data.confirmedOfferVersionId ?? null,
      offerVersions: data.offerVersions ?? [],
    };
  } catch {
    return null;
  }
}

export function useProject(projectId: string, initialProject?: ProjectDetails | null): UseProjectResult {
  const [project, setProjectState] = useState<ProjectDetails | null>(initialProject ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      const result = await response.json();
      if (!result.success) {
        const message = result.error ?? "Projekt ni bil najden.";
        setError(new Error(message));
        toast.error(message);
        setProjectState(null);
        return;
      }
      const mapped = mapProject(result.data);
      const logistics = await fetchProjectLogistics(projectId);
      const combined: ProjectDetails = {
        ...mapped,
        logistics: logistics ?? mapped.logistics ?? null,
      };
      setProjectState(combined);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Napaka pri nalaganju projekta.");
      setError(error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    await fetchProject();
  }, [fetchProject]);

  const setProject = useCallback(
    (updater: (prev: ProjectDetails) => ProjectDetails) => {
      setProjectState((prev) => {
        if (!prev) return prev;
        return updater(prev);
      });
    },
    []
  );

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    registerProjectRefresh(projectId, refresh);
    return () => {
      unregisterProjectRefresh(projectId, refresh);
    };
  }, [projectId, refresh]);

  return { project, loading, error, refresh, setProject };
}
