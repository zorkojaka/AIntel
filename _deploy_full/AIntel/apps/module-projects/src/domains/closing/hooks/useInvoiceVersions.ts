import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ProjectStatus } from "../../../types";

export type InvoiceStatus = "draft" | "issued" | "cancelled";

export interface InvoiceItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
  totalWithoutVat: number;
  totalWithVat: number;
  type: "Osnovno" | "Dodatno" | "Manj";
}

export interface InvoiceSummary {
  baseWithoutVat: number;
  discountedBase: number;
  vatAmount: number;
  totalWithVat: number;
}

export interface InvoiceVersion {
  _id: string;
  versionNumber: number;
  status: InvoiceStatus;
  createdAt: string;
  issuedAt?: string | null;
  items: InvoiceItem[];
  summary: InvoiceSummary;
}

interface InvoiceApiResponse {
  versions: InvoiceVersion[];
  activeVersionId: string | null;
  updatedVersion?: InvoiceVersion;
  projectStatus?: ProjectStatus;
}

async function requestInvoiceApi(projectId: string, path: string, options?: RequestInit) {
  const response = await fetch(`/api/projects/${projectId}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  const payload = await response.json();
  if (!payload.success) {
    const errorMessage = payload.error ?? "Dejanje nad računi ni uspelo.";
    throw new Error(errorMessage);
  }
  return payload.data as InvoiceApiResponse;
}

export function useInvoiceVersions(projectId?: string | null) {
  const [versions, setVersions] = useState<InvoiceVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const resolveActiveVersion = useMemo(
    () => versions.find((version) => version._id === activeVersionId) ?? null,
    [versions, activeVersionId],
  );

  const applyResponse = useCallback((data: InvoiceApiResponse) => {
    setVersions(data.versions ?? []);
    if (data.activeVersionId) {
      setActiveVersionId(data.activeVersionId);
    } else if (data.versions && data.versions.length > 0) {
      setActiveVersionId(data.versions[data.versions.length - 1]._id);
    } else {
      setActiveVersionId(null);
    }
  }, []);

  const fetchVersions = useCallback(async () => {
    if (!projectId) {
      setVersions([]);
      setActiveVersionId(null);
      return;
    }
    setLoading(true);
    try {
      const data = await requestInvoiceApi(projectId, "/invoices");
      applyResponse(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Računov ni bilo mogoče naložiti.";
      toast.error(message);
      setVersions([]);
      setActiveVersionId(null);
    } finally {
      setLoading(false);
    }
  }, [applyResponse, projectId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const runAction = useCallback(
    async (
      action: () => Promise<InvoiceApiResponse>,
      successMessage?: string,
    ): Promise<InvoiceApiResponse | null> => {
      if (!projectId) return null;
      setSaving(true);
      try {
        const data = await action();
        applyResponse(data);
        if (successMessage) {
          toast.success(successMessage);
        }
        return data;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Dejanje ni uspelo.";
        toast.error(message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [applyResponse, projectId],
  );

  const createFromClosing = useCallback(async () => {
    if (!projectId) return;
    await runAction(
      () => requestInvoiceApi(projectId, "/invoices/from-closing", { method: "POST" }),
      "Osnutek računa ustvarjen.",
    );
  }, [projectId, runAction]);

  const saveDraft = useCallback(
    async (items: InvoiceItem[]): Promise<boolean> => {
      if (!projectId || !resolveActiveVersion || resolveActiveVersion.status !== "draft") {
        return false;
      }
      const result = await runAction(
        () =>
          requestInvoiceApi(projectId, `/invoices/${resolveActiveVersion._id}`, {
            method: "PATCH",
            body: JSON.stringify({ items }),
          }),
        "Račun shranjen.",
      );
      return Boolean(result);
    },
    [projectId, resolveActiveVersion, runAction],
  );

  const issue = useCallback(async (): Promise<InvoiceVersion | null> => {
    if (!projectId || !resolveActiveVersion || resolveActiveVersion.status !== "draft") return null;
    const result = await runAction(
      () =>
        requestInvoiceApi(projectId, `/invoices/${resolveActiveVersion._id}/issue`, {
          method: "POST",
        }),
      "Račun izdan.",
    );
    return result?.updatedVersion ?? resolveActiveVersion ?? null;
  }, [projectId, resolveActiveVersion, runAction]);

  const cloneForEdit = useCallback(async () => {
    if (!projectId || !resolveActiveVersion) return;
    await runAction(
      () =>
        requestInvoiceApi(projectId, `/invoices/${resolveActiveVersion._id}/clone-for-edit`, {
          method: "POST",
        }),
      "Nova verzija osnutka pripravljena.",
    );
  }, [projectId, resolveActiveVersion, runAction]);

  return {
    versions,
    activeVersion: resolveActiveVersion,
    setActiveVersionId,
    loading,
    saving,
    refresh: fetchVersions,
    createFromClosing,
    saveDraft,
    issue,
    cloneForEdit,
  };
}
