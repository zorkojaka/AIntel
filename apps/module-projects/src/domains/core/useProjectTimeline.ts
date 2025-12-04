import { useEffect, useMemo, useState } from "react";
import type { ProjectDetails } from "../../types";
import type { MaterialOrder, WorkOrder, WorkOrderStatus } from "@aintel/shared/types/logistics";
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
  logisticsSummary?: LogisticsSummary;
  executionSummary?: ExecutionSummary;
}

type MaterialSummaryLevel = "none" | "to_order" | "ordered" | "prepared" | "picked_up" | "delivered";
type WorkOrderSummaryLevel = "none" | "draft" | "issued" | "completed";

export interface LogisticsSummary {
  material: { label: string; level: MaterialSummaryLevel };
  workOrder: { label: string; level: WorkOrderSummaryLevel };
  done: boolean;
}

export interface ExecutionSummary {
  hasWorkOrders: boolean;
  totalCount: number;
  issuedCount: number;
  completedCount: number;
}

const STATUS_DONE_VALUES = new Set(["issued", "izdano", "accepted", "completed", "zakljucen"]);

type MaterialTimelineStatus = "TO_ORDER" | "ORDERED" | "PREPARED" | "PICKED_UP" | "RECEIVED";

const MATERIAL_STATUS_PRIORITY: MaterialTimelineStatus[] = [
  "TO_ORDER",
  "ORDERED",
  "PREPARED",
  "PICKED_UP",
  "RECEIVED",
];

const MATERIAL_STATUS_LABELS: Record<MaterialTimelineStatus, string> = {
  TO_ORDER: "Za naročit",
  ORDERED: "Naročeno",
  PREPARED: "Pripravljeno",
  PICKED_UP: "Prevzeto",
  RECEIVED: "Dobavljeno",
};

const MATERIAL_STATUS_LEVELS: Record<MaterialTimelineStatus, MaterialSummaryLevel> = {
  TO_ORDER: "to_order",
  ORDERED: "ordered",
  PREPARED: "prepared",
  PICKED_UP: "picked_up",
  RECEIVED: "delivered",
};

const MATERIAL_STATUS_MATCHERS: Record<MaterialTimelineStatus, string[]> = {
  TO_ORDER: ["to_order", "za narocit", "za narocilo", "za narocila", "zanarocit", "zanarocilo", "draft"],
  ORDERED: ["ordered", "naroceno"],
  PREPARED: ["prepared", "pripravljeno"],
  PICKED_UP: ["picked_up", "pickedup", "prevzeto"],
  RECEIVED: ["received", "delivered", "dobavljeno", "dostavljeno", "zmontirano"],
};

const MATERIAL_STATUS_LOOKUP: Record<string, MaterialTimelineStatus> = Object.entries(
  MATERIAL_STATUS_MATCHERS,
).reduce<Record<string, MaterialTimelineStatus>>((acc, [key, values]) => {
  for (const value of values) {
    acc[value] = key as MaterialTimelineStatus;
  }
  return acc;
}, {});

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeMaterialStatusValue(value?: string | null) {
  if (!value) return "";
  return stripDiacritics(value.toString().trim().toLowerCase());
}

function resolveMaterialStatusKey(order: MaterialOrder): MaterialTimelineStatus | null {
  const candidates = [
    order.materialStatus as string | undefined,
    (order as any)?.materialStatus as string | undefined,
    (order as any)?.status as string | undefined,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeMaterialStatusValue(candidate);
    if (!normalized) continue;
    const match = MATERIAL_STATUS_LOOKUP[normalized];
    if (match) {
      return match;
    }
  }
  return null;
}

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
    const normalizeWorkOrderStatus = (status?: WorkOrderStatus | string | null) => normalizeStatus(status);
    const isIssuedStatus = (status?: WorkOrderStatus | string | null) => {
      const normalized = normalizeWorkOrderStatus(status);
      return normalized === "issued" || normalized === "in-progress" || normalized === "confirmed" || normalized === "completed";
    };
    const totalWorkOrders = workOrders.length;
    const issuedWorkOrders = workOrders.filter((order) => isIssuedStatus(order.status));
    const issuedCount = issuedWorkOrders.length;
    const materialSummary = (() => {
      const highestStatus = materialOrders.reduce<MaterialTimelineStatus | null>(
        (currentHighest, order) => {
          const statusKey = resolveMaterialStatusKey(order);
          if (!statusKey) return currentHighest;
          if (!currentHighest) return statusKey;
          const currentIndex = MATERIAL_STATUS_PRIORITY.indexOf(currentHighest);
          const candidateIndex = MATERIAL_STATUS_PRIORITY.indexOf(statusKey);
          return candidateIndex > currentIndex ? statusKey : currentHighest;
        },
        null,
      );
      if (!highestStatus) {
        return { label: "Ni naročil", level: "none" as MaterialSummaryLevel };
      }
      return {
        label: MATERIAL_STATUS_LABELS[highestStatus],
        level: MATERIAL_STATUS_LEVELS[highestStatus],
      };
    })();
    const workOrderSummary = (() => {
      if (totalWorkOrders === 0) {
        return { label: "Ni ustvarjen", level: "none" as WorkOrderSummaryLevel };
      }
      const allCompleted = workOrders.every(
        (order) => normalizeWorkOrderStatus(order.status) === "completed",
      );
      if (allCompleted && totalWorkOrders > 0) {
        return { label: "Zaključen", level: "completed" as WorkOrderSummaryLevel };
      }
      if (issuedCount > 0) {
        return { label: "Izdan", level: "issued" as WorkOrderSummaryLevel };
      }
      return { label: "V pripravi", level: "draft" as WorkOrderSummaryLevel };
    })();
    const logisticsDone = issuedCount > 0;
    const hasActivity =
      materialSummary.level !== "none" || workOrderSummary.level !== "none";
    const logisticsStatus: StepStatus = logisticsDone ? "done" : hasActivity ? "inProgress" : "pending";
    const logisticsSummary: LogisticsSummary = {
      material: materialSummary,
      workOrder: workOrderSummary,
      done: logisticsDone,
    };
    const logisticsMeta = `${materialSummary.label} · ${workOrderSummary.label}`;

    const issuedLikeWorkOrders = issuedWorkOrders;
    const issuedItemEntries = issuedLikeWorkOrders.flatMap((order) =>
      (Array.isArray(order.items) ? order.items : []).map((item, index) => ({
        item,
        key:
          (item as any)?.id ??
          (item as any)?._id ??
          `${order._id ?? order.id ?? "order"}-${index}`,
      })),
    );
    const visibleItemsMap = new Map<string, WorkOrder["items"][number]>();
    for (const entry of issuedItemEntries) {
      const current = entry.item;
      if (!current) continue;
      const isDeleted =
        (current as any).isDeleted === true ||
        (current as any)._deleted === true ||
        (current as any).hidden === true ||
        (current as any).isHidden === true;
      if (isDeleted) continue;
      if (!visibleItemsMap.has(entry.key)) {
        visibleItemsMap.set(entry.key, current);
      }
    }
    const visibleItems = Array.from(visibleItemsMap.values());
    const executionTotalCount = visibleItems.length;
    const executionCompletedCount = visibleItems.filter((item) => item?.isCompleted === true).length;
    const executionHasWorkOrders = executionTotalCount > 0;
    const executionStatus: StepStatus = !executionHasWorkOrders
      ? "pending"
      : executionCompletedCount === executionTotalCount
        ? "done"
        : "inProgress";
    const executionMeta = executionHasWorkOrders
      ? `Zaključeno ${executionCompletedCount} / ${executionTotalCount}`
      : "Ni izdanih nalogov";
    const executionSummary: ExecutionSummary = {
      hasWorkOrders: executionHasWorkOrders,
      totalCount: executionTotalCount,
      issuedCount: issuedLikeWorkOrders.length,
      completedCount: executionCompletedCount,
    };

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
      {
        key: "logistics",
        label: "Logistika",
        status: logisticsStatus,
        meta: logisticsMeta,
        logisticsSummary,
        href: buildHref("logistics"),
      },
      {
        key: "execution",
        label: "Izvedba",
        status: executionStatus,
        meta: executionMeta,
        executionSummary,
        href: buildHref("execution"),
      },
      { key: "invoice", label: "Račun", status: invoiceStatus, meta: invoiceMeta, href: buildHref("closing") },
    ];
  }, [project, remoteOffers]);
}
