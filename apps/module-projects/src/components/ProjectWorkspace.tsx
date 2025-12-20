import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Card } from "./ui/card";
import type { Item } from "../domains/requirements/ItemsTable";
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
import {
  RequirementsPanel,
  ItemFormState,
  RequirementRow,
  CatalogProduct,
  CatalogTarget,
} from "../domains/requirements/RequirementsPanel";
import { OffersPanel } from "../domains/offers/OffersPanel";
import { ExecutionPanel } from "../domains/execution/ExecutionPanel";
import { ClosingPanel } from "../domains/closing/ClosingPanel";

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
}

export function ProjectWorkspace({
  projectId,
  initialProject,
  templates,
  onBack,
  onProjectUpdate,
}: ProjectWorkspaceProps) {
  const { project, loading, error, refresh, setProject } = useProject(projectId, initialProject ?? null);
  const [activeTab, setActiveTab] = useState("items");
  const [overrideStep, setOverrideStep] = useState<StepKey | null>(null);
  const [items, setItems] = useState<Item[]>(project?.items ?? []);
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
  const [isItemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [itemContext, setItemContext] = useState<"project" | "offer">("project");
  const [itemForm, setItemForm] = useState<ItemFormState>({
    name: "",
    sku: "",
    unit: "kos",
    quantity: 1,
    price: 0,
    discount: 0,
    vatRate: 22,
    description: "",
    category: "material",
  });
  const [isCatalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<CatalogProduct | null>(null);
  const [catalogQuantity, setCatalogQuantity] = useState(1);
  const [catalogDiscount, setCatalogDiscount] = useState(0);
  const [catalogVatRate, setCatalogVatRate] = useState(22);
  const [catalogUnit, setCatalogUnit] = useState("kos");
  const [catalogTarget, setCatalogTarget] = useState<CatalogTarget>("project");
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isAddingFromCatalog, setIsAddingFromCatalog] = useState(false);
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
  const stepByTab: Record<string, StepKey> = {
    items: "requirements",
    offers: "offers",
    logistics: "logistics",
    execution: "execution",
    closing: "invoice",
  };
  const tabByStep: Record<StepKey, string> = {
    requirements: "items",
    offers: "offers",
    logistics: "logistics",
    execution: "execution",
    invoice: "closing",
  };
  const timelineSteps = useProjectTimeline(project);
  const timelineStepByKey = useMemo(() => {
    const map = {} as Partial<Record<StepKey, TimelineStep>>;
    timelineSteps.forEach((step) => {
      map[step.key] = step;
    });
    return map;
  }, [timelineSteps]);
  const activeQuickStep: StepKey = overrideStep ?? stepByTab[activeTab] ?? "requirements";

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
    if (!project) return;
    setItems(project.items);
    setOffers(project.offers);
    setActiveOffer(null);
    setOfferItems([]);
    setStatus(project.status);
    setRequirements(Array.isArray(project.requirements) ? project.requirements : []);
    setRequirementsText(project.requirementsText ?? "");
    setSelectedVariantSlug(project.requirementsTemplateVariantSlug ?? "");
  }, [project]);

  useEffect(() => {
    const currentProject = project;
    if (!currentProject) {
      setRequirements([]);
      return;
    }
    setRequirements(Array.isArray(currentProject.requirements) ? currentProject.requirements : []);
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

  const fetchCatalogItems = useCallback(async () => {
    if (!project) return;
    setCatalogLoading(true);
    try {
      const slugParam = project.categories?.filter(Boolean).join(",");
      const query = slugParam ? `?suggestForCategories=${encodeURIComponent(slugParam)}` : "";
      const response = await fetch(`/api/cenik/products${query}`);
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error ?? "Napaka pri nalaganju cenika");
      }
      const mapped: CatalogProduct[] = (payload.data ?? []).map((product: any) => ({
        id: product._id ?? product.id,
        name: product.ime ?? product.name ?? "Neimenovan produkt",
        category: product.kategorija,
        price: Number(product.prodajnaCena ?? 0),
        description: product.kratekOpis ?? product.dolgOpis ?? "",
        supplier: product.dobavitelj ?? "",
      }));
      setCatalogItems(mapped);
    } catch (error) {
      console.error(error);
      toast.error("Cenika ni mogoče naložiti. Poskusite znova.");
    } finally {
      setCatalogLoading(false);
    }
  }, [project]);

  useEffect(() => {
    if (!isCatalogDialogOpen) return;
    if (catalogItems.length > 0 || catalogLoading) return;
    fetchCatalogItems();
  }, [isCatalogDialogOpen, catalogItems.length, catalogLoading, fetchCatalogItems]);

  const filteredCatalog = useMemo(() => {
    const term = catalogSearch.trim().toLowerCase();
    if (!term) return catalogItems;
    return catalogItems.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        (product.category ? product.category.toLowerCase().includes(term) : false)
    );
  }, [catalogItems, catalogSearch]);

  const applyProjectUpdate = (updated: ProjectDetails | null) => {
    if (!updated) return;
    setProject((prev) => ({
      ...prev,
      ...updated,
      logistics: updated.logistics ?? prev.logistics ?? null,
    }));
    setItems(updated.items);
    setOffers(updated.offers);
    setStatus(updated.status);
    setRequirements(updated.requirements ?? []);
    setRequirementsText(updated.requirementsText ?? "");
    setSelectedVariantSlug(updated.requirementsTemplateVariantSlug ?? "");
  };

  const validationIssues: string[] = [];
  if (!project?.customerDetail?.name) validationIssues.push("Manjka podatek o stranki");
  if (items.length === 0) validationIssues.push("Dodajte vsaj eno postavko");

  const resetItemForm = () => {
    setItemForm({
      name: "",
      sku: "",
      unit: "kos",
      quantity: 1,
      price: 0,
      discount: 0,
      vatRate: 22,
      description: "",
      category: "material",
    });
    setEditingItem(null);
  };

  const handleAddItem = () => {
    resetItemForm();
    setItemContext("project");
    setItemDialogOpen(true);
  };

  

  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      quantity: item.quantity,
      price: item.price,
      discount: item.discount,
      vatRate: item.vatRate,
      description: item.description ?? "",
      category: item.category ?? "material",
    });
    setItemContext("project");
    setItemDialogOpen(true);
  };

  

  const handleDeleteItem = async (id: string) => {
    const updated = await onProjectUpdate(`${basePath}/items/${id}`, { method: "DELETE" });
    applyProjectUpdate(updated);
    if (updated) toast.success("Postavka izbrisana");
  };

  const handleDeleteOfferItem = async (id: string) => {
    const next = offerItems.filter((item) => item.id !== id);
    const updated = await persistOfferItems(next);
    if (updated) {
      toast.success("Postavka ponudbe izbrisana");
    }
  };

  const handleSaveItem = async () => {
    // Modal-based add/edit ni v uporabi za offer kontekst; ohranimo le project branch
    setIsSavingItem(true);
    const payload = {
      ...itemForm,
      quantity: Number(itemForm.quantity),
      price: Number(itemForm.price),
      discount: Number(itemForm.discount),
      vatRate: Number(itemForm.vatRate),
    };
    const url = editingItem && itemContext === "project" ? `${basePath}/items/${editingItem.id}` : `${basePath}/items`;
    const method = editingItem && itemContext === "project" ? "PUT" : "POST";
    const updated = await onProjectUpdate(url, {
      method,
      body: JSON.stringify(payload),
    });
    setIsSavingItem(false);
    applyProjectUpdate(updated as ProjectDetails | null);
    if (updated) {
      toast.success(editingItem ? "Postavka posodobljena" : "Postavka dodana");
      setItemDialogOpen(false);
      resetItemForm();
    }
  };

  const openCatalog = (target: CatalogTarget) => {
    setCatalogTarget(target);
    setCatalogDialogOpen(true);
    setSelectedCatalogProduct(null);
    setCatalogQuantity(1);
    setCatalogDiscount(0);
    setCatalogVatRate(22);
    setCatalogUnit("kos");
  };

  const handleAddFromCatalog = async () => {
    if (!selectedCatalogProduct) {
      toast.error("Izberite produkt iz cenika.");
      return;
    }
    console.debug("catalogTarget on confirm:", catalogTarget);
    setIsAddingFromCatalog(true);
    let updated: ProjectDetails | ProjectOffer | null = null;

    if (catalogTarget === "project") {
      const newProjectItem: Item = {
        id: `item-${Date.now()}`,
        name: selectedCatalogProduct.name,
        sku: selectedCatalogProduct.id,
        unit: catalogUnit,
        quantity: catalogQuantity,
        price: selectedCatalogProduct.price,
        discount: catalogDiscount,
        vatRate: catalogVatRate,
        total:
          catalogQuantity *
          selectedCatalogProduct.price *
          (1 - catalogDiscount / 100) *
          (1 + catalogVatRate / 100),
        description: selectedCatalogProduct.description ?? "",
        category: "material",
      };

      updated = await onProjectUpdate(`${basePath}/items`, {
        method: "POST",
        body: JSON.stringify(newProjectItem),
      });
    } else {
      if (!activeOffer) {
        setIsAddingFromCatalog(false);
        toast.error("Ponudba ni naložena.");
        return;
      }
      const newOfferItem = buildOfferItem({
        id: `offer-item-${Date.now()}`,
        productId: selectedCatalogProduct.id,
        name: selectedCatalogProduct.name,
        sku: selectedCatalogProduct.id,
        unit: catalogUnit,
        quantity: catalogQuantity,
        price: selectedCatalogProduct.price,
        discount: catalogDiscount,
        vatRate: catalogVatRate,
        description: selectedCatalogProduct.description ?? "",
      });
      updated = await persistOfferItems([...(offerItems ?? []), newOfferItem]);
    }

    setIsAddingFromCatalog(false);
    if (catalogTarget === "project") {
      applyProjectUpdate(updated as ProjectDetails | null);
      if (updated) {
        toast.success(`Dodana projektna postavka ${selectedCatalogProduct.name}`);
        setCatalogDialogOpen(false);
        setSelectedCatalogProduct(null);
      }
    } else if (updated && "label" in updated) {
      toast.success(`Dodana postavka v ponudbo: ${selectedCatalogProduct.name}`);
      setCatalogDialogOpen(false);
      setSelectedCatalogProduct(null);
      setActiveOffer(updated as ProjectOffer);
      setOfferItems((updated as ProjectOffer).items ?? []);
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

  const handleProjectItemFieldChange = async (id: string, changes: Partial<Item>) => {
    const current = items.find((item) => item.id === id);
    if (!current) return;
    const payload = { ...current, ...changes };
    const updated = await onProjectUpdate(`${basePath}/items/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    applyProjectUpdate(updated);
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

  const applyRequirementsUpdate = async (next: RequirementRow[]) => {
    const currentProject = project;
    if (!currentProject) return;
    setRequirements(next);
    const updated = await onProjectUpdate(basePath, {
      method: "PUT",
      body: JSON.stringify({
        title: currentProject.title,
        customer: currentProject.customerDetail,
        status: currentProject.status,
        requirements: next,
        categories: currentProject.categories ?? [],
        templates,
      }),
    });
    applyProjectUpdate(updated as ProjectDetails | null);
  };

  const addRequirementRow = async () => {
    const defaultCategory = project?.categories?.[0] ?? "";
    const next: RequirementRow[] = [
      ...(requirements ?? []),
      {
        id: crypto.randomUUID(),
        label: "",
        categorySlug: defaultCategory,
        notes: "",
        value: "",
        fieldType: "text",
      },
    ];
    await applyRequirementsUpdate(next);
  };

  const updateRequirementRow = async (id: string, changes: Partial<RequirementRow>) => {
    const next = (requirements ?? []).map((row) => (row.id === id ? { ...row, ...changes } : row));
    await applyRequirementsUpdate(next);
  };

  const deleteRequirementRow = async (id: string) => {
    const next = (requirements ?? []).filter((row) => row.id !== id);
    await applyRequirementsUpdate(next);
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

  const handleProceedToOffer = async () => {
    const currentProject = project;
    if (!currentProject) return;
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
    }
    setActiveTab("offers");
    await handleGenerateOfferFromRequirements();
    setIsGenerateModalOpen(true);
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
    const targetTab = tabByStep[step] ?? "items";
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
      return <div className="min-h-screen bg-background p-6">Nalaganje...</div>;
    }

    if (error) {
      return (
        <div className="min-h-screen bg-background p-6">
          <p className="text-destructive">Napaka pri nalaganju projekta.</p>
        </div>
      );
    }

    if (!project) {
      return (
        <div className="min-h-screen bg-background p-6">
          <p className="text-muted-foreground">Projekt ni na voljo.</p>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background">
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
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="flex w-full overflow-hidden bg-muted/10 p-0">
                  {[
                    { value: "items", label: "Zahteve" },
                    { value: "offers", label: "Ponudbe" },
                    { value: "logistics", label: "Priprava" },
                    { value: "execution", label: "Izvedba" },
                    { value: "closing", label: "Račun" },
                  ].map((tab, index, tabsArr) => {
                    const stepKey = stepByTab[tab.value];
                    const stepStatus: StepStatus = stepKey ? timelineStepByKey[stepKey]?.status ?? "pending" : "pending";
                    const phase = stepStatus === "done" ? "done" : stepStatus === "inProgress" ? "active" : "future";
                    const styles = TAB_PHASE_STYLES[phase];
                    const icon = phase === "done" ? "✓" : phase === "active" ? "•" : "";
                    const overlap = 36;
                    const clipPath = index === tabsArr.length - 1 ? "polygon(0 0, 100% 0, 100% 100%, 0 100%)" : "polygon(0 0, calc(100% - 32px) 0, 100% 50%, calc(100% - 32px) 100%, 0 100%)";
                    const roundedClass =
                      index === 0 ? "rounded-l-md" : index === tabsArr.length - 1 ? "rounded-r-md" : "";
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        style={{
                          clipPath,
                          marginInlineStart: index === 0 ? 0 : -overlap,
                          zIndex: tabsArr.length - index,
                        }}
                        className={`relative flex flex-1 items-center gap-2 pl-5 pr-12 py-3 text-sm font-semibold uppercase tracking-wide transition overflow-hidden ${roundedClass} ${styles.container}`}
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
                    handleProceedToOffer={handleProceedToOffer}
                    isExecutionPhase={isExecutionPhase}
                    items={items}
                    handleProjectItemFieldChange={handleProjectItemFieldChange}
                    openCatalog={openCatalog}
                    handleAddItem={handleAddItem}
                    handleDeleteItem={handleDeleteItem}
                    isGenerateModalOpen={isGenerateModalOpen}
                    setIsGenerateModalOpen={setIsGenerateModalOpen}
                    offerCandidates={offerCandidates}
                    candidateSelections={candidateSelections}
                    candidateProducts={candidateProducts}
                    toggleCandidateSelection={toggleCandidateSelection}
                    setCandidateSelections={setCandidateSelections}
                    handleConfirmOfferFromRequirements={handleConfirmOfferFromRequirements}
                    isItemDialogOpen={isItemDialogOpen}
                    setItemDialogOpen={setItemDialogOpen}
                    resetItemForm={resetItemForm}
                    editingItem={editingItem}
                    itemForm={itemForm}
                    setItemForm={setItemForm}
                    itemContext={itemContext}
                    setItemContext={setItemContext}
                    isSavingItem={isSavingItem}
                    handleSaveItem={handleSaveItem}
                    isCatalogDialogOpen={isCatalogDialogOpen}
                    setCatalogDialogOpen={setCatalogDialogOpen}
                    filteredCatalog={filteredCatalog}
                    catalogSearch={catalogSearch}
                    setCatalogSearch={setCatalogSearch}
                    selectedCatalogProduct={selectedCatalogProduct}
                    setSelectedCatalogProduct={setSelectedCatalogProduct}
                    catalogQuantity={catalogQuantity}
                    setCatalogQuantity={setCatalogQuantity}
                    catalogDiscount={catalogDiscount}
                    setCatalogDiscount={setCatalogDiscount}
                    catalogVatRate={catalogVatRate}
                    setCatalogVatRate={setCatalogVatRate}
                    catalogUnit={catalogUnit}
                    setCatalogUnit={setCatalogUnit}
                    handleAddFromCatalog={handleAddFromCatalog}
                    isAddingFromCatalog={isAddingFromCatalog}
                    catalogLoading={catalogLoading}
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
