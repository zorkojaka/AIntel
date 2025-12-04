import { useEffect, useMemo, useState } from "react";
import type { ProjectDetails } from "../../types";
import type { WorkOrder, MaterialOrder } from "@aintel/shared/types/logistics";
import type { OfferVersionSummary } from "@aintel/shared/types/offers";
import { useQueryClient } from "@tanstack/react-query";

export type StepStatus = "done" | "inProgress" | "pending";

export type StepKey = "requirements" | "offers" | "logistics" | "execution" | "invoice";

export interface TimelineStep {
  key: StepKey;
  label: string;
  status: StepStatus;
  href: string;
  meta?: string;
}

const STATUS_DONE_VALUES = new Set(["issued", "izdano", "accepted", "completed", "zakljucen"]);

function normalizeStatus(value?: string | null) {
  return (value ?? "").toString().trim().toLowerCase();
}

function collectOffers(project?: ProjectDetails | null) {
  const explicit = Array.isArray((project as any)?.offerVersions) ? (project as any).offerVersions : [];
  const legacy = Array.isArray(project?.offers) ? project.offers : [];
  return [...legacy, ...explicit];
}

function collectWorkOrders(project?: ProjectDetails | null): WorkOrder[] {
  const logistics = project?.logistics;
  if (!logistics) return [];
  const list = Array.isArray(logistics.workOrders) ? logistics.workOrders : [];
  const single = logistics.workOrder ? [logistics.workOrder] : [];
  return [...list, ...single] as WorkOrder[];
}

function collectMaterialOrders(project?: ProjectDetails | null): MaterialOrder[] {
  const logistics = project?.logistics;
  if (!logistics) return [];
  const list = Array.isArray(logistics.materialOrders) ? logistics.materialOrders : [];
  const single = logistics.materialOrder ? [logistics.materialOrder] : [];
  return [...list, ...single] as MaterialOrder[];
}

function collectInvoiceVersions(project?: ProjectDetails | null) {
  const direct = Array.isArray((project as any)?.invoiceVersions) ? (project as any).invoiceVersions : [];
  const logistic =
    project?.logistics && Array.isArray((project.logistics as any)?.invoiceVersions)
      ? (project.logistics as any).invoiceVersions
      : [];
  return [...direct, ...logistic];
}

function resolveClosingSummary(project?: ProjectDetails | null) {
  return (project as any)?.closingSummary ?? (project?.logistics as any)?.closingSummary ?? null;
}

export function useProjectTimeline(project?: ProjectDetails | null): TimelineStep[] {
  const projectId = project?.id ?? null;
  const [remoteOffers, setRemoteOffers] = useState<OfferVersionSummary[] | null>(null);

  const offerSignal =
    projectId && Array.isArray(project?.offerVersions)
      ? project.offerVersions.map((offer: any) => `${offer._id || offer.id || offer.version}:${offer.status}`).join("|")
      : projectId && Array.isArray(project?.offers)
        ? project.offers.map((offer: any) => `${offer.id}:${offer.status}`).join("|")
        : null;

  useEffect(() => {
    if (!projectId) {
      setRemoteOffers(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const fetchOffers = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/offers`, { signal: controller.signal });
        const payload = await response.json();
        if (!payload.success || cancelled) return;
        setRemoteOffers(Array.isArray(payload.data) ? payload.data : []);
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
        if (!cancelled) {
          setRemoteOffers(null);
        }
      }
    };
    fetchOffers();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId, offerSignal]);

  return useMemo(() => {
    const basePath = project?.id ? `/projects/${project.id}` : "#";

    const requirementCount = Array.isArray(project?.requirements) ? project!.requirements!.length : 0;
    const requirementsStatus: StepStatus = requirementCount > 0 ? "done" : "pending";
    const requirementsMeta = requirementCount > 0 ? `${requirementCount} zahtev` : undefined;

    const offersSource = remoteOffers ?? collectOffers(project);
    const offerCount = offersSource.length;
    const offerDone = offersSource.some((offer) =>
      STATUS_DONE_VALUES.has(normalizeStatus((offer as any).status)),
    );
    const offersStatus: StepStatus = offerDone ? "done" : offerCount > 0 ? "inProgress" : "pending";
    const offersMeta = offerCount > 0 ? `${offerCount} ponudb` : undefined;

    const workOrders = collectWorkOrders(project);
    const materialOrders = collectMaterialOrders(project);
    const hasWorkOrders = workOrders.length > 0;
    const hasMaterialOrders = materialOrders.length > 0;
    const logisticsStatus: StepStatus =
      hasWorkOrders && hasMaterialOrders ? "done" : hasWorkOrders || hasMaterialOrders ? "inProgress" : "pending";
    const logisticsMeta = hasWorkOrders ? `${workOrders.length} nalogov` : undefined;

    const completedWorkOrders = workOrders.filter((order) => STATUS_DONE_VALUES.has(normalizeStatus(order.status))).length;
    const executionStatus: StepStatus =
      completedWorkOrders > 0 ? "done" : workOrders.length > 0 ? "inProgress" : "pending";
    const executionMeta = workOrders.length > 0 ? `${completedWorkOrders}/${workOrders.length} izvedenih` : undefined;

    const closingSummary = resolveClosingSummary(project);
    const invoiceVersions = collectInvoiceVersions(project);
    const issuedInvoice = invoiceVersions.some((invoice) => STATUS_DONE_VALUES.has(normalizeStatus(invoice.status)));

    let invoiceStatus: StepStatus = "pending";
    let invoiceMeta: string | undefined;

    if (issuedInvoice) {
      invoiceStatus = "done";
      invoiceMeta = "Račun izdan";
    } else if (closingSummary || invoiceVersions.length > 0) {
      invoiceStatus = "inProgress";
      invoiceMeta = invoiceVersions.length > 0 ? "Osnutek" : undefined;
    } else {
      invoiceStatus = "pending";
    }

    const buildHref = (segment: string) => `${basePath}/${segment}`;

    return [
      { key: "requirements", label: "Zahteve", status: requirementsStatus, meta: requirementsMeta, href: buildHref("requirements") },
      { key: "offers", label: "Ponudbe", status: offersStatus, meta: offersMeta, href: buildHref("offers") },
      { key: "logistics", label: "Logistika", status: logisticsStatus, meta: logisticsMeta, href: buildHref("logistics") },
      { key: "execution", label: "Izvedba", status: executionStatus, meta: executionMeta, href: buildHref("execution") },
      { key: "invoice", label: "Račun", status: invoiceStatus, meta: invoiceMeta, href: buildHref("closing") },
    ];
  }, [project, remoteOffers]);
}
