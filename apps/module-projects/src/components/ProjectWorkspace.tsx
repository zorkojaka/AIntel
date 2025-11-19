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
import { ArrowLeft, Save, Plus, FileText, Package, Truck, Wrench, Receipt, FolderOpen, Clock, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { DeliveryNote, ProjectDetails, PurchaseOrder } from "../types";

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
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(project.workOrders);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(project.purchaseOrders);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>(project.deliveryNotes);
  const [timeline, setTimeline] = useState<TimelineEvent[]>(project.timelineEvents);
  const [status, setStatus] = useState(project.status);
  const [requirements, setRequirements] = useState(project.requirements);

  const basePath = `/api/projects/${project.id}`;

  useEffect(() => {
    setItems(project.items);
    setOffers(project.offers);
    setWorkOrders(project.workOrders);
    setPurchaseOrders(project.purchaseOrders);
    setDeliveryNotes(project.deliveryNotes);
    setTimeline(project.timelineEvents);
    setStatus(project.status);
    setRequirements(project.requirements);
  }, [project]);

  const applyProjectUpdate = (updated: ProjectDetails | null) => {
    if (!updated) return;
    setItems(updated.items);
    setOffers(updated.offers);
    setWorkOrders(updated.workOrders);
    setPurchaseOrders(updated.purchaseOrders);
    setDeliveryNotes(updated.deliveryNotes);
    setTimeline(updated.timelineEvents);
    setStatus(updated.status);
    setRequirements(updated.requirements);
  };

  const validationIssues: string[] = [];
  if (!project.customerDetail.name) validationIssues.push("Manjka podatek o stranki");
  if (items.length === 0) validationIssues.push("Dodajte vsaj eno postavko");

  const handleAddItem = () => {
    toast.success("Postavka dodana");
  };

  const handleEditItem = (item: Item) => {
    toast.info(`Urejanje postavke ${item.name}`);
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
    toast.success("Postavka izbrisana");
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

    const html = renderTemplate(defaultTemplate, {
      customer: project.customerDetail,
      project: {
        id: project.id,
        title: project.title,
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
      customer: project.customerDetail,
      project: {
        id: project.id,
        title: project.title,
        description: requirements,
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
                  onClick={() => setActiveTab("documents")}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                    activeTab === "documents" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  Documents
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
          </div>

          {/* Content */}
          <div className="col-span-9">
            {validationIssues.length > 0 && <ValidationBanner missing={validationIssues} />}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList>
                <TabsTrigger value="items">Postavke</TabsTrigger>
                <TabsTrigger value="offers">Ponudbe</TabsTrigger>
                <TabsTrigger value="logistics">Logistika</TabsTrigger>
                <TabsTrigger value="execution">Izvedba</TabsTrigger>
                <TabsTrigger value="documents">Dokumenti</TabsTrigger>
                <TabsTrigger value="timeline">Zgodovina</TabsTrigger>
              </TabsList>

              <TabsContent value="items" className="mt-0">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="m-0">Postavke</h3>
                  <Button onClick={handleAddItem}>
                    <Plus className="mr-2 h-4 w-4" />
                    Dodaj iz cenika
                  </Button>
                </div>
                <ItemsTable items={items} onEdit={handleEditItem} onAdd={handleAddItem} onDelete={handleDeleteItem} />
              </TabsContent>

              <TabsContent value="offers" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="m-0">Ponudbe</h3>
                    <p className="text-sm text-muted-foreground">Ustvarite nove verzije in spremljajte status.</p>
                  </div>
                  <Button onClick={handleCreateOffer}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova verzija
                  </Button>
                </div>

                <div className="space-y-3">
                  {offers.map((offer) => (
                    <div key={offer.id}>
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
                      {offers.length > 0 ? "Naročilnice bodo generirane ob potrditvi ponudbe" : "Izberite ponudbo za generiranje naročilnic"}
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
                    <SignaturePad onSave={handleSaveSignature} />
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
    </div>
  );
}
