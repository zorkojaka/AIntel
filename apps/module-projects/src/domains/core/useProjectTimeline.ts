import { useEffect, useMemo, useState } from "react";
import type { ProjectDetails } from "../../types";
import type { MaterialOrder, WorkOrder, WorkOrderStatus } from "@aintel/shared/types/logistics";
import type { OfferVersionSummary } from "@aintel/shared/types/offers";

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

const USE_REMOTE_OFFERS = false;

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeMaterialStatusValue(value?: string | null) {
  if (!value) return "";
  return stripDiacritics(value.toString().trim().toLowerCase());
}

function resolveMaterialStatusKey(order: MaterialOrder): MaterialTimelineStatus | null {
  const candidates = [order.materialStatus as string | undefined, (order as any)?.status as string | undefined];
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

function getWorkOrderIdentifier(order: WorkOrder, fallbackIndex: number) {
  const rawId = (order as any)?._id ?? (order as any)?.id;
  if (rawId) {
    return String(rawId);
  }
  return `work-order-${fallbackIndex}`;
}

function isWorkOrderIssuedLike(status?: WorkOrderStatus | string | null) {
  const normalized = normalizeStatus(status);
  return normalized === "issued" || normalized === "in-progress" || normalized === "confirmed" || normalized === "completed";
}

function isWorkOrderCompletedLike(status?: WorkOrderStatus | string | null) {
  const normalized = normalizeStatus(status);
  return normalized === "completed" || normalized === "zakljucen";
}

function buildRequirementsStep(project: ProjectDetails | null | undefined, basePath: string) {
  const requirementCount = Array.isArray(project?.requirements) ? project.requirements.length : 0;
  const requirementsDone = requirementCount > 0;
  const requirementsStatus: StepStatus = requirementsDone ? "done" : "inProgress";
  const requirementsMeta = requirementCount > 0 ? `${requirementCount} zahtev` : undefined;

  return {
    step: {
      key: "requirements",
      label: "Zahteve",
      status: requirementsStatus,
      meta: requirementsMeta,
      href: `${basePath}/requirements`,
    } satisfies TimelineStep,
    requirementsDone,
  };
}

function buildOffersStep(
  project: ProjectDetails | null | undefined,
  basePath: string,
  offersSource: OfferVersionSummary[],
  requirementsDone: boolean,
) {
  const offerCount = offersSource.length;
  const isConfirmedByLogistics = Boolean(
    (project as any)?.logistics?.confirmedOfferVersionId || (project as any)?.logistics?.acceptedOfferId,
  );
  const offerDone =
    isConfirmedByLogistics || offersSource.some((offer) => STATUS_DONE_VALUES.has(normalizeStatus((offer as any).status)));
  const shouldHighlightOffers = requirementsDone && !offerDone;
  const offersStatus: StepStatus = offerDone ? "done" : shouldHighlightOffers ? "inProgress" : "pending";
  const offersMeta = offerCount > 0 ? `${offerCount} ponudb` : undefined;

  return {
    step: {
      key: "offers",
      label: "Ponudbe",
      status: offersStatus,
      meta: offersMeta,
      href: `${basePath}/offers`,
    } satisfies TimelineStep,
    offerDone,
  };
}

function summarizeMaterialOrders(materialOrders: MaterialOrder[]): { label: string; level: MaterialSummaryLevel } {
  const highestStatus = materialOrders.reduce<MaterialTimelineStatus | null>((currentHighest, order) => {
    const statusKey = resolveMaterialStatusKey(order);
    if (!statusKey) return currentHighest;
    if (!currentHighest) return statusKey;
    const currentIndex = MATERIAL_STATUS_PRIORITY.indexOf(currentHighest);
    const candidateIndex = MATERIAL_STATUS_PRIORITY.indexOf(statusKey);
    return candidateIndex > currentIndex ? statusKey : currentHighest;
  }, null);

  if (!highestStatus) {
    return { label: "Ni naročil", level: "none" };
  }
  return {
    label: MATERIAL_STATUS_LABELS[highestStatus],
    level: MATERIAL_STATUS_LEVELS[highestStatus],
  };
}

function summarizeWorkOrders(workOrders: WorkOrder[], issuedCount: number) {
  if (workOrders.length === 0) {
    return { label: "Ni ustvarjen", level: "none" as WorkOrderSummaryLevel };
  }

  const allCompleted = workOrders.every((order) => isWorkOrderCompletedLike(order.status));
  if (allCompleted) {
    return { label: "Zaključen", level: "completed" as WorkOrderSummaryLevel };
  }
  if (issuedCount > 0) {
    return { label: "Izdan", level: "issued" as WorkOrderSummaryLevel };
  }
  return { label: "V pripravi", level: "draft" as WorkOrderSummaryLevel };
}

function buildLogisticsStep(
  basePath: string,
  materialOrders: MaterialOrder[],
  workOrders: WorkOrder[],
  issuedWorkOrders: WorkOrder[],
) {
  const issuedCount = issuedWorkOrders.length;
  const materialSummary = summarizeMaterialOrders(materialOrders);
  const workOrderSummary = summarizeWorkOrders(workOrders, issuedCount);
  const logisticsDone = issuedCount > 0;
  const hasActivity = materialSummary.level !== "none" || workOrderSummary.level !== "none";
  const logisticsStatus: StepStatus = logisticsDone ? "done" : hasActivity ? "inProgress" : "pending";
  const logisticsSummary: LogisticsSummary = {
    material: materialSummary,
    workOrder: workOrderSummary,
    done: logisticsDone,
  };
  const logisticsMeta = `${materialSummary.label} · ${workOrderSummary.label}`;

  return {
    step: {
      key: "logistics",
      label: "Priprava",
      status: logisticsStatus,
      meta: logisticsMeta,
      logisticsSummary,
      href: `${basePath}/logistics`,
    } satisfies TimelineStep,
    logisticsDone,
  };
}

function buildExecutionStep(basePath: string, issuedWorkOrders: WorkOrder[]) {
  const hasIssuedWorkOrders = issuedWorkOrders.length > 0;
  const completedIssuedWorkOrders = issuedWorkOrders.filter((order) => isWorkOrderCompletedLike(order.status));
  const allIssuedWorkOrdersCompleted = hasIssuedWorkOrders && completedIssuedWorkOrders.length === issuedWorkOrders.length;

  const issuedItemEntries = issuedWorkOrders.flatMap((order, orderIndex) =>
    (Array.isArray(order.items) ? order.items : []).map((item, index) => ({
      item,
      key:
        (item as any)?.id ??
        (item as any)?._id ??
        `${getWorkOrderIdentifier(order, orderIndex)}-${index}`,
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
  const executionStatus: StepStatus = !hasIssuedWorkOrders
    ? "pending"
    : allIssuedWorkOrdersCompleted
      ? "done"
      : "inProgress";
  const executionMeta = executionHasWorkOrders
    ? `Zaključeno ${executionCompletedCount} / ${executionTotalCount}`
    : "Ni izdanih nalogov";
  const executionSummary: ExecutionSummary = {
    hasWorkOrders: executionHasWorkOrders,
    totalCount: executionTotalCount,
    issuedCount: issuedWorkOrders.length,
    completedCount: executionCompletedCount,
  };

  return {
    step: {
      key: "execution",
      label: "Izvedba",
      status: executionStatus,
      meta: executionMeta,
      executionSummary,
      href: `${basePath}/execution`,
    } satisfies TimelineStep,
    executionComplete: hasIssuedWorkOrders && allIssuedWorkOrdersCompleted,
  };
}

function buildInvoiceStep(
  basePath: string,
  closingSummary: any,
  invoiceVersions: any[],
  executionComplete: boolean,
) {
  const issuedInvoice = invoiceVersions.some((invoice) => STATUS_DONE_VALUES.has(normalizeStatus(invoice.status)));
  let invoiceStatus: StepStatus = "pending";
  let invoiceMeta: string | undefined;

  const invoiceDraftExists = closingSummary || invoiceVersions.length > 0;

  if (issuedInvoice) {
    invoiceStatus = "done";
    invoiceMeta = "Račun izdan";
  } else if (executionComplete) {
    invoiceStatus = "inProgress";
    invoiceMeta = invoiceDraftExists ? "Osnutek" : "Pripravljeno za izdajo";
  } else {
    invoiceStatus = "pending";
    invoiceMeta = invoiceDraftExists ? "Osnutek" : undefined;
  }

  return {
    step: {
      key: "invoice",
      label: "Račun",
      status: invoiceStatus,
      meta: invoiceMeta,
      href: `${basePath}/closing`,
    } satisfies TimelineStep,
  };
}

export function useProjectTimeline(project?: ProjectDetails | null): TimelineStep[] {
  const projectId = project?.id ?? null;
  const [remoteOffers, setRemoteOffers] = useState<OfferVersionSummary[] | null>(null);

  const projectOfferVersions = Array.isArray((project as any)?.offerVersions) ? (project as any).offerVersions : [];
  const offerSignal =
    projectId && projectOfferVersions.length > 0
      ? projectOfferVersions.map((offer: any) => `${offer._id || offer.id || offer.version}:${offer.status}`).join("|")
      : projectId && Array.isArray(project?.offers)
        ? project.offers.map((offer: any) => `${offer.id}:${offer.status}`).join("|")
        : null;
  const logisticsOfferSignal =
    projectId && project?.logistics
      ? [
          project.logistics.confirmedOfferVersionId ?? "",
          project.logistics.acceptedOfferId ?? "",
          Array.isArray((project.logistics as any)?.offerVersions)
            ? (project.logistics as any).offerVersions
                .map((offer: any) => `${offer._id || offer.id || offer.version}:${offer.status}`)
                .join("|")
            : "",
        ].join("|")
      : null;

  useEffect(() => {
    if (!USE_REMOTE_OFFERS || !projectId) {
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
    setRemoteOffers(null);
    fetchOffers();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId, offerSignal, logisticsOfferSignal]);

  return useMemo(() => {
    const basePath = project?.id ? `/projects/${project.id}` : "#";
    const forceCompleted = project?.status === "completed";

  const offersSource = USE_REMOTE_OFFERS ? remoteOffers ?? collectOffers(project) : collectOffers(project);
    const requirementsInfo = buildRequirementsStep(project, basePath);
    const offersInfo = buildOffersStep(project, basePath, offersSource, requirementsInfo.requirementsDone);
    const workOrders = collectWorkOrders(project);
    const materialOrders = collectMaterialOrders(project);
    const closingSummary = resolveClosingSummary(project);
    const invoiceVersions = collectInvoiceVersions(project);
    const issuedWorkOrders = workOrders.filter((order) => isWorkOrderIssuedLike(order.status));
    const logisticsInfo = buildLogisticsStep(basePath, materialOrders, workOrders, issuedWorkOrders);
    const executionInfo = buildExecutionStep(basePath, issuedWorkOrders);
    const invoiceInfo = buildInvoiceStep(basePath, closingSummary, invoiceVersions, executionInfo.executionComplete);

    if (forceCompleted) {
      requirementsInfo.step.status = "done";
      offersInfo.step.status = "done";
      logisticsInfo.step.status = "done";
      logisticsInfo.step.logisticsSummary!.done = true;
      executionInfo.step.status = "done";
      invoiceInfo.step.status = "done";
      invoiceInfo.step.meta = invoiceInfo.step.meta ?? "Račun izdan";
    }

    return [
      requirementsInfo.step,
      offersInfo.step,
      logisticsInfo.step,
      executionInfo.step,
      invoiceInfo.step,
    ];
  }, [project, remoteOffers]);
}
