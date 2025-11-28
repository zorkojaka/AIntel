import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Card } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { ItemsTable, Item } from "./ItemsTable";
import { OfferVersionCard, OfferVersion } from "./OfferVersionCard";
import { WorkOrderCard, WorkOrder } from "./WorkOrderCard";
import { TimelineFeed, TimelineEvent } from "./TimelineFeed";
import { ValidationBanner } from "./ValidationBanner";
import { SignaturePad } from "./SignaturePad";
import { Template } from "./TemplateEditor";
import { renderTemplate, openPreview, downloadHTML } from "./TemplateRenderer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import {
  ArrowLeft,
  Save,
  Plus,
  FileText,
  Package,
  Truck,
  Wrench,
  Receipt,
  FolderOpen,
  Clock,
  Eye,
  Download,
  Search,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { DeliveryNote, ProjectDetails, ProjectOffer, ProjectOfferItem, PurchaseOrder } from "../types";

type ItemFormState = {
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  vatRate: number;
  description: string;
  category: Item["category"];
};

type RequirementRow = {
  id: string;
  label: string;
  categorySlug: string;
  notes?: string;
};

type CatalogProduct = {
  id: string;
  name: string;
  category?: string;
  price: number;
  description?: string;
  supplier?: string;
};

interface ProjectWorkspaceProps {
  project: ProjectDetails;
  templates: Template[];
  onBack: () => void;
  onRefresh: () => void;
  onProjectUpdate: (path: string, options?: RequestInit) => Promise<ProjectDetails | null>;
}

export function ProjectWorkspace({ project, templates, onBack, onRefresh, onProjectUpdate }: ProjectWorkspaceProps) {
  const [activeTab, setActiveTab] = useState("items");
  const [items, setItems] = useState<Item[]>(project.items);
  const [offers, setOffers] = useState<OfferVersion[]>(project.offers);
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
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(project.workOrders);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(project.purchaseOrders);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>(project.deliveryNotes);
  const [timeline, setTimeline] = useState<TimelineEvent[]>(project.timelineEvents);
  const [status, setStatus] = useState(project.status);
  const [requirementsText, setRequirementsText] = useState(project.requirements);
  const [requirements, setRequirements] = useState<RequirementRow[]>([]);
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
  type CatalogTarget = "project" | "offer";
  const [catalogTarget, setCatalogTarget] = useState<CatalogTarget>("project");
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isAddingFromCatalog, setIsAddingFromCatalog] = useState(false);
  const [isOfferLoading, setIsOfferLoading] = useState(false);
  const [offerVatRate, setOfferVatRate] = useState<number>(22);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);

  const basePath = `/api/projects/${project.id}`;
  const isExecutionPhase = status === "ordered" || status === "in-progress" || status === "completed";

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
    setItems(project.items);
    setOffers(project.offers);
    setActiveOffer(null);
    setOfferItems([]);
    setWorkOrders(project.workOrders);
    setPurchaseOrders(project.purchaseOrders);
    setDeliveryNotes(project.deliveryNotes);
    setTimeline(project.timelineEvents);
    setStatus(project.status);
    setRequirementsText(project.requirements);
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
    if (activeTab === "offers" && !activeOffer && !isOfferLoading) {
      fetchActiveOffer();
    }
  }, [activeTab, activeOffer, fetchActiveOffer, isOfferLoading]);

  const fetchCatalogItems = useCallback(async () => {
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
  }, []);

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
    setItems(updated.items);
    setOffers(updated.offers);
    setWorkOrders(updated.workOrders);
    setPurchaseOrders(updated.purchaseOrders);
    setDeliveryNotes(updated.deliveryNotes);
    setTimeline(updated.timelineEvents);
    setStatus(updated.status);
    setRequirementsText(updated.requirements);
  };

  const validationIssues: string[] = [];
  if (!project.customerDetail.name) validationIssues.push("Manjka podatek o stranki");
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

  const addRequirementRow = () => {
    const defaultCategory = project.categories?.[0] ?? "";
    setRequirements((prev) => [
      ...prev,
      { id: `req-${Date.now()}`, label: "", categorySlug: defaultCategory, notes: "" },
    ]);
  };

  const updateRequirementRow = (id: string, changes: Partial<RequirementRow>) => {
    setRequirements((prev) => prev.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  };

  const deleteRequirementRow = (id: string) => {
    setRequirements((prev) => prev.filter((row) => row.id !== id));
  };

  const handleConnectProducts = (id: string) => {
    toast.info("Povezava produktov bo dodana v naslednji fazi.");
    console.debug("TODO: Poveži produkte za zahtevo", id);
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
    }
  };

  const handleCancelConfirmation = async (offerId: string) => {
    const updated = await onProjectUpdate(`${basePath}/offers/${offerId}/cancel`, { method: "POST" });
    applyProjectUpdate(updated);
    if (updated) toast.info("Potrditev ponudbe preklicana");
  };

  const handleReceiveDelivery = async (dnId: string) => {
    const updated = await onProjectUpdate(`${basePath}/deliveries/${dnId}/receive`, { method: "POST" });
    applyProjectUpdate(updated);
    if (updated) toast.success("Dobavnica potrjena! Načrt lahko generiramo.");
  };

  const handleMarkOfferAsSelected = async (offerId: string) => {
    const updated = await onProjectUpdate(`${basePath}/offers/${offerId}/select`, { method: "POST" });
    applyProjectUpdate(updated);
    if (updated) toast.success("Ponudba označena kot izbrana");
  };

  const handleGeneratePDF = (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;

    const defaultTemplate = templates.find((t) => t.isDefault && t.category === "offer");
    if (!defaultTemplate) {
      toast.error("Ni nastavljene privzete predloge za ponudbe");
      return;
    }

    const templateCustomer = {
      name: project.customerDetail?.name ?? "",
      taxId: project.customerDetail?.taxId ?? "",
      address: project.customerDetail?.address ?? "",
      paymentTerms: project.customerDetail?.paymentTerms ?? "",
    };

    const html = renderTemplate(defaultTemplate, {
      customer: templateCustomer,
      project: {
        id: project.id,
        title: project.title,
        description: requirementsText,
      },
      offer,
      items,
    });

    openPreview(html);
    toast.success("Predogled ponudbe odprt v novem zavihku");
  };

  const handleDownloadPDF = (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;

    const defaultTemplate = templates.find((t) => t.isDefault && t.category === "offer");
    if (!defaultTemplate) {
      toast.error("Ni nastavljene privzete predloge za ponudbe");
      return;
    }

    const templateCustomer = {
      name: project.customerDetail?.name ?? "",
      taxId: project.customerDetail?.taxId ?? "",
      address: project.customerDetail?.address ?? "",
      paymentTerms: project.customerDetail?.paymentTerms ?? "",
    };

    const html = renderTemplate(defaultTemplate, {
      customer: templateCustomer,
      project: {
        id: project.id,
        title: project.title,
        description: requirementsText,
      },
      offer,
      items,
    });

    downloadHTML(html, `Ponudba-${project.id}-v${offer.version}.html`);
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-[1280px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="m-0">{project.title}</h1>
                  <Badge className={
                    status === "draft" ? "bg-gray-100 text-gray-700" :
                    status === "offered" ? "bg-blue-100 text-blue-700" :
                    status === "ordered" ? "bg-purple-100 text-purple-700" :
                    status === "in-progress" ? "bg-yellow-100 text-yellow-700" :
                    status === "completed" ? "bg-green-100 text-green-700" :
                    "bg-gray-100 text-gray-700"
                  }>
                    {status === "draft" ? "Osnutek" :
                     status === "offered" ? "Ponujeno" :
                     status === "ordered" ? "Naročeno" :
                     status === "in-progress" ? "V teku" :
                     status === "completed" ? "Zaključeno" :
                     status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground m-0">ID: {project.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onRefresh}>
                <Save className="w-4 h-4 mr-2" />
                Osveži
              </Button>
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Osnutek</SelectItem>
                  <SelectItem value="offered">Ponujeno</SelectItem>
                  <SelectItem value="ordered">Naročeno</SelectItem>
                  <SelectItem value="in-progress">V teku</SelectItem>
                  <SelectItem value="completed">Zaključeno</SelectItem>
                  <SelectItem value="invoiced">Zaračunano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1280px] mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
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
                  <div>{project.customerDetail.address}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Plačilni pogoji</div>
                  <div>{project.customerDetail.paymentTerms}</div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="mb-3">Zahteve</h3>
              <p className="text-sm text-muted-foreground">{requirementsText}</p>
            </Card>

            <Card className="p-4">
              <h4 className="mb-3 text-sm">Hitra navigacija</h4>
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab("items")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "items" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Zahteve
                </button>
                <button
                  onClick={() => setActiveTab("offers")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "offers" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Ponudbe
                </button>
                <button
                  onClick={() => setActiveTab("logistics")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "logistics" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <Package className="w-4 h-4" />
                  Logistika
                </button>
                <button
                  onClick={() => setActiveTab("execution")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "execution" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  Izvedba
                </button>
                <button
                  onClick={() => setActiveTab("documents")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "documents" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  Dokumenti
                </button>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "timeline" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  Zgodovina
                </button>
              </nav>
            </Card>
          </div>

          {/* Content */}
          <div className="col-span-9">
            {validationIssues.length > 0 && <ValidationBanner missing={validationIssues} />}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList>
                <TabsTrigger value="items">Zahteve</TabsTrigger>
                <TabsTrigger value="offers">Ponudbe</TabsTrigger>
                <TabsTrigger value="logistics">Logistika</TabsTrigger>
                <TabsTrigger value="execution">Izvedba</TabsTrigger>
                <TabsTrigger value="documents">Dokumenti</TabsTrigger>
                <TabsTrigger value="timeline">Zgodovina</TabsTrigger>
              </TabsList>

              <TabsContent value="items" className="mt-0 space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Opis zahtev stranke</h3>
                  <p className="text-sm text-muted-foreground">
                    Zapišite glavne potrebe, opažanja z ogleda in posebne želje stranke.
                  </p>
                  <Textarea
                    value={requirementsText}
                    onChange={(event) => setRequirementsText(event.target.value)}
                    placeholder="Npr. videonadzor 4 kamere žično, snemanje 7 dni, dostop preko aplikacije ..."
                    rows={4}
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Zahteve</h3>
                  <div className="bg-card rounded-[var(--radius-card)] border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Naziv</TableHead>
                          <TableHead>Kategorija</TableHead>
                          <TableHead>Opombe</TableHead>
                          <TableHead className="text-right w-52">Akcije</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requirements.map((req) => (
                          <TableRow key={req.id}>
                            <TableCell>
                              <Input
                                value={req.label}
                                onChange={(event) => updateRequirementRow(req.id, { label: event.target.value })}
                                placeholder="Naziv zahteve"
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={req.categorySlug}
                                onValueChange={(value) => updateRequirementRow(req.id, { categorySlug: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Izberi kategorijo" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(project.categories ?? []).map((slug) => (
                                    <SelectItem key={slug} value={slug}>
                                      {slug}
                                    </SelectItem>
                                  ))}
                                  {(project.categories ?? []).length === 0 && (
                                    <SelectItem value="">Brez kategorij</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={req.notes ?? ""}
                                onChange={(event) => updateRequirementRow(req.id, { notes: event.target.value })}
                                placeholder="Opombe"
                              />
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleConnectProducts(req.id)}
                              >
                                Poveži produkte
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => deleteRequirementRow(req.id)}>
                                Izbriši
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button variant="outline" onClick={addRequirementRow}>
                    Dodaj zahtevo
                  </Button>
                </div>

                {!isExecutionPhase ? (
                  <Card className="p-4 text-sm text-muted-foreground">
                    Tehnične postavke bodo na voljo, ko bo ponudba sprejeta in bo projekt v izvedbi.
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Tehnične postavke</h3>
                    <ItemsTable
                      items={items}
                      onEditField={handleProjectItemFieldChange}
                      onAddFromCatalog={() => openCatalog("project")}
                      onAddCustom={handleAddItem}
                      onDelete={handleDeleteItem}
                      showDraftRow={false}
                      showDiscount
                    />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="offers" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="m-0">Aktivna ponudba</h3>
                    <p className="text-sm text-muted-foreground">
                      Postavke ponudbe so ločene od projektnih postavk. Uporabi cenik ali dodaj ročno.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => fetchActiveOffer()} disabled={isOfferLoading}>
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Osveži ponudbo
                    </Button>
                    <Button onClick={() => openCatalog("offer")}>
                      <Package className="mr-2 h-4 w-4" />
                      Dodaj iz cenika
                    </Button>
                  </div>
                </div>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Ponudba</p>
                      <h4 className="m-0">{activeOffer?.label ?? "Ponudba 1"}</h4>
                    </div>
                    <Button variant="outline" onClick={() => openCatalog("offer")}>
                      <Plus className="mr-2 h-4 w-4" />
                      Nova postavka
                    </Button>
                  </div>
                  <ItemsTable
                    items={offerItems as Item[]}
                    onEditField={(id, changes) => handleOfferItemFieldChange(id, changes as Partial<ProjectOfferItem>)}
                    onAddFromCatalog={() => openCatalog("offer")}
                    onAddCustom={() => handleSubmitDraftOfferItem()}
                    onDelete={handleDeleteOfferItem}
                    showDiscount={hasAnyDiscount}
                    showDraftRow
                    draftItem={draftOfferItem as Item}
                    onChangeDraft={(changes) => setDraftOfferItem((prev) => ({ ...prev, ...(changes as ProjectOfferItem) }))}
                    onSubmitDraft={handleSubmitDraftOfferItem}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 mt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">DDV za ponudbo</label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={offerVatRate}
                        onChange={(event) => handleOfferVatRateChange(Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Popust na celotno ponudbo (%)</label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={globalDiscount}
                        onChange={(event) => handleGlobalDiscountChange(Number(event.target.value))}
                      />
                    </div>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="logistics" className="mt-0 space-y-6">
                <div>
                  <h3 className="mb-4">Naročilnice po dobaviteljih</h3>
                  {purchaseOrders.length > 0 ? (
                    <div className="border rounded-[var(--radius-card)] bg-card overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Dobavitelj</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Znesek</TableHead>
                            <TableHead>Rok</TableHead>
                            <TableHead>Postavke</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchaseOrders.map((po) => (
                            <TableRow key={po.id}>
                              <TableCell className="font-medium">{po.supplier}</TableCell>
                              <TableCell>
                                <Badge className={
                                  po.status === "sent" ? "bg-blue-100 text-blue-700" :
                                  po.status === "confirmed" ? "bg-green-100 text-green-700" :
                                  po.status === "delivered" ? "bg-green-100 text-green-700" :
                                  "bg-gray-100 text-gray-700"
                                }>
                                  {po.status === "sent" ? "Poslano" :
                                   po.status === "confirmed" ? "Potrjeno" :
                                   po.status === "delivered" ? "Dostavljeno" :
                                   po.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">€ {po.amount.toFixed(2)}</TableCell>
                              <TableCell>{po.dueDate}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {po.items.join(", ")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <Card className="p-6 text-center text-muted-foreground">
                      {offers.length > 0 ? "Naro?ilnice bodo generirane ob potrditvi ponudbe" : "Izberite ponudbo za generiranje naro?ilnic"}
                    </Card>
                  )}
                </div>

                <div>
                  <h3 className="mb-4">Dobavnice</h3>
                  {deliveryNotes.length > 0 ? (
                    <div className="space-y-3">
                      {deliveryNotes.map((dn) => (
                        <Card key={dn.id} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-3">
                                <h4 className="m-0">{dn.id}</h4>
                                <Badge className={
                                  dn.receivedQuantity > 0 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                }>
                                  {dn.receivedQuantity > 0 ? "Prevzeto" : "?aka"}
                                </Badge>
                              </div>
                              <div className="text-sm">
                                <div className="text-muted-foreground">Dobavitelj: {dn.supplier}</div>
                                {dn.receivedDate && (
                                  <div className="text-muted-foreground">Datum prevzema: {dn.receivedDate}</div>
                                )}
                                {dn.serials && dn.serials.length > 0 && (
                                  <div className="text-muted-foreground">Serijske št.: {dn.serials.join(", ")}</div>
                                )}
                                <div className="mt-1">
                                  Prevzeto: {dn.receivedQuantity}/{dn.totalQuantity} kosov
                                </div>
                              </div>
                            </div>
                            {dn.receivedQuantity === 0 && (
                              <Button size="sm" onClick={() => handleReceiveDelivery(dn.id)}>
                                <Truck className="w-4 h-4 mr-2" />
                                Potrdi prevzem
                              </Button>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card className="p-6 text-center text-muted-foreground">
                      Še ni zabeleženih dobav
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="execution" className="mt-0 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3>Delovni nalogi</h3>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Plus className="w-4 h-4 mr-2" />
                          Dodeli ekipo
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Dodeli nov delovni nalog</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Ekipa</Label>
                            <Input placeholder="Ekipa A - Janez, Marko" />
                          </div>
                          <div className="space-y-2">
                            <Label>Termin</Label>
                            <Input placeholder="14.11.2024 08:00" />
                          </div>
                          <div className="space-y-2">
                            <Label>Lokacija</Label>
                            <Input placeholder="Tržaška cesta 12, Ljubljana" />
                          </div>
                          <div className="space-y-2">
                            <Label>Opombe</Label>
                            <Textarea placeholder="Posebna navodila" />
                          </div>
                          <Button className="w-full">Shrani</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {workOrders.length > 0 ? (
                    <div className="space-y-3">
                      {workOrders.map((wo) => (
                        <WorkOrderCard key={wo.id} workOrder={wo} />
                      ))}
                    </div>
                  ) : (
                    <Card className="p-6 text-center text-muted-foreground">Ni dodeljenih delovnih nalogov</Card>
                  )}
                </div>

                <div className="space-y-4">
                  <h3>Potrditev zaključka</h3>
                  <Card className="p-6">
                    <SignaturePad onSign={handleSaveSignature} />
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="documents" className="mt-0 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5" />
                      <div>
                        <p className="m-0 font-medium">Ponudba</p>
                        <p className="text-sm text-muted-foreground m-0">v2 - potrjena</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => toast.info("Pretvorjeno v delovni nalog")}>Pretvori v DN</Button>
                      <Button variant="outline" size="sm" onClick={() => toast.info("Pretvorjeno v račun")}>Pretvori v račun</Button>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <Receipt className="w-5 h-5" />
                      <div>
                        <p className="m-0 font-medium">Naročilnica</p>
                        <p className="text-sm text-muted-foreground m-0">Aliansa d.o.o.</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => toast.success("Naročilnica poslana")}>Pošlji</Button>
                      <Button variant="outline" size="sm" onClick={() => toast.success("Prevzem potrjen")}>Potrdi prevzem</Button>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5" />
                      <div>
                        <p className="m-0 font-medium">Dobavnica</p>
                        <p className="text-sm text-muted-foreground m-0">Hotel Dolenjc</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => toast.success("Dobavnica potrjena")}>Potrdi</Button>
                      <Button variant="outline" size="sm" onClick={() => toast.info("Dobavnica poslana")}>Pošlji</Button>
                    </div>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="mt-0">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="m-0">Zgodovina</h3>
                    <p className="text-sm text-muted-foreground m-0">Dogodki projekta in statusne spremembe</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => onRefresh()}>
                    <Eye className="w-4 h-4 mr-2" />
                    Osveži
                  </Button>
                </div>
                <TimelineFeed events={timeline} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <Dialog
        open={isItemDialogOpen}
        onOpenChange={(open) => {
          setItemDialogOpen(open);
          if (!open) {
            resetItemForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Uredi postavko" : "Dodaj postavko"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Naziv</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={itemForm.sku} onChange={(e) => setItemForm((prev) => ({ ...prev, sku: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Enota</Label>
                <Input value={itemForm.unit} onChange={(e) => setItemForm((prev) => ({ ...prev, unit: e.target.value }))} />
              </div>
              <div>
                <Label>Kategorija</Label>
                <Select
                  value={itemForm.category ?? "material"}
                  onValueChange={(value) => setItemForm((prev) => ({ ...prev, category: value as Item["category"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="labor">Delo</SelectItem>
                    <SelectItem value="other">Drugo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>DDV %</Label>
                <Input
                  type="number"
                  value={itemForm.vatRate}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, vatRate: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Količina</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Cena</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={itemForm.price}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, price: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Popust %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={itemForm.discount}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, discount: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div>
              <Label>Opis</Label>
              <Textarea
                rows={3}
                value={itemForm.description}
                onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <Button onClick={handleSaveItem} disabled={isSavingItem}>
              {isSavingItem && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingItem ? "Shrani spremembe" : "Dodaj postavko"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCatalogDialogOpen}
        onOpenChange={(open) => {
          setCatalogDialogOpen(open);
          if (!open) {
            setSelectedCatalogProduct(null);
            setCatalogQuantity(1);
            setCatalogDiscount(0);
            setCatalogVatRate(22);
            setCatalogUnit("kos");
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Dodaj postavko iz cenika</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Išči po nazivu ali kategoriji"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                />
              </div>
              <div className="border rounded-lg h-80 overflow-y-auto divide-y">
                {catalogLoading && (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Nalagam cenik ...
                  </div>
                )}
                {!catalogLoading && filteredCatalog.length === 0 && (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    Ni zadetkov. Spremenite iskalni niz.
                  </div>
                )}
                {!catalogLoading &&
                  filteredCatalog.map((product) => (
                    <button
                      key={product.id}
                      className={`w-full text-left p-3 transition-colors ${
                        selectedCatalogProduct?.id === product.id ? "bg-primary/5" : "hover:bg-muted"
                      }`}
                      onClick={() => setSelectedCatalogProduct(product)}
                    >
                      <div className="font-medium">{product.name}</div>
                      <div className="text-xs text-muted-foreground">{product.category || "Brez kategorije"}</div>
                      <div className="text-sm font-semibold">€ {product.price.toFixed(2)}</div>
                    </button>
                  ))}
              </div>
              <Button variant="outline" size="sm" onClick={fetchCatalogItems} disabled={catalogLoading}>
                {catalogLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Osveži cenik
              </Button>
            </div>
            <div className="space-y-4">
              {selectedCatalogProduct ? (
                <>
                  <div>
                    <h4 className="m-0">{selectedCatalogProduct.name}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedCatalogProduct.description}</p>
                    {selectedCatalogProduct.supplier && (
                      <p className="text-xs text-muted-foreground">Dobavitelj: {selectedCatalogProduct.supplier}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Količina</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={catalogQuantity}
                        onChange={(e) => setCatalogQuantity(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label>Enota</Label>
                      <Input value={catalogUnit} onChange={(e) => setCatalogUnit(e.target.value)} />
                    </div>
                    <div>
                      <Label>Popust %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={catalogDiscount}
                        onChange={(e) => setCatalogDiscount(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label>DDV %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        step={0.1}
                        value={catalogVatRate}
                        onChange={(e) => setCatalogVatRate(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <Button className="w-full" onClick={handleAddFromCatalog} disabled={isAddingFromCatalog}>
                    {isAddingFromCatalog && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Dodaj iz cenika
                  </Button>
                </>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 p-6 text-center text-sm text-muted-foreground">
                  Izberite produkt iz cenika in določite količino ter DDV.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
