import { useEffect, useState } from "react";
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
import { ArrowLeft, Save, CheckCircle, Plus, FileText, Package, Truck, Wrench, Receipt, FolderOpen, Clock, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { confirmProjectPhase, type ConfirmPhasePayload } from "../api/projects";
import type {
  ProjectCustomer,
  ProjectDetail,
  ProjectItem,
  ProjectOffer,
  ProjectTimelineEvent,
  ProjectWorkOrder,
  ProjectStatus,
} from "../types";

interface PurchaseOrder {
  id: string;
  supplier: string;
  status: "draft" | "sent" | "confirmed" | "delivered";
  amount: number;
  dueDate: string;
  items: string[];
}

interface DeliveryNote {
  id: string;
  poId: string;
  supplier: string;
  receivedQuantity: number;
  totalQuantity: number;
  receivedDate: string;
  serials?: string[];
}

interface ProjectWorkspaceProps {
  projectId: string;
  projectTitle: string;
  customer: ProjectCustomer;
  items: ProjectItem[];
  offers: ProjectOffer[];
  workOrders: ProjectWorkOrder[];
  timelineEvents: ProjectTimelineEvent[];
  status: ProjectStatus;
  requirementsText: string;
  templates: Template[];
  onBack: () => void;
  onProjectUpdated?: (project: ProjectDetail) => void;
}

export function ProjectWorkspace({
  projectId,
  projectTitle,
  customer,
  items: initialItems,
  offers: initialOffers,
  workOrders: initialWorkOrders,
  timelineEvents: initialTimelineEvents,
  status: initialStatus,
  requirementsText,
  templates,
  onBack,
  onProjectUpdated,
}: ProjectWorkspaceProps) {
  const [activeTab, setActiveTab] = useState("items");
  const [items, setItems] = useState<ProjectItem[]>(initialItems);
  const [offers, setOffers] = useState<ProjectOffer[]>(initialOffers);
  const [workOrders, setWorkOrders] = useState<ProjectWorkOrder[]>(initialWorkOrders);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [timeline, setTimeline] = useState<ProjectTimelineEvent[]>(initialTimelineEvents);
  const [status, setStatus] = useState<ProjectStatus>(initialStatus);
  const [requirements, setRequirements] = useState(requirementsText);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    setOffers(initialOffers);
  }, [initialOffers]);

  useEffect(() => {
    setWorkOrders(initialWorkOrders);
  }, [initialWorkOrders]);

  useEffect(() => {
    setTimeline(initialTimelineEvents);
  }, [initialTimelineEvents]);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    setRequirements(requirementsText);
  }, [requirementsText]);

  const selectedOffer = offers.find((o) => o.isSelected);
  const validationIssues: string[] = [];

  if (!customer.name) validationIssues.push("Manjka podatek o stranki");
  if (items.length === 0) validationIssues.push("Dodajte vsaj eno postavko");

  const addTimelineEvent = (event: Omit<ProjectTimelineEvent, "id">) => {
    const newEvent: ProjectTimelineEvent = {
      ...event,
      id: `evt-${Date.now()}`,
    };
    setTimeline([newEvent, ...timeline]);
  };

  const syncPhaseWithBackend = async (payload: ConfirmPhasePayload) => {
    try {
      const updatedProject = await confirmProjectPhase(projectId, payload);
      setItems(updatedProject.items);
      setOffers(updatedProject.offers);
      setWorkOrders(updatedProject.workOrders);
      setTimeline(updatedProject.timeline);
      setStatus(updatedProject.status);
      onProjectUpdated?.(updatedProject);
      return updatedProject;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Napaka pri komunikaciji s projektno API storitvijo.";
      toast.error(message);
      throw error;
    }
  };

  const handleAddItem = () => {
    toast.success("Postavka dodana");
  };

  const handleEditItem = (item: ProjectItem) => {
    toast.info("Urejanje postavke");
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
    toast.success("Postavka izbrisana");
  };

  const handleCreateOffer = () => {
    const newVersion: OfferVersion = {
      id: `offer-${offers.length + 1}`,
      version: offers.length + 1,
      status: "draft",
      amount: items.reduce((acc, item) => acc + item.quantity * item.price * (1 - item.discount / 100) * (1 + item.vatRate / 100), 0),
      date: new Date().toLocaleDateString("sl-SI"),
    };
    setOffers([...offers, newVersion]);
    
    addTimelineEvent({
      type: "offer",
      title: `Ponudba v${newVersion.version} ustvarjena`,
      description: `Nova verzija ponudbe v vrednosti € ${newVersion.amount.toFixed(2)}`,
      timestamp: new Date().toLocaleString("sl-SI"),
      user: "Admin",
      metadata: { amount: `€ ${newVersion.amount.toFixed(2)}`, status: "draft" },
    });
    
    toast.success("Nova verzija ponudbe ustvarjena");
  };

  const handleSendOffer = (offerId: string) => {
    setOffers(offers.map((o) => (o.id === offerId ? { ...o, status: "sent" as const } : o)));
    
    const offer = offers.find((o) => o.id === offerId);
    if (offer) {
      addTimelineEvent({
        type: "offer",
        title: `Ponudba v${offer.version} poslana`,
        description: "Ponudba poslana stranki",
        timestamp: new Date().toLocaleString("sl-SI"),
        user: "Admin",
      });
    }
    
    toast.success("Ponudba poslana");
  };

  const handleConfirmOffer = async (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;

    try {
      await syncPhaseWithBackend({ phase: "offer", offerId, action: "confirm" });
    } catch {
      return;
    }

    const newPOs: PurchaseOrder[] = [
      {
        id: `PO-${Date.now()}-1`,
        supplier: "Aliansa d.o.o.",
        status: "sent",
        amount: 1200.0,
        dueDate: "15.11.2024",
        items: ["DVC IP kamera 4MP (4x)", "NVR 8-kanalni (1x)"],
      },
      {
        id: `PO-${Date.now()}-2`,
        supplier: "Elektromaterial LLC",
        status: "sent",
        amount: 60.0,
        dueDate: "12.11.2024",
        items: ["UTP Cat6 kabel (50m)"],
      },
    ];
    setPurchaseOrders(newPOs);

    const newWorkOrder: ProjectWorkOrder = {
      id: `WO-${Date.now()}`,
      team: "Ekipa A - Janez Novak, Marko Horvat",
      schedule: "14.11.2024 08:00",
      location: `${customer.address}`,
      status: "planned",
      notes: "Pripraviti ključe za dostop do tehničnih prostorov",
    };
    setWorkOrders((prev) => [...prev, newWorkOrder]);

    const newDeliveryNotes: DeliveryNote[] = newPOs.map((po) => ({
      id: `DN-${Date.now()}-${po.id}`,
      poId: po.id,
      supplier: po.supplier,
      receivedQuantity: 0,
      totalQuantity: po.items.length,
      receivedDate: "",
      serials: [],
    }));
    setDeliveryNotes(newDeliveryNotes);

    // Update project status
    setStatus("ordered");

    // Add timeline events
    addTimelineEvent({
      type: "offer",
      title: `Ponudba v${offer.version} potrjena`,
      description: "Ponudba označena kot izbrana",
      timestamp: new Date().toLocaleString("sl-SI"),
      user: "Admin",
      metadata: { amount: `€ ${offer.amount.toFixed(2)}` },
    });

    addTimelineEvent({
      type: "po",
      title: "Naročilnice generirane",
      description: `Ustvarjenih ${newPOs.length} naročilnic`,
      timestamp: new Date().toLocaleString("sl-SI"),
      user: "Admin",
      metadata: { count: newPOs.length.toString() },
    });

    addTimelineEvent({
      type: "execution",
      title: "Delovni nalog ustvarjen",
      description: `Načrtovana montaža: ${newWorkOrder.schedule}`,
      timestamp: new Date().toLocaleString("sl-SI"),
      user: "Admin",
      metadata: { team: newWorkOrder.team },
    });

    addTimelineEvent({
      type: "status-change",
      title: "Status spremenjen",
      description: "Projekt prešel v fazo 'Naročeno'",
      timestamp: new Date().toLocaleString("sl-SI"),
      user: "Admin",
    });

    toast.success("Ponudba potrjena! Ustvarjene naročilnice, delovni nalog in dobavnice.");
    setActiveTab("logistics");
  };

  const handleCancelConfirmation = async (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;

    try {
      await syncPhaseWithBackend({ phase: "offer", offerId, action: "cancel" });
    } catch {
      return;
    }

    // Clear generated documents
    setPurchaseOrders([]);
    setDeliveryNotes([]);
    setWorkOrders(initialWorkOrders);

    toast.info("Potrditev ponudbe preklicana");
  };

  const handleReceiveDelivery = async (dnId: string) => {
    const dn = deliveryNotes.find((d) => d.id === dnId);
    if (!dn) return;

    try {
      await syncPhaseWithBackend({ phase: "delivery", note: `Dobavnica ${dnId}` });
    } catch {
      return;
    }

    const updatedNotes = deliveryNotes.map((d) =>
      d.id === dnId
        ? {
            ...d,
            receivedQuantity: d.totalQuantity,
            receivedDate: new Date().toLocaleDateString("sl-SI"),
            serials: ["SN-001", "SN-002", "SN-003"],
          }
        : d
    );
    setDeliveryNotes(updatedNotes);

    // Update PO status
    setPurchaseOrders(
      purchaseOrders.map((po) =>
        po.id === dn.poId ? { ...po, status: "delivered" as const } : po
      )
    );

    // Check if all deliveries are complete
    const allDelivered = deliveryNotes.every((d) => d.id === dnId || d.receivedQuantity > 0);
    
    if (allDelivered) {
      setStatus("in-progress");
      addTimelineEvent({
        type: "status-change",
        title: "Status spremenjen",
        description: "Projekt prešel v fazo 'V teku' - vsa dobava potrjena",
        timestamp: new Date().toLocaleString("sl-SI"),
        user: "Admin",
      });
    }

    addTimelineEvent({
      type: "delivery",
      title: "Dobavnica potrjena",
      description: `Dobavnica ${dnId} - ${dn.supplier}`,
      timestamp: new Date().toLocaleString("sl-SI"),
      user: "Admin",
      metadata: { supplier: dn.supplier },
    });

    toast.success("Dobavnica potrjena! Načrt lahko generiramo.");
  };

  const handleMarkOfferAsSelected = (offerId: string) => {
    setOffers(offers.map((o) => ({ ...o, isSelected: o.id === offerId })));
    toast.success("Ponudba označena kot izbrana");
  };

  const handleGeneratePDF = (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;

    const defaultTemplate = templates.find((t) => t.isDefault && t.category === "offer");
    if (!defaultTemplate) {
      toast.error("Ni nastavljene privzete predloge za ponudbe");
      return;
    }

    const html = renderTemplate(defaultTemplate, {
      customer,
      project: {
        id: projectId,
        title: projectTitle,
        description: requirements,
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

    const html = renderTemplate(defaultTemplate, {
      customer,
      project: {
        id: projectId,
        title: projectTitle,
        description: requirements,
      },
      offer,
      items,
    });

    downloadHTML(html, `Ponudba-${projectId}-v${offer.version}.html`);
    toast.success("Ponudba prenesena kot HTML");
  };

  const handleSaveSignature = async (_signature: string, signerName: string) => {
    try {
      await syncPhaseWithBackend({ phase: "completion", note: `Podpisal: ${signerName}` });
      toast.success(`Podpis shranjen: ${signerName}`);
    } catch {
      // Napaka je že prikazana v syncPhaseWithBackend
    }
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
                  <h1 className="m-0">{projectTitle}</h1>
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
                <p className="text-sm text-muted-foreground m-0">ID: {projectId}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline">
                <Save className="w-4 h-4 mr-2" />
                Shrani
              </Button>
              <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus)}>
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
                  <div>{customer.name}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">ID za DDV</div>
                  <div>{customer.taxId}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Naslov</div>
                  <div>{customer.address}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Plačilni pogoji</div>
                  <div>{customer.paymentTerms}</div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="mb-3">Zahteve</h3>
              <p className="text-sm text-muted-foreground">{requirements}</p>
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
                  Items
                </button>
                <button
                  onClick={() => setActiveTab("offers")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "offers" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Offers
                </button>
                <button
                  onClick={() => setActiveTab("logistics")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "logistics" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <Package className="w-4 h-4" />
                  Logistics
                </button>
                <button
                  onClick={() => setActiveTab("execution")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "execution" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  Execution
                </button>
                <button
                  onClick={() => setActiveTab("invoices")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "invoices" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <Receipt className="w-4 h-4" />
                  Invoices
                </button>
                <button
                  onClick={() => setActiveTab("files")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "files" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  Files
                </button>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "timeline" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  Timeline
                </button>
              </nav>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm">Zadnji dogodki</h4>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className="text-xs text-primary hover:underline"
                >
                  Vsi dogodki
                </button>
              </div>
              <div className="space-y-2">
                {timeline.slice(0, 5).map((event) => {
                  const getTabForEvent = (type: string) => {
                    const tabMap: Record<string, string> = {
                      offer: "offers",
                      po: "logistics",
                      delivery: "logistics",
                      execution: "execution",
                      invoice: "invoices",
                      file: "files",
                    };
                    return tabMap[type] || "timeline";
                  };

                  return (
                    <button
                      key={event.id}
                      onClick={() => setActiveTab(getTabForEvent(event.type))}
                      className="w-full text-left p-2 rounded hover:bg-muted transition-colors group"
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          event.type === "offer" ? "bg-blue-500" :
                          event.type === "po" ? "bg-purple-500" :
                          event.type === "delivery" ? "bg-green-500" :
                          event.type === "execution" ? "bg-orange-500" :
                          event.type === "invoice" ? "bg-red-500" :
                          event.type === "status-change" ? "bg-gray-500" :
                          "bg-gray-400"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs group-hover:text-primary transition-colors truncate">
                            {event.title}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {event.timestamp}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {timeline.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Še ni dogodkov
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Main Area */}
          <div className="col-span-9">
            <ValidationBanner missing={validationIssues} />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="items">Items</TabsTrigger>
                <TabsTrigger value="offers">Offers</TabsTrigger>
                <TabsTrigger value="logistics">Logistics</TabsTrigger>
                <TabsTrigger value="execution">Execution</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>

              <TabsContent value="items" className="mt-0">
                <ItemsTable
                  items={items}
                  onAdd={handleAddItem}
                  onEdit={handleEditItem}
                  onDelete={handleDeleteItem}
                />
              </TabsContent>

              <TabsContent value="offers" className="mt-0 space-y-4">
                <div className="flex gap-2">
                  <Button onClick={handleCreateOffer}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nova verzija iz trenutnih Items
                  </Button>
                  {selectedOffer && (
                    <>
                      <Button variant="outline" onClick={() => handleGeneratePDF(selectedOffer.id)}>
                        <Eye className="w-4 h-4 mr-2" />
                        Predogled PDF
                      </Button>
                      <Button variant="outline" onClick={() => handleDownloadPDF(selectedOffer.id)}>
                        <Download className="w-4 h-4 mr-2" />
                        Prenesi HTML
                      </Button>
                    </>
                  )}
                </div>

                {!templates.find((t) => t.isDefault && t.category === "offer") && (
                  <Card className="p-4 bg-yellow-50 border-yellow-200">
                    <p className="text-sm text-yellow-800">
                      Opozorilo: Ni nastavljene privzete predloge za ponudbe. Pojdite v Nastavitve → PDF Predloge.
                    </p>
                  </Card>
                )}

                <div className="space-y-3">
                  {offers.map((offer) => (
                    <div key={offer.id} className="space-y-2">
                      <OfferVersionCard
                        offer={offer}
                        onOpen={() => handleGeneratePDF(offer.id)}
                        onPDF={() => handleDownloadPDF(offer.id)}
                        onMarkAsSelected={() => handleMarkOfferAsSelected(offer.id)}
                        onSend={() => handleSendOffer(offer.id)}
                        onConfirm={() => handleConfirmOffer(offer.id)}
                        onCancelConfirmation={() => handleCancelConfirmation(offer.id)}
                      />
                    </div>
                  ))}
                </div>

                {offers.length === 0 && (
                  <Card className="p-12 text-center">
                    <p className="text-muted-foreground">Še ni ustvarjenih ponudb</p>
                    <Button className="mt-4" onClick={handleCreateOffer}>
                      Ustvari prvo ponudbo
                    </Button>
                  </Card>
                )}
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
                      {selectedOffer ? "Naročilnice bodo generirane ob potrditvi ponudbe" : "Izberite ponudbo za generiranje naročilnic"}
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
                                  {dn.receivedQuantity > 0 ? "Prevzeto" : "Čaka"}
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
                        <Button>
                          <Plus className="w-4 h-4 mr-2" />
                          Nov delovni nalog
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Nov delovni nalog</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                          <div>
                            <Label>Ekipa</Label>
                            <Input placeholder="Ekipa A" className="mt-1" />
                          </div>
                          <div>
                            <Label>Termin</Label>
                            <Input type="datetime-local" className="mt-1" />
                          </div>
                          <div>
                            <Label>Lokacija</Label>
                            <Input placeholder="Hotel Dolenjc, Tržaška 12" className="mt-1" />
                          </div>
                          <div>
                            <Label>Opombe</Label>
                            <Textarea placeholder="Dodatne informacije..." className="mt-1" />
                          </div>
                          <Button className="w-full">Ustvari</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="space-y-3">
                    {workOrders.map((wo) => (
                      <WorkOrderCard key={wo.id} workOrder={wo} />
                    ))}
                  </div>
                  {workOrders.length === 0 && (
                    <Card className="p-6 text-center text-muted-foreground">
                      Še ni ustvarjenih delovnih nalogov
                    </Card>
                  )}
                </div>

                <div>
                  <h3 className="mb-4">Potrdilo o zaključku del</h3>
                  <Card className="p-6">
                    <div className="space-y-4">
                      <div>
                        <Label>Opis opravljenih del</Label>
                        <Textarea
                          placeholder="Opišite opravljena dela..."
                          className="mt-1"
                          rows={4}
                        />
                      </div>
                      <SignaturePad onSign={handleSaveSignature} />
                    </div>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="invoices" className="mt-0 space-y-4">
                <div className="flex gap-2">
                  <Button disabled={!selectedOffer}>
                    <Plus className="w-4 h-4 mr-2" />
                    Ustvari račun iz izbrane ponudbe
                  </Button>
                  <Button variant="outline" disabled={!selectedOffer}>
                    Predračun
                  </Button>
                  <Button variant="outline" disabled={!selectedOffer}>
                    Delni račun
                  </Button>
                  <Button variant="outline" disabled={!selectedOffer}>
                    Končni račun
                  </Button>
                </div>
                {!selectedOffer && (
                  <p className="text-sm text-muted-foreground">
                    Izberite ponudbo pred ustvarjanjem računov
                  </p>
                )}
                <Card className="p-6 text-center text-muted-foreground">
                  Še ni ustvarjenih računov
                </Card>
              </TabsContent>

              <TabsContent value="files" className="mt-0">
                <Card className="p-12 text-center">
                  <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">Še ni naloženih datotek</p>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Naloži datoteko
                  </Button>
                </Card>
              </TabsContent>

              <TabsContent value="timeline" className="mt-0">
                <Card className="p-6">
                  {timeline.length > 0 ? (
                    <TimelineFeed events={timeline} />
                  ) : (
                    <p className="text-center text-muted-foreground">Še ni dogodkov</p>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
