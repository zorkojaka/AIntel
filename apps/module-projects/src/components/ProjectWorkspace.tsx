import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Card } from "./ui/card";
import { OfferVersion } from "../domains/offers/OfferVersionCard";
import type { WorkOrder as LogisticsWorkOrder } from "@aintel/shared/types/logistics";
import type { ProjectLogistics } from "@aintel/shared/types/projects/Logistics";
import { Template } from "./TemplateEditor";
import { renderTemplate, openPreview, downloadHTML } from "../domains/offers/TemplateRenderer";
import { toast } from "sonner";
import { ProjectDetails, ProjectOffer, ProjectOfferItem, OfferCandidate } from "../types";
import { fetchOfferCandidates, fetchProductsByCategories, fetchRequirementVariants, type ProductLookup } from "../api";
import type { ProjectRequirement } from "@aintel/shared/types/project";
import { LogisticsPanel } from "../domains/logistics/LogisticsPanel";
import { useProject } from "../domains/core/useProject";
import { ProjectHeader } from "../domains/core/ProjectHeader";
import { ProjectQuickNav } from "../domains/core/ProjectQuickNav";
import { useProjectTimeline, type StepKey, type StepStatus, type TimelineStep } from "../domains/core/useProjectTimeline";
import { useProjectMutationRefresh } from "../domains/core/useProjectMutationRefresh";

const TAB_PHASE_STYLES: Record<"done" | "active" | "future", { container: string; label: string; iconColor: string }> = {
  done: {
    container: "bg-emerald-500 text-white hover:bg-emerald-500 data-[state=active]:bg-emerald-500",
    label: "text-white",
    iconColor: "text-white/80",
  },
  active: {
    container:
      "bg-amber-500 text-white shadow-sm data-[state=active]:bg-amber-500 hover:bg-amber-500 focus-visible:ring-2 focus-visible:ring-amber-400",
    label: "text-white",
    iconColor: "text-white/80",
  },
  future: {
    container:
      "bg-background text-muted-foreground border border-muted/60 hover:bg-muted/40 data-[state=active]:bg-muted/40",
    label: "text-muted-foreground",
    iconColor: "text-muted-foreground",
  },
};
const ARROW_CUT_PX = 12;
const ARROW_OVERLAP_PX = 12;
const ARROW_RIGHT_PADDING_PX = 16;
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

const buildArrowClipPath = (isLast: boolean) =>
  isLast
    ? "polygon(0 0, 100% 0, 100% 100%, 0 100%)"
    : `polygon(0 0, calc(100% - ${ARROW_CUT_PX}px) 0, 100% 50%, calc(100% - ${ARROW_CUT_PX}px) 100%, 0 100%)`;
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

interface ProjectWorkspaceProps {
  projectId: string;
  initialProject?: ProjectDetails | null;
  templates: Template[];
  onBack: () => void;
  onProjectUpdate: (path: string, options?: RequestInit) => Promise<ProjectDetails | null>;
  brandColor?: string | null;
}

export function ProjectWorkspace({
  projectId,
  initialProject,
  templates,
  onBack,
  onProjectUpdate,
  brandColor,
}: ProjectWorkspaceProps) {
  const { project, loading, error, refresh, setProject } = useProject(projectId, initialProject ?? null);
  const [activeTab, setActiveTab] = useState<WorkspaceTabValue>("items");
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
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isGeneratingOffer, setIsGeneratingOffer] = useState(false);
  const [offerCandidates, setOfferCandidates] = useState<OfferCandidate[]>([]);
  const [candidateSelections, setCandidateSelections] = useState<Record<string, { productId?: string; quantity: number; include: boolean }>>({});
  const [candidateProducts, setCandidateProducts] = useState<Record<string, ProductLookup[]>>({});
  const [variantOptions, setVariantOptions] = useState<{ variantSlug: string; label: string }[]>([]);
  const [variantLoading, setVariantLoading] = useState(false);
  const [selectedVariantSlug, setSelectedVariantSlug] = useState<string>(project?.requirementsTemplateVariantSlug ?? "");
  const showVariantWizard = variantOptions.length > 0 && !project?.requirementsTemplateVariantSlug;
  const [offersRefreshKey, setOffersRefreshKey] = useState(0);
  const invoiceSectionRef = useRef<HTMLDivElement | null>(null);
  const timelineSteps = useProjectTimeline(project);
  const tabsConfig: { value: WorkspaceTabValue; label: string }[] = [
    { value: "items", label: "Zahteve" },
    { value: "offers", label: "Ponudbe" },
    { value: "logistics", label: "Priprava" },
    { value: "execution", label: "Izvedba" },
    { value: "closing", label: "Račun" },
  ];
  const timelineStepByKey = useMemo(() => {
    const map = {} as Partial<Record<StepKey, TimelineStep>>;
    timelineSteps.forEach((step) => {
      map[step.key] = step;
    });
    return map;
  }, [timelineSteps]);
  const activeQuickStep: StepKey = overrideStep ?? STEP_BY_TAB[activeTab] ?? "requirements";
  const activePhaseStepKey = useMemo<StepKey | null>(() => {
    const activeStep = timelineSteps.find((step) => step.status === "inProgress");
    return activeStep?.key ?? null;
  }, [timelineSteps]);
  const hasInitializedActiveTabRef = useRef(false);
  const prevActivePhaseStepRef = useRef<StepKey | null>(null);

  const basePath = project ? `/api/projects/${project.id}` : "";
  const isExecutionPhase = status === "ordered" || status === "in-progress" || status === "completed";
  const inlineClient = project ? ((project as ProjectDetails & { client?: ProjectCrmClient }).client ?? null) : null;
  const [remoteClient, setRemoteClient] = useState<ProjectCrmClient | null>(null);
  const crmClient = inlineClient ?? remoteClient;
  const displayedClient: ProjectCrmClient = crmClient ?? project?.customerDetail ?? {};
  const infoCardAddress =
    formatClientAddress(displayedClient) || project?.customerDetail.address || "-";
  const infoCardEmail = crmClient?.email ?? project?.customerDetail.email ?? "-";
  const infoCardPhone = crmClient?.phone ?? project?.customerDetail.phone ?? "-";
  const refreshAfterMutation = useProjectMutationRefresh(project?.id ?? projectId);
  const brandAccentColor = useMemo(() => {
    const trimmed = brandColor?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : "#22c55e";
  }, [brandColor]);
  const workspaceCssVars = useMemo<WorkspaceCSSVars>(() => ({ "--brand-color": brandAccentColor }), [brandAccentColor]);
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

  const validationIssues: string[] = [];
  if (!project?.customerDetail?.name) validationIssues.push("Manjka podatek o stranki");
  const projectItems = Array.isArray(project?.items) ? project.items : [];
  const projectItemsCount = projectItems.length;
  if (projectItemsCount === 0) validationIssues.push("Dodajte vsaj eno postavko");

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

  const handleGenerateOfferFromRequirements = async () => {
    const currentProject = project;
    if (!currentProject) return;
    setIsGeneratingOffer(true);
    try {
      const candidatesResponse = await fetchOfferCandidates(currentProject.id);
      if (!candidatesResponse.length) {
        toast.error("Ni predlaganih postavk iz zahtev.");
        setOfferCandidates([]);
        return;
      }
      const categories = Array.from(
        new Set(candidatesResponse.map((c) => c.productCategorySlug).filter(Boolean))
      );
      const products = await fetchProductsByCategories(categories);
      const grouped: Record<string, ProductLookup[]> = {};
      products.forEach((product) => {
        (product.categorySlugs ?? []).forEach((slug) => {
          if (!grouped[slug]) grouped[slug] = [];
          grouped[slug].push(product);
        });
      });

      const selections: Record<
        string,
        { productId?: string; quantity: number; include: boolean }
      > = {};
      candidatesResponse.forEach((c) => {
        const productsForCategory = grouped[c.productCategorySlug] ?? products;
        const defaultProductId = c.suggestedProductId ?? productsForCategory[0]?.id;
        selections[c.ruleId] = {
          productId: defaultProductId,
          quantity: c.quantity ?? 1,
          include: true,
        };
      });

      setCandidateProducts(grouped);
      setOfferCandidates(candidatesResponse);
      setCandidateSelections(selections);
      setIsGenerateModalOpen(true);
    } catch (error) {
      console.error(error);
      toast.error("Napaka pri generiranju ponudbe iz zahtev.");
    } finally {
      setIsGeneratingOffer(false);
    }
  };

  const handleConfirmOfferFromRequirements = async () => {
    const selectedCandidates = offerCandidates.filter((c) => candidateSelections[c.ruleId]?.include);
    if (!selectedCandidates.length) {
      setIsGenerateModalOpen(false);
      return;
    }
    const newItems: ProjectOfferItem[] = [...(offerItems ?? [])];
    selectedCandidates.forEach((candidate) => {
      const selection = candidateSelections[candidate.ruleId];
      if (!selection) return;
      const productList =
        candidateProducts[candidate.productCategorySlug] ?? [];
      const product = productList.find((p) => p.id === selection.productId) ?? productList[0];
      if (!product) return;
      const quantityParsed = Number(selection.quantity);
      const quantity = Number.isFinite(quantityParsed) && quantityParsed > 0 ? quantityParsed : candidate.quantity ?? 1;
      const price = product.price ?? 0;
      const vatRate = typeof product.vatRate === "number" ? product.vatRate : 22;
      newItems.push(
        buildOfferItem({
          id: `offer-item-${Date.now()}-${candidate.ruleId}`,
          name: product.name ?? candidate.suggestedName,
          sku: product.sku ?? product.id,
          unit: product.unit ?? "kos",
          description: "",
          quantity,
          price,
          discount: 0,
          vatRate,
          productId: product.id,
        })
      );
    });
    await persistOfferItems(newItems);
    setIsGenerateModalOpen(false);
  };

  const toggleCandidateSelection = (ruleId: string, include: boolean) => {
    setCandidateSelections((prev) => ({
      ...prev,
      [ruleId]: { ...(prev[ruleId] ?? { quantity: 1 }), include },
    }));
  };
  useEffect(() => {
    setActiveTab("items");
    hasInitializedActiveTabRef.current = false;
    prevActivePhaseStepRef.current = null;
  }, [project?.id]);
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
      await handleGenerateOfferFromRequirements();
      setIsGenerateModalOpen(true);
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
  };

  const handleWorkOrderUpdated = useCallback(
    async (updatedWorkOrder: LogisticsWorkOrder) => {
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
      await refresh();
    },
    [setProject, refresh]
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

  const handleSaveSignature = async (signature: string, signerName: string) => {
    const updated = await onProjectUpdate(`${basePath}/signature`, {
      method: "POST",
      body: JSON.stringify({ signerName, signature }),
    });
    applyProjectUpdate(updated);
    if (updated) toast.success(`Podpis shranjen: ${signerName}`);
  };

  const handleStatusChange = async (value: string) => {
    setStatus(value as any);
    const updated = await onProjectUpdate(`${basePath}/status`, {
      method: "POST",
      body: JSON.stringify({ status: value }),
    });
    applyProjectUpdate(updated);
  };

  const renderContent = () => {
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
      <div className="min-h-screen bg-background" style={workspaceCssVars}>
        <ProjectHeader
          project={project}
          status={status}
          onStatusChange={handleStatusChange}
          onBack={onBack}
          onRefresh={refresh}
        />
        <div className="max-w-[1280px] mx-auto px-6 py-6">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-3 space-y-4">
              <Card className="p-4">
                <h3 className="mb-3">Stranka</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-muted-foreground">Naziv</div>
                    <div>{project.customerDetail.name}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">ID za DDV</div>
                    <div>{project.customerDetail.taxId}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Naslov</div>
                    <div>{infoCardAddress}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Plačilni pogoji</div>
                    <div>{project.customerDetail.paymentTerms}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Email</div>
                    <div>{infoCardEmail}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Telefon</div>
                    <div>{infoCardPhone}</div>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="mb-3">Zahteve</h3>
                <p className="text-sm text-muted-foreground">{requirementsText}</p>
              </Card>

                            <Card className="p-4">
                <h4 className="mb-3 text-sm">Hitra navigacija</h4>
                <ProjectQuickNav
                  project={project}
                  steps={timelineSteps}
                  activeStep={activeQuickStep}
                  onSelectStep={handleNavigateStep}
                />
              </Card>
            </div>

            <div className="col-span-9">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab((value as WorkspaceTabValue) ?? "items")}
                className="space-y-6"
              >
                <TabsList className="flex w-full overflow-hidden bg-muted/10 p-0">
                  {tabsConfig.map((tab, index, tabsArr) => {
                    const stepKey = STEP_BY_TAB[tab.value];
                    const stepStatus: StepStatus = stepKey ? timelineStepByKey[stepKey]?.status ?? "pending" : "pending";
                    const phase = stepStatus === "done" ? "done" : stepStatus === "inProgress" ? "active" : "future";
                    const styles = TAB_PHASE_STYLES[phase];
                    const icon = phase === "done" ? "✓" : phase === "active" ? "•" : "";
                    const isLast = index === tabsArr.length - 1;
                    const clipPath = buildArrowClipPath(isLast);
                    const roundedClass =
                      index === 0 ? "rounded-l-md" : isLast ? "rounded-r-md" : "";
                    const isActiveTab = activeTab === tab.value;
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        style={{
                          clipPath,
                          marginInlineStart: index === 0 ? 0 : -ARROW_OVERLAP_PX,
                          zIndex: tabsArr.length - index,
                          paddingRight: `${ARROW_RIGHT_PADDING_PX}px`,
                          boxShadow: isActiveTab
                            ? "inset 0 4px 0 0 var(--brand-color), inset 0 -2px 0 0 var(--brand-color)"
                            : undefined,
                          borderWidth: isActiveTab ? 0 : undefined,
                          borderStyle: isActiveTab ? "none" : undefined,
                        }}
                        className={`relative flex flex-1 items-center gap-2 pl-5 py-3 text-sm font-semibold uppercase tracking-wide transition overflow-hidden ${roundedClass} ${styles.container}`}
                      >
                        <span className={`inline-flex items-center gap-1 ${styles.label} relative z-10`}>
                          {tab.label}
                          {icon && (
                            <span className={`text-xs opacity-70 ${styles.iconColor}`} aria-hidden>
                              {icon}
                            </span>
                          )}
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                <TabsContent value="items" className="mt-0 space-y-4">
                  <RequirementsPanel
                    project={project}
                    validationIssues={validationIssues}
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
                    isGenerateModalOpen={isGenerateModalOpen}
                    setIsGenerateModalOpen={setIsGenerateModalOpen}
                    offerCandidates={offerCandidates}
                    candidateSelections={candidateSelections}
                    candidateProducts={candidateProducts}
                    toggleCandidateSelection={toggleCandidateSelection}
                    setCandidateSelections={setCandidateSelections}
                    handleConfirmOfferFromRequirements={handleConfirmOfferFromRequirements}
                  />
                </TabsContent>

                <TabsContent value="offers" className="mt-0 space-y-4">
                  <OffersPanel project={project} refreshKey={offersRefreshKey} />
                </TabsContent>

                <TabsContent value="logistics" className="mt-0 space-y-6">
                  <LogisticsPanel projectId={project.id} client={displayedClient} />
                </TabsContent>

                <TabsContent value="execution" className="mt-0 space-y-6">
                  <ExecutionPanel
                    projectId={project.id}
                    logistics={project.logistics}
                    onSaveSignature={handleSaveSignature}
                    onWorkOrderUpdated={handleWorkOrderUpdated}
                  />
                </TabsContent>

                <TabsContent value="closing" className="mt-0 space-y-4">
                  <div ref={invoiceSectionRef}>
                    <ClosingPanel logistics={project?.logistics} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return renderContent();
}
