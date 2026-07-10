import { useState } from "react";
import { toast } from "sonner";

import type { OfferVersion } from "@aintel/shared/types/offers";

import { downloadPdf } from "../../api";
import type { ProjectDetails } from "../../types";
import { buildOfferPdfFilename } from "./offerEditorUtils";

type OfferPdfDownloadMode = "offer" | "both" | "descriptions";
type OfferPdfPreviewMode = "offer" | "descriptions";

type UseOfferPdfActionsInput = {
  projectId: string;
  ensureSavedOffer: () => Promise<OfferVersion | null>;
  ensureProjectDetails: () => Promise<ProjectDetails | null>;
};

function openPreviewWindow() {
  const previewWindow = window.open("about:blank", "_blank");
  if (!previewWindow) {
    toast.error("Predogleda ni bilo mogoče odpreti.");
  }
  return previewWindow;
}

async function loadPdfPreview(previewWindow: Window, url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("PDF predogled ni na voljo.");
    }
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    previewWindow.location.href = objectUrl;
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    previewWindow.close();
    console.error(error);
    toast.error("PDF predogleda ni bilo mogoče odpreti.");
  }
}

export function useOfferPdfActions({
  projectId,
  ensureSavedOffer,
  ensureProjectDetails,
}: UseOfferPdfActionsInput) {
  const [downloadingMode, setDownloadingMode] = useState<OfferPdfDownloadMode | null>(null);
  const [previewingMode, setPreviewingMode] = useState<OfferPdfPreviewMode | null>(null);
  const isPdfBusy = downloadingMode !== null || previewingMode !== null;

  const handleExportPdf = async (mode: "offer" | "both") => {
    setDownloadingMode(mode);
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) return;
      const url = `/api/projects/${projectId}/offers/${saved._id}/pdf?mode=${mode}`;
      const details = await ensureProjectDetails();
      const filename = buildOfferPdfFilename(details, projectId, mode === "both" ? "Ponudba+Projekt" : "Ponudba", saved);
      await downloadPdf(url, filename);
      toast.success("PDF prenesen");
    } catch (error) {
      console.error(error);
      toast.error("PDF ni bilo mogoce prenesti.");
    } finally {
      setDownloadingMode(null);
    }
  };

  const handleExportDescriptionsPdf = async () => {
    setDownloadingMode("descriptions");
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) return;
      const url = `/api/projects/${projectId}/offers/${saved._id}/pdf?variant=descriptions`;
      const details = await ensureProjectDetails();
      const filename = buildOfferPdfFilename(details, projectId, "Opis", saved);
      await downloadPdf(url, filename);
      toast.success("PDF prenesen");
    } catch (error) {
      console.error(error);
      toast.error("PDF ni bilo mogoce prenesti.");
    } finally {
      setDownloadingMode(null);
    }
  };

  const handlePreviewOfferPdf = async () => {
    const previewWindow = openPreviewWindow();
    if (!previewWindow) return;
    setPreviewingMode("offer");
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) {
        previewWindow.close();
        return;
      }
      await loadPdfPreview(previewWindow, `/api/projects/${projectId}/offers/${saved._id}/pdf?mode=offer`);
    } finally {
      setPreviewingMode(null);
    }
  };

  const handlePreviewDescriptionsPdf = async () => {
    const previewWindow = openPreviewWindow();
    if (!previewWindow) return;
    setPreviewingMode("descriptions");
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) {
        previewWindow.close();
        return;
      }
      await loadPdfPreview(previewWindow, `/api/projects/${projectId}/offers/${saved._id}/pdf?variant=descriptions`);
    } finally {
      setPreviewingMode(null);
    }
  };

  return {
    downloadingMode,
    previewingMode,
    isPdfBusy,
    handleExportPdf,
    handleExportDescriptionsPdf,
    handlePreviewOfferPdf,
    handlePreviewDescriptionsPdf,
  };
}
