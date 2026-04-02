import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "./ui/button";
import { Tabs, TabsContent } from "./ui/tabs";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { clearMobileTopbar, setMobileTopbar } from "@aintel/shared/utils/mobileTopbar";
import { OfferVersion } from "../domains/offers/OfferVersionCard";
import type { WorkOrder as LogisticsWorkOrder } from "@aintel/shared/types/logistics";
import type { ProjectLogistics } from "@aintel/shared/types/projects/Logistics";
import { renderTemplate, openPreview, downloadHTML } from "../domains/offers/TemplateRenderer";
import { toast } from "sonner";
import { ProjectDetails, ProjectOffer, ProjectOfferItem, Template } from "../types";
import { fetchRequirementVariants } from "../api";
import type { ProjectRequirement } from "@aintel/shared/types/project";
import { LogisticsPanel } from "../domains/logistics/LogisticsPanel";
import { useProject } from "../domains/core/useProject";
import { ProjectHeader } from "../domains/core/ProjectHeader";
import { ProjectQuickNav } from "../domains/core/ProjectQuickNav";
import { useProjectTimeline, type StepKey, type StepStatus, type TimelineStep } from "../domains/core/useProjectTimeline";
import { useProjectMutationRefresh } from "../domains/core/useProjectMutationRefresh";
import { PhaseRibbon, type PhaseRibbonStatus } from "./PhaseRibbon";
import { CommunicationPanel } from "../domains/communication/CommunicationPanel";

type WorkspaceTabValue = "items" | "offers" | "logistics" | "execution" | "closing";
type WorkspaceCSSVars = CSSProperties & { "--brand-color"?: string };
const STEP_ORDER: StepKey[] = ["requirements", "offers", "logistics", "execution", "invoice"];
const STEP_BY_TAB: Record<WorkspaceTabValue, StepKey> = {
  items: "requirements",
  offers: "offers",
  logistics: "logistics",
  execution: "execution",
  closing: "invoice",
};
const TAB_BY_STEP: Record<StepKey, WorkspaceTabValue> = {
  requirements: "items",
  offers: "offers",
  logistics: "logistics",
  execution: "execution",
  invoice: "closing",
};

import { RequirementsPanel, RequirementRow } from "../domains/requirements/RequirementsPanel";
import { OffersPanel } from "../domains/offers/OffersPanel";
import { ExecutionPanel } from "../domains/execution/ExecutionPanel";
import { ClosingPanel } from "../domains/closing/ClosingPanel";

const serializeRequirements = (list: RequirementRow[] | null | undefined) => JSON.stringify(list ?? []);
const areRequirementListsEqual = (a?: RequirementRow[], b?: RequirementRow[]) =>
  serializeRequirements(a) === serializeRequirements(b);

type ProjectCrmClient = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  postalCode?: string | null;
  postalCity?: string | null;
  address?: string | null;
};

function formatClientAddress(client?: ProjectCrmClient | null) {
  if (!client) return "";
  const street = client.street?.trim();
  const postalParts = [client.postalCode, client.postalCity].map((part) => part?.trim()).filter(Boolean);
  const postal = postalParts.join(" ").trim();
  if (street && postal) return `${street}, ${postal}`;
  if (street) return street;
  if (postal) return postal;
  return client.address?.trim() ?? "";
}

function formatProjectDisplayId(project?: Pick<ProjectDetails, "projectNumber" | "code" | "id"> | null) {
  if (!project) return "";
  if (project.projectNumber != null && Number.isFinite(project.projectNumber)) {
    return `PRJ-${String(project.projectNumber).padStart(3, "0")}`;
  }
  return project.code?.trim() || project.id || "";
}

function getProjectStatusLabel(status: ProjectStatus) {
  if (status === "draft") return "Osnutek";
  if (status === "offered") return "Ponujeno";
  if (status === "ordered") return "Naročeno";
  if (status === "in-progress") return "V teku";
  if (status === "completed") return "Zaključeno";
  return "Zaračunano";
}

interface ProjectWorkspaceProps {
  projectId: string;
  initialProject?: ProjectDetails | null;
  initialTab?: WorkspaceTabValue;
  allowedTabs?: WorkspaceTabValue[];
  templates: Template[];
  onBack: () => void;
  onProjectUpdate: (path: string, options?: RequestInit) => Promise<ProjectDetails | null>;
  onNewProject: () => void;
  brandColor?: string | null;
}

export function ProjectWorkspace({
  projectId,
  initialProject,
  initialTab,
  allowedTabs,
  templates,
  onBack,
  onProjectUpdate,
  onNewProject,
  brandColor,
}: ProjectWorkspaceProps) {
  const allowedTabValues = useMemo<WorkspaceTabValue[]>(
    () => (allowedTabs && allowedTabs.length > 0 ? allowedTabs : ["items", "offers", "logistics", "execution", "closing"]),
    [allowedTabs],
  );
  const initialResolvedTab = useMemo<WorkspaceTabValue>(() => {
    if (initialTab && allowedTabValues.includes(initialTab)) {
      return initialTab;
    }
    return allowedTabValues[0] ?? "items";
  }, [initialTab, allowedTabValues]);
  const { project, loading, error, refresh, setProject } = useProject(projectId, initialProject ?? null);
  const [activeTab, setActiveTab] = useState<WorkspaceTabValue>(initialResolvedTab);
  const [overrideStep, setOverrideStep] = useState<StepKey | null>(null);
  const [offers, setOffers] = useState<OfferVersion[]>(project?.offers ?? []);
  const [activeOffer, setActiveOffer] = useState<ProjectOffer | null>(null);
  const [offerItems, setOfferItems] = useState<ProjectOfferItem[]>([]);
  const [draftOfferItem, setDraftOfferItem] = useState<Partial<ProjectOfferItem>>({
    name: "",
    sku: "",
    unit: "kos",
    quantity: 1,
    price: 0,
    discount: 0,
    vatRate: 22,
    total: 0,
    description: "",
    productId: "",
  });
  const [status, setStatus] = useState(project?.status ?? "draft");
  const [requirementsText, setRequirementsText] = useState(project?.requirementsText ?? "");
  const [requirements, setRequirements] = useState<RequirementRow[]>(() =>
    Array.isArray(project?.requirements) ? project.requirements : []
  );
  const [savedRequirements, setSavedRequirements] = useState<RequirementRow[]>(() =>
    Array.isArray(project?.requirements) ? project.requirements : []
  );
  const [savedRequirementsText, setSavedRequirementsText] = useState(project?.requirementsText ?? "");
  const [isSavingRequirements, setIsSavingRequirements] = useState(false);
  const [isProceedingToOffers, setIsProceedingToOffers] = useState(false);
  const [isOfferLoading, setIsOfferLoading] = useState(false);
  const [offerVatRate, setOfferVatRate] = useState<number>(22);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [variantOptions, setVariantOptions] = useState<{ variantSlug: string; label: string }[]>([]);
  const [variantLoading, setVariantLoading] = useState(false);
  const [selectedVariantSlug, setSelectedVariantSlug] = useState<string>(project?.requirementsTemplateVariantSlug ?? "");
  const showVariantWizard = variantOptions.length > 0 && !project?.requirementsTemplateVariantSlug;
  const [offersRefreshKey, setOffersRefreshKey] = useState(0);
  const [communicationRefreshKey, setCommunicationRefreshKey] = useState(0);
  const [isOfferEditorDirty, setIsOfferEditorDirty] = useState(false);
  const [isUnsavedOfferDialogOpen, setIsUnsavedOfferDialogOpen] = useState(false);
  const pendingOfferNavigationRef = useRef<(() => void | Promise<void>) | null>(null);
  const offerSaveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const logisticsSaveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const executionSaveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const invoiceSectionRef = useRef<HTMLDivElement | null>(null);
  const timelineSteps = useProjectTimeline(project);
  const allTabsConfig: { value: WorkspaceTabValue; label: string }[] = [
    { value: "items", label: "Zahteve" },
    { value: "offers", label: "Ponudbe" },
    { value: "logistics", label: "Priprava" },
    { value: "execution", label: "Izvedba" },
    { value: "closing", label: "Račun" },
  ];
  const tabsConfig = useMemo(
    () => allTabsConfig.filter((tab) => allowedTabValues.includes(tab.value)),
    [allTabsConfig, allowedTabValues],
  );
  const timelineStepByKey = useMemo(() => {
    const map = {} as Partial<Record<StepKey, TimelineStep>>;
    timelineSteps.forEach((step) => {
      map[step.key] = step;
    });
    return map;
  }, [timelineSteps]);
  const activeQuickStep: StepKey = overrideStep ?? STEP_BY_TAB[activeTab] ?? "requirements";
  const allowedStepKeys = useMemo(
    () => new Set(allowedTabValues.map((tab) => STEP_BY_TAB[tab])),
    [allowedTabValues],
  );
  const visibleTimelineSteps = useMemo(
    () => timelineSteps.filter((step) => allowedStepKeys.has(step.key)),
    [timelineSteps, allowedStepKeys],
  );
  const activePhaseStepKey = useMemo<StepKey | null>(() => {
    const activeStep = timelineSteps.find((step) => step.status === "inProgress");
    return activeStep?.key ?? null;
  }, [timelineSteps]);
  const phaseRibbonSteps = useMemo(() => {
    return tabsConfig.map((tab) => {
      const stepKey = STEP_BY_TAB[tab.value];
      const stepStatus: StepStatus = stepKey ? timelineStepByKey[stepKey]?.status ?? "pending" : "pending";
      const status: PhaseRibbonStatus =
        stepStatus === "done" ? "done" : stepStatus === "inProgress" ? "active" : "future";
      return {
        key: tab.value,
        value: tab.value,
        label: tab.label,
        status,
      };
    });
  }, [tabsConfig, timelineStepByKey]);
  const hasInitializedActiveTabRef = useRef(false);
  const prevActivePhaseStepRef = useRef<StepKey | null>(null);

  useEffect(() => {
    if (!allowedTabValues.includes(activeTab)) {
      setActiveTab(allowedTabValues[0] ?? "items");
    }
  }, [activeTab, allowedTabValues]);

  const registerOfferSaveHandler = useCallback((handler: (() => Promise<boolean>) | null) => {
    offerSaveHandlerRef.current = handler;
  }, []);
  const registerLogisticsSaveHandler = useCallback((handler: (() => Promise<boolean>) | null) => {
    logisticsSaveHandlerRef.current = handler;
  }, []);
  const registerExecutionSaveHandler = useCallback((handler: (() => Promise<boolean>) | null) => {
    executionSaveHandlerRef.current = handler;
  }, []);

  const closeUnsavedOfferDialog = useCallback(() => {
    setIsUnsavedOfferDialogOpen(false);
    pendingOfferNavigationRef.current = null;
  }, []);

  const runPendingOfferNavigation = useCallback(async () => {
    const action = pendingOfferNavigationRef.current;
    pendingOfferNavigationRef.current = null;
    setIsUnsavedOfferDialogOpen(false);
    if (action) {
      await action();
    }
  }, []);

  const requestOfferNavigation = useCallback(
    (action: () => void | Promise<void>) => {
      if (activeTab === "offers" && isOfferEditorDirty) {
        pendingOfferNavigationRef.current = action;
        setIsUnsavedOfferDialogOpen(true);
        return;
      }
      void action();
    },
    [activeTab, isOfferEditorDirty],
  );

  const handleSaveDirtyOfferAndContinue = useCallback(async () => {
    const saveHandler = offerSaveHandlerRef.current;
    if (!saveHandler) {
      await runPendingOfferNavigation();
      return;
    }
    const saved = await saveHandler();
    if (!saved) {
      return;
    }
    setIsOfferEditorDirty(false);
    await runPendingOfferNavigation();
  }, [runPendingOfferNavigation]);

  const handleDiscardDirtyOfferAndContinue = useCallback(async () => {
    setIsOfferEditorDirty(false);
    await runPendingOfferNavigation();
  }, [runPendingOfferNavigation]);

  const handleBackWithGuard = useCallback(() => {
    requestOfferNavigation(onBack);
  }, [onBack, requestOfferNavigation]);

  const basePath = project ? `/api/projects/${project.id}` : "";
  const isExecutionPhase = status === "ordered" || status === "in-progress" || status === "completed";
  const inlineClient = project ? ((project as ProjectDetails & { client?: ProjectCrmClient }).client ?? null) : null;
  const [remoteClient, setRemoteClient] = useState<ProjectCrmClient | null>(null);
  const crmClient = inlineClient ?? remoteClient;
  const displayedClient: ProjectCrmClient = crmClient ?? project?.customerDetail ?? {};
  const infoCardAddress = formatClientAddress(displayedClient) || project?.customerDetail.address || "";
  const infoCardEmail = crmClient?.email ?? project?.customerDetail.email ?? "";
  const infoCardPhone = crmClient?.phone ?? project?.customerDetail.phone ?? "";
  const refreshAfterMutation = useProjectMutationRefresh(project?.id ?? projectId);
  const brandAccentColor = useMemo(() => {
    const trimmed = brandColor?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : "#22c55e";
  }, [brandColor]);
  const workspaceCssVars = useMemo<WorkspaceCSSVars>(() => ({ "--brand-color": brandAccentColor }), [brandAccentColor]);
  const projectDisplayId = useMemo(() => formatProjectDisplayId(project), [project]);
  const isRequirementsDirty = useMemo(
    () =>
      !areRequirementListsEqual(requirements, savedRequirements) || requirementsText !== savedRequirementsText,
    [requirements, savedRequirements, requirementsText, savedRequirementsText],
  );

  useEffect(() => {
    if (!project) return undefined;
    let cancelled = false;
    if (inlineClient) {
      setRemoteClient(null);
      return () => {
        cancelled = true;
      };
    }
    const fetchClient = async () => {
      try {
        const response = await fetch(`/api/projects/${project.id}`);
        const payload = await response.json();
        if (!payload.success || cancelled) {
          return;
        }
        setRemoteClient(payload.data?.client ?? null);
      } catch {
        if (!cancelled) {
          setRemoteClient(null);
        }
      }
    };
    fetchClient();
    return () => {
      cancelled = true;
    };
  }, [project, inlineClient]);

  useEffect(() => {
    if (!project) {
      clearMobileTopbar();
      return;
    }

    const statusLabel = getProjectStatusLabel(status as ProjectStatus);
    setMobileTopbar({
      title: project.title,
      leadingAction: {
        kind: "back",
        onClick: handleBackWithGuard,
        ariaLabel: "Nazaj na projekte",
      },
      actions: [
        {
          id: "project-status",
          label: statusLabel,
          onClick: () => {},
          variant: "badge",
          ariaLabel: `Status projekta: ${statusLabel}`,
        },
      ],
    });

    return () => clearMobileTopbar();
  }, [handleBackWithGuard, project, status]);

  const fetchActiveOffer = useCallback(async () => {
    setIsOfferLoading(true);
    try {
      const response = await fetch(`${basePath}/offer`);
      const result = await response.json();
      if (!result.success) {
        toast.error(result.error ?? "Napaka pri nalaganju ponudbe.");
        return;
      }
      const offer: ProjectOffer = result.data;
      setActiveOffer(offer);
      setOfferItems(offer?.items ?? []);
    } catch (error) {
      toast.error("Ponudbe ni mogoče naložiti.");
    } finally {
      setIsOfferLoading(false);
    }
  }, [basePath]);

  const persistOfferItems = useCallback(
    async (itemsToSave: ProjectOfferItem[]) => {
      try {
        const response = await fetch(`${basePath}/offer`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: itemsToSave }),
        });
        const result = await response.json();
        if (!result.success) {
          toast.error(result.error ?? "Napaka pri shranjevanju ponudbe.");
          return null;
        }
        const offer: ProjectOffer = result.data;
        setActiveOffer(offer);
        setOfferItems(offer?.items ?? []);
        return offer;
      } catch (error) {
        toast.error("Ponudbe ni mogoče shraniti.");
        return null;
      }
    },
    [basePath]
  );

  useEffect(() => {
    if (!project) {
      setOffers([]);
      setActiveOffer(null);
      setOfferItems([]);
      setStatus("draft");
      setRequirements([]);
      setSavedRequirements([]);
      setRequirementsText("");
      setSavedRequirementsText("");
      setSelectedVariantSlug("");
      return;
    }
    const incomingRequirements = Array.isArray(project.requirements) ? project.requirements : [];
    const incomingRequirementsText = project.requirementsText ?? "";
    setOffers(project.offers);
    setActiveOffer(null);
    setOfferItems([]);
    setStatus(project.status);
    setRequirements(incomingRequirements);
    setSavedRequirements(incomingRequirements);
    setRequirementsText(incomingRequirementsText);
    setSavedRequirementsText(incomingRequirementsText);
    setSelectedVariantSlug(project.requirementsTemplateVariantSlug ?? "");
  }, [project]);

  useEffect(() => {
    const firstVat = offerItems[0]?.vatRate ?? 22;
    setOfferVatRate(firstVat);
    if (offerItems.length > 0) {
      setGlobalDiscount(offerItems[0].discount ?? 0);
    } else {
      setGlobalDiscount(0);
    }
  }, [offerItems]);

  useEffect(() => {
    if (!project) return;
    const loadVariants = async () => {
      setVariantLoading(true);
      try {
        const variants = await fetchRequirementVariants((project.categories ?? [])[0]);
        setVariantOptions(variants);
        if (!selectedVariantSlug && variants.length > 0) {
          setSelectedVariantSlug(variants[0].variantSlug);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setVariantLoading(false);
      }
    };
    loadVariants();
  }, [project, selectedVariantSlug]);

  useEffect(() => {
    if (overrideStep === "invoice" && activeTab === "closing") {
      return;
    }
    if (overrideStep !== null) {
      setOverrideStep(null);
    }
  }, [activeTab, overrideStep]);

  useEffect(() => {
    if (!basePath) return;
    if (activeTab === "offers" && !activeOffer && !isOfferLoading) {
      fetchActiveOffer();
    }
  }, [activeTab, activeOffer, fetchActiveOffer, isOfferLoading]);

  const applyProjectUpdate = (updated: ProjectDetails | null) => {
    if (!updated) return;
    setProject((prev) => ({
      ...prev,
      ...updated,
      logistics: updated.logistics ?? prev.logistics ?? null,
    }));
    setOffers(updated.offers);
    setStatus(updated.status);
    const normalizedRequirements = updated.requirements ?? [];
    const normalizedRequirementsText = updated.requirementsText ?? "";
    setRequirements(normalizedRequirements);
    setSavedRequirements(normalizedRequirements);
    setRequirementsText(normalizedRequirementsText);
    setSavedRequirementsText(normalizedRequirementsText);
    setSelectedVariantSlug(updated.requirementsTemplateVariantSlug ?? "");
  };

  const saveRequirementsChanges = useCallback(async () => {
    if (!project || !basePath) return false;
    setIsSavingRequirements(true);
    try {
      const payload = {
        title: project.title,
        customer: project.customerDetail,
        status: project.status,
        requirements,
        requirementsText,
        categories: project.categories ?? [],
        templates,
      };
      const updated = await onProjectUpdate(basePath, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      applyProjectUpdate(updated as ProjectDetails | null);
      if (!updated) {
        setSavedRequirements(requirements);
        setSavedRequirementsText(requirementsText);
      }
      await refreshAfterMutation();
      return true;
    } catch (error) {
      console.error(error);
      toast.error("Napaka pri shranjevanju zahtev.");
      return false;
    } finally {
      setIsSavingRequirements(false);
    }
  }, [
    applyProjectUpdate,
    basePath,
    onProjectUpdate,
    project,
    refreshAfterMutation,
    requirements,
    requirementsText,
    templates,
  ]);

  const handleSaveRequirements = useCallback(async () => {
    if (!isRequirementsDirty || isSavingRequirements) return;
    await saveRequirementsChanges();
  }, [isRequirementsDirty, isSavingRequirements, saveRequirementsChanges]);

  const handleDeleteOfferItem = async (id: string) => {
    const next = offerItems.filter((item) => item.id !== id);
    const updated = await persistOfferItems(next);
    if (updated) {
      toast.success("Postavka ponudbe izbrisana");
    }
  };

  const buildOfferItem = ({
    id,
    name,
    sku,
    unit,
    description,
    quantity,
    price,
    discount,
    vatRate,
    productId,
  }: {
    id: string;
    name: string;
    sku?: string;
    unit: string;
    description?: string;
    quantity: number;
    price: number;
    discount: number;
    vatRate: number;
    productId?: string;
  }): ProjectOfferItem => {
    const net = quantity * price * (1 - discount / 100);
    const total = net * (1 + vatRate / 100);
    return {
      id,
      name,
      sku,
      unit,
      description,
      quantity,
      price,
      discount,
      vatRate,
      total: Number(total.toFixed(2)),
      productId,
    };
  };

  const parseNumericValue = (value?: string | number | null) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const normalized = value.replace(",", ".").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const findRequirementByTemplateId = (templateId?: string | null) => {
    if (!templateId) return null;
    return (requirements ?? []).find(
      (req) => req.templateRowId === templateId || req.id === templateId
    );
  };

  const handleOfferItemFieldChange = async (id: string, changes: Partial<ProjectOfferItem>) => {
    const next: ProjectOfferItem[] = offerItems.map((item) => {
      if (item.id !== id) return item;
      return buildOfferItem({
        id: item.id,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        description: item.description,
        quantity: changes.quantity ?? item.quantity,
        price: changes.price ?? item.price,
        discount: changes.discount ?? item.discount,
        vatRate: changes.vatRate ?? item.vatRate,
        productId: item.productId,
      });
    });
    await persistOfferItems(next);
  };

  const handleSubmitDraftOfferItem = async () => {
    if (!draftOfferItem.name || !draftOfferItem.quantity || !draftOfferItem.price) return;
    const newItem = buildOfferItem({
      id: `offer-item-${Date.now()}`,
      name: draftOfferItem.name ?? "",
      sku: draftOfferItem.sku ?? "",
      unit: draftOfferItem.unit ?? "kos",
      quantity: draftOfferItem.quantity ?? 1,
      price: draftOfferItem.price ?? 0,
      discount: draftOfferItem.discount ?? globalDiscount ?? 0,
      vatRate: draftOfferItem.vatRate ?? offerVatRate ?? 22,
      description: draftOfferItem.description ?? "",
      productId: draftOfferItem.productId,
    });
    await persistOfferItems([...(offerItems ?? []), newItem]);
    setDraftOfferItem({
      name: "",
      sku: "",
      unit: "kos",
      quantity: 1,
      price: 0,
      discount: globalDiscount ?? 0,
      vatRate: offerVatRate ?? 22,
      total: 0,
      description: "",
      productId: "",
    });
  };

  const hasAnyDiscount =
    globalDiscount > 0 || (offerItems ?? []).some((item) => Number(item.discount ?? 0) > 0);

  const handleOfferVatRateChange = async (value: number) => {
    setOfferVatRate(value);
    const updatedItems: ProjectOfferItem[] = (offerItems ?? []).map((item) =>
      buildOfferItem({ ...item, vatRate: value })
    );
    await persistOfferItems(updatedItems);
  };

  const handleGlobalDiscountChange = async (value: number) => {
    setGlobalDiscount(value);
    const updatedItems: ProjectOfferItem[] = (offerItems ?? []).map((item) =>
      buildOfferItem({ ...item, discount: value })
    );
    await persistOfferItems(updatedItems);
  };

  const addRequirementRow = () => {
    const defaultCategory = project?.categories?.[0] ?? "";
    setRequirements((prev) => [
      ...(prev ?? []),
      {
        id: crypto.randomUUID(),
        label: "",
        categorySlug: defaultCategory,
        notes: "",
        value: "",
        fieldType: "text",
      },
    ]);
  };

  const updateRequirementRow = (id: string, changes: Partial<RequirementRow>) => {
    setRequirements((prev) => (prev ?? []).map((row) => (row.id === id ? { ...row, ...changes } : row)));
  };

  const deleteRequirementRow = (id: string) => {
    setRequirements((prev) => (prev ?? []).filter((row) => row.id !== id));
  };

  const handleConfirmVariantSelection = async () => {
    const currentProject = project;
    if (!selectedVariantSlug || !currentProject) return;
    const payload = {
      title: currentProject.title,
      customer: currentProject.customerDetail,
      status: currentProject.status,
      categories: currentProject.categories ?? [],
      requirementsTemplateVariantSlug: selectedVariantSlug,
    };
    const updated = await onProjectUpdate(basePath, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    applyProjectUpdate(updated as ProjectDetails | null);
    await refreshAfterMutation();
  };

  useEffect(() => {
    const nextTab = initialTab ?? "items";
    setActiveTab(nextTab);
    hasInitializedActiveTabRef.current = initialTab ? true : false;
    prevActivePhaseStepRef.current = null;
  }, [project?.id, initialTab]);
  useEffect(() => {
    if (!activePhaseStepKey) {
      prevActivePhaseStepRef.current = null;
      return;
    }
    const targetTab = TAB_BY_STEP[activePhaseStepKey] ?? "items";
    if (!hasInitializedActiveTabRef.current) {
      setActiveTab(targetTab);
      hasInitializedActiveTabRef.current = true;
    } else {
      const previousKey = prevActivePhaseStepRef.current;
      if (previousKey) {
        const prevIndex = STEP_ORDER.indexOf(previousKey);
        const nextIndex = STEP_ORDER.indexOf(activePhaseStepKey);
        if (prevIndex !== -1 && nextIndex !== -1 && nextIndex > prevIndex) {
          setActiveTab(targetTab);
        }
      }
    }
    prevActivePhaseStepRef.current = activePhaseStepKey;
  }, [activePhaseStepKey]);

  const handleProceedToOffer = async () => {
    const currentProject = project;
    if (!currentProject) return;
    setIsProceedingToOffers(true);
    try {
      if (isRequirementsDirty) {
        const saved = await saveRequirementsChanges();
        if (!saved) {
          return;
        }
      }
      if (status === "draft" || (status as string) === "inquiry") {
        const updated = await onProjectUpdate(basePath, {
          method: "PUT",
          body: JSON.stringify({
            title: currentProject.title,
            customer: currentProject.customerDetail,
            status: "offered",
            categories: currentProject.categories ?? [],
          }),
        });
        applyProjectUpdate(updated as ProjectDetails | null);
        setStatus("offered");
        await refreshAfterMutation();
      }
      setActiveTab("offers");
    } finally {
      setIsProceedingToOffers(false);
    }
  };

  const handleCreateOffer = async () => {
    const updated = await onProjectUpdate(`${basePath}/offers`, { method: "POST" });
    applyProjectUpdate(updated);
    if (updated) {
      toast.success("Nova verzija ponudbe ustvarjena");
    }
  };

  const handleSendOffer = async (offerId: string) => {
    const updated = await onProjectUpdate(`${basePath}/offers/${offerId}/send`, { method: "POST" });
    applyProjectUpdate(updated);
    if (updated) toast.success("Ponudba poslana");
  };

  const handleConfirmOffer = async (offerId: string) => {
    const updated = await onProjectUpdate(`${basePath}/offers/${offerId}/confirm`, { method: "POST" });
    applyProjectUpdate(updated);
    if (updated) {
      toast.success("Ponudba potrjena! Ustvarjene naročilnice, delovni nalog in dobavnice.");
      setActiveTab("logistics");
      setOffersRefreshKey((key) => key + 1);
    }
  };

  const handleCancelConfirmation = async (offerId: string) => {
    const updated = await onProjectUpdate(`${basePath}/logistics/cancel-confirmation`, {
      method: "POST",
      body: JSON.stringify({ offerVersionId: offerId }),
    });
    applyProjectUpdate(updated);
    if (updated) {
      toast.info("Potrditev ponudbe preklicana");
      setOffersRefreshKey((key) => key + 1);
    }
  };

  const handleNavigateStep = (step: StepKey) => {
    if (!allowedStepKeys.has(step)) {
      return;
    }
    requestOfferNavigation(() => {
      if (step === "invoice") {
        setOverrideStep("invoice");
      } else {
        setOverrideStep(null);
      }
      const targetTab = TAB_BY_STEP[step] ?? "items";
      setActiveTab(targetTab);
      if (step === "invoice") {
        requestAnimationFrame(() => {
          invoiceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    });
  };

  const handleWorkOrderUpdated = useCallback(
    (updatedWorkOrder: LogisticsWorkOrder) => {
      setProject((prev) => {
        const previousLogistics = prev.logistics ?? null;
        const existingWorkOrders = previousLogistics?.workOrders ?? [];
        const hasOrder = existingWorkOrders.some((order) => order._id === updatedWorkOrder._id);
        const nextWorkOrders = hasOrder
          ? existingWorkOrders.map((order) => (order._id === updatedWorkOrder._id ? updatedWorkOrder : order))
          : [...existingWorkOrders, updatedWorkOrder];
        const nextLogistics: ProjectLogistics = {
          workOrders: nextWorkOrders,
          materialOrders: previousLogistics?.materialOrders ?? [],
          materialOrder: previousLogistics?.materialOrder ?? null,
          workOrder:
            previousLogistics?.workOrder && previousLogistics.workOrder._id === updatedWorkOrder._id
              ? updatedWorkOrder
              : previousLogistics?.workOrder ?? null,
          acceptedOfferId: previousLogistics?.acceptedOfferId,
          confirmedOfferVersionId: previousLogistics?.confirmedOfferVersionId,
          offerVersions: previousLogistics?.offerVersions,
        };
        return {
          ...prev,
          logistics: nextLogistics,
        };
      });
    },
    [setProject]
  );

  const handleWorkOrderDraftChange = useCallback(
    (draftWorkOrder: LogisticsWorkOrder) => {
      setProject((prev) => {
        const previousLogistics = prev.logistics ?? null;
        const existingWorkOrders = previousLogistics?.workOrders ?? [];
        const hasOrder = existingWorkOrders.some((order) => order._id === draftWorkOrder._id);
        const nextWorkOrders = hasOrder
          ? existingWorkOrders.map((order) => (order._id === draftWorkOrder._id ? draftWorkOrder : order))
          : [...existingWorkOrders, draftWorkOrder];
        const nextLogistics: ProjectLogistics = {
          workOrders: nextWorkOrders,
          materialOrders: previousLogistics?.materialOrders ?? [],
          materialOrder: previousLogistics?.materialOrder ?? null,
          workOrder:
            previousLogistics?.workOrder && previousLogistics.workOrder._id === draftWorkOrder._id
              ? draftWorkOrder
              : previousLogistics?.workOrder ?? null,
          acceptedOfferId: previousLogistics?.acceptedOfferId,
          confirmedOfferVersionId: previousLogistics?.confirmedOfferVersionId,
          offerVersions: previousLogistics?.offerVersions,
        };
        return {
          ...prev,
          logistics: nextLogistics,
        };
      });
    },
    [setProject]
  );

  const handleMarkOfferAsSelected = async (offerId: string) => {
    const updated = await onProjectUpdate(`${basePath}/offers/${offerId}/select`, { method: "POST" });
    applyProjectUpdate(updated);
    if (updated) toast.success("Ponudba označena kot izbrana");
  };

  const handleGeneratePDF = (offerId: string) => {
    const currentProject = project;
    if (!currentProject) return;
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;

    const defaultTemplate = templates.find((t) => t.isDefault && t.category === "offer");
    if (!defaultTemplate) {
      toast.error("Ni nastavljene privzete predloge za ponudbe");
      return;
    }

    const templateCustomer = {
      name: currentProject.customerDetail?.name ?? "",
      taxId: currentProject.customerDetail?.taxId ?? "",
      address: currentProject.customerDetail?.address ?? "",
      paymentTerms: currentProject.customerDetail?.paymentTerms ?? "",
    };

    const html = renderTemplate(defaultTemplate, {
      customer: templateCustomer,
        project: {
          id: currentProject.id,
          title: currentProject.title,
          description: requirementsText,
        },
      offer,
      items,
    });

    openPreview(html);
    toast.success("Predogled ponudbe odprt v novem zavihku");
  };

  const handleDownloadPDF = (offerId: string) => {
    const currentProject = project;
    if (!currentProject) return;
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;

    const defaultTemplate = templates.find((t) => t.isDefault && t.category === "offer");
    if (!defaultTemplate) {
      toast.error("Ni nastavljene privzete predloge za ponudbe");
      return;
    }

    const templateCustomer = {
      name: currentProject.customerDetail?.name ?? "",
      taxId: currentProject.customerDetail?.taxId ?? "",
      address: currentProject.customerDetail?.address ?? "",
      paymentTerms: currentProject.customerDetail?.paymentTerms ?? "",
    };

    const html = renderTemplate(defaultTemplate, {
      customer: templateCustomer,
        project: {
          id: currentProject.id,
          title: currentProject.title,
          description: requirementsText,
        },
      offer,
      items,
    });

    downloadHTML(html, `Ponudba-${currentProject.id}-v${offer.version}.html`);
    toast.success("Ponudba prenesena kot HTML");
  };

  const handleSaveSignature = async (
    signature: string,
    signerName: string,
    workOrderId?: string,
    customerRemark?: string,
  ) => {
    const updated = await onProjectUpdate(`${basePath}/signature`, {
      method: "POST",
      body: JSON.stringify({
        signerName,
        signature,
        workOrderId: workOrderId ?? null,
        customerRemark: customerRemark ?? null,
      }),
    });
    applyProjectUpdate(updated);
    if (!updated) return;
    await refresh();
    if (!workOrderId) {
      setOverrideStep("invoice");
      setActiveTab("closing");
    }
    toast.success(`Podpis shranjen: ${signerName}`);
  };

  const renderContent = () => {
    const handleHeaderPrimaryAction = () => {
      if (activeTab === "offers" && offerSaveHandlerRef.current) {
        void offerSaveHandlerRef.current();
        return;
      }
      if (activeTab === "logistics" && logisticsSaveHandlerRef.current) {
        void logisticsSaveHandlerRef.current();
        return;
      }
      if (activeTab === "execution" && executionSaveHandlerRef.current) {
        void executionSaveHandlerRef.current();
        return;
      }
      void refresh();
    };

    const handleNewProjectWithGuard = () => requestOfferNavigation(onNewProject);
    const handleTabChangeWithGuard = (next: WorkspaceTabValue) => {
      if (!allowedTabValues.includes(next)) {
        return;
      }
      requestOfferNavigation(() => {
        setActiveTab(next);
      });
    };

    if (loading) {
      return (
        <div className="min-h-screen bg-background p-6" style={workspaceCssVars}>
          Nalaganje...
        </div>
      );
    }

    if (error) {
      return (
        <div className="min-h-screen bg-background p-6" style={workspaceCssVars}>
          <p className="text-destructive">Napaka pri nalaganju projekta.</p>
        </div>
      );
    }

    if (!project) {
      return (
        <div className="min-h-screen bg-background p-6" style={workspaceCssVars}>
          <p className="text-muted-foreground">Projekt ni na voljo.</p>
        </div>
      );
    }

    return (
      <>
      <div className="projects-workspace-shell min-h-screen bg-background" style={workspaceCssVars}>
        <ProjectHeader
          project={project}
          status={status}
          onBack={handleBackWithGuard}
          onPrimaryAction={handleHeaderPrimaryAction}
          onNewProject={handleNewProjectWithGuard}
          primaryActionLabel={activeTab === "offers" || activeTab === "logistics" || activeTab === "execution" ? "Shrani" : "Osveži"}
        />
        <div className="max-w-[1280px] mx-auto px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
          <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:hidden">
            ID: {projectDisplayId || project.id}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
            <div className="space-y-4 lg:col-span-3">
              <Card className="p-4">
                <h3 className="mb-3">Stranka</h3>
                <div className="space-y-2 text-sm">
                  {project.customerDetail.taxId?.trim() ? <div>{project.customerDetail.taxId.trim()}</div> : null}
                  {project.customerDetail.name?.trim() ? <div>{project.customerDetail.name.trim()}</div> : null}
                  {infoCardAddress?.trim() ? <div>{infoCardAddress.trim()}</div> : null}
                  {infoCardEmail?.trim() ? <div>{infoCardEmail.trim()}</div> : null}
                  {infoCardPhone?.trim() ? <div>{infoCardPhone.trim()}</div> : null}
                  {project.customerDetail.paymentTerms?.trim() ? <div>{project.customerDetail.paymentTerms.trim()}</div> : null}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="mb-3">Zahteve</h3>
                <p className="text-sm text-muted-foreground">{requirementsText}</p>
              </Card>

              <Card className="hidden p-4 lg:block">
                <h4 className="mb-3 text-sm">Hitra navigacija</h4>
                <ProjectQuickNav
                  project={project}
                  steps={visibleTimelineSteps}
                  activeStep={activeQuickStep}
                  onSelectStep={handleNavigateStep}
                />
              </Card>

              <div className="hidden lg:block">
                <CommunicationPanel
                  projectId={project.id}
                  refreshKey={communicationRefreshKey}
                />
              </div>
            </div>

            <div className="min-w-0 lg:col-span-9">
              <Tabs
                value={activeTab}
                onValueChange={(value) => {
                  const next = (value as WorkspaceTabValue) ?? (allowedTabValues[0] ?? "items");
                  handleTabChangeWithGuard(next);
                }}
                className="space-y-6"
              >
                <PhaseRibbon steps={phaseRibbonSteps} activeKey={activeTab} variant="tabs" />

                {allowedTabValues.includes("items") ? (
                <TabsContent value="items" className="mt-0 space-y-4">
                  <RequirementsPanel
                    project={project}
                    showVariantWizard={showVariantWizard}
                    selectedVariantSlug={selectedVariantSlug}
                    setSelectedVariantSlug={setSelectedVariantSlug}
                    variantOptions={variantOptions}
                    variantLoading={variantLoading}
                    onConfirmVariantSelection={handleConfirmVariantSelection}
                    requirementsText={requirementsText}
                    setRequirementsText={setRequirementsText}
                    requirements={requirements}
                    updateRequirementRow={updateRequirementRow}
                    deleteRequirementRow={deleteRequirementRow}
                    addRequirementRow={addRequirementRow}
                    onSaveRequirements={handleSaveRequirements}
                    canSaveRequirements={isRequirementsDirty}
                    savingRequirements={isSavingRequirements}
                    proceedingToOffer={isProceedingToOffers}
                    handleProceedToOffer={handleProceedToOffer}
                  />
                </TabsContent>
                ) : null}

                {allowedTabValues.includes("offers") ? (
                <TabsContent value="offers" className="mt-0 space-y-4">
                  {activeTab === "offers" ? (
                    <OffersPanel
                      project={project}
                      refreshKey={offersRefreshKey}
                      onDirtyChange={setIsOfferEditorDirty}
                      onRegisterSaveHandler={registerOfferSaveHandler}
                      onCommunicationChanged={() => setCommunicationRefreshKey((value) => value + 1)}
                    />
                  ) : null}
                </TabsContent>
                ) : null}

                {allowedTabValues.includes("logistics") ? (
                <TabsContent value="logistics" className="mt-0 space-y-6">
                  <LogisticsPanel
                    projectId={project.id}
                    client={displayedClient}
                    onRegisterSaveHandler={registerLogisticsSaveHandler}
                  />
                </TabsContent>
                ) : null}

                {allowedTabValues.includes("execution") ? (
                <TabsContent value="execution" className="mt-0 space-y-6">
                  <ExecutionPanel
                    projectId={project.id}
                    projectDisplayId={projectDisplayId || project.id}
                    logistics={project.logistics}
                    onSaveSignature={handleSaveSignature}
                    onWorkOrderUpdated={handleWorkOrderUpdated}
                    onWorkOrderDraftChange={handleWorkOrderDraftChange}
                    onRegisterSaveHandler={registerExecutionSaveHandler}
                  />
                </TabsContent>
                ) : null}

                {allowedTabValues.includes("closing") ? (
                <TabsContent value="closing" className="mt-0 space-y-4">
                  <div ref={invoiceSectionRef}>
                    <ClosingPanel logistics={project?.logistics} />
                  </div>
                </TabsContent>
                ) : null}
              </Tabs>
            </div>
          </div>
        </div>
      </div>
      <Dialog open={isUnsavedOfferDialogOpen} onOpenChange={(open) => {
        if (!open) {
          closeUnsavedOfferDialog();
        }
      }}>
        <DialogContent className="sm:max-w-md" hideCloseButton>
          <DialogHeader>
            <DialogTitle>Imaš neshranjene spremembe</DialogTitle>
            <DialogDescription>
              Kaj želiš narediti s trenutnimi spremembami ponudbe?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeUnsavedOfferDialog}>
              Prekliči
            </Button>
            <Button variant="secondary" onClick={() => void handleDiscardDirtyOfferAndContinue()}>
              Zavrzi
            </Button>
            <Button onClick={() => void handleSaveDirtyOfferAndContinue()}>
              Shrani spremembe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    );
  };

  return renderContent();
}

