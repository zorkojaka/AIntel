import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  MaterialOrder,
  MaterialStatus,
  ProjectLogisticsSnapshot,
  WorkOrder as LogisticsWorkOrder,
  WorkOrderStatus,
} from "@aintel/shared/types/logistics";
import type { Employee } from "@aintel/shared/types/employee";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { MaterialOrderCard } from "./MaterialOrderCard";
import { useConfirmOffer } from "../core/useConfirmOffer";
import { useProjectMutationRefresh } from "../core/useProjectMutationRefresh";
import { downloadPdf } from "../../api";
import { Loader2 } from "lucide-react";
import { Checkbox } from "../../components/ui/checkbox";
import { buildTenantHeaders } from "@aintel/shared/utils/tenant";

interface LogisticsPanelProps {
  projectId: string;
  client?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    street?: string | null;
    postalCode?: string | null;
    postalCity?: string | null;
  } | null;
  onWorkOrderUpdated?: (workOrder: LogisticsWorkOrder) => void;
}

const workOrderStatusOptions: WorkOrderStatus[] = ["draft", "issued", "in-progress", "confirmed", "completed"];
const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  draft: "V pripravi",
  issued: "Izdan",
  "in-progress": "V delu",
  confirmed: "Potrjen",
  completed: "Zaključen",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "DRAFT",
  OFFERED: "OFFERED",
  ACCEPTED: "Potrjeno",
  CANCELLED: "Preklicano",
  REJECTED: "Zavrnjeno",
};

const materialStatusOptions: MaterialStatus[] = [
  "Za naročit",
  "Naročeno",
  "Prevzeto",
  "Pripravljeno",
  "Preklicano",
];

const materialStatusSequence: MaterialStatus[] = ["Za naročit", "Naročeno", "Prevzeto", "Pripravljeno"];

function getNextMaterialStatus(current?: MaterialStatus | null) {
  if (!current) return null;
  const index = materialStatusSequence.indexOf(current);
  if (index === -1 || index === materialStatusSequence.length - 1) {
    return null;
  }
  return materialStatusSequence[index + 1];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" }).format(value);
}

type LogisticsClient = NonNullable<LogisticsPanelProps["client"]>;

function formatClientAddress(client?: LogisticsClient | null) {
  if (!client) return "";
  const street = client.street?.trim();
  const postalParts = [client.postalCode, client.postalCity].map((part) => part?.trim()).filter(Boolean);
  const postal = postalParts.join(" ").trim();
  if (street && postal) return `${street}, ${postal}`;
  if (street) return street;
  if (postal) return postal;
  return client.address?.trim() ?? "";
}

function isBlank(value?: string | null) {
  return !value || value.trim().length === 0;
}

function buildOfferLabel(offer: ProjectLogisticsSnapshot["offerVersions"][number]) {
  const baseLabel = offer.title || `Verzija ${offer.versionNumber}`;
  const totalLabel = typeof offer.totalWithVat === "number" ? ` • ${formatCurrency(offer.totalWithVat)}` : "";
  return `${baseLabel}${totalLabel}`;
}

export function LogisticsPanel({ projectId, client, onWorkOrderUpdated }: LogisticsPanelProps) {
  const [snapshot, setSnapshot] = useState<ProjectLogisticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selectedOfferVersionId, setSelectedOfferVersionId] = useState<string | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [workOrderForm, setWorkOrderForm] = useState<Partial<LogisticsWorkOrder>>({});
  const [materialOrderForm, setMaterialOrderForm] = useState<MaterialOrder | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [locationTouched, setLocationTouched] = useState(false);
  const [savingWorkOrder, setSavingWorkOrder] = useState(false);
  const [issuingOrder, setIssuingOrder] = useState(false);
  const [materialDownloading, setMaterialDownloading] = useState<"PURCHASE_ORDER" | "DELIVERY_NOTE" | null>(null);
  const [workOrderDownloading, setWorkOrderDownloading] = useState<"WORK_ORDER" | "WORK_ORDER_CONFIRMATION" | null>(null);

  const hasConfirmed = useMemo(() => !!snapshot?.confirmedOfferVersionId, [snapshot]);
  const confirmedOffers = useMemo(
    () => (snapshot?.offerVersions ?? []).filter((offer) => (offer.status ?? "").toUpperCase() === "ACCEPTED"),
    [snapshot?.offerVersions],
  );
  const offerSelectionOptions = useMemo(
    () =>
      confirmedOffers.map((offer) => ({
        value: offer._id,
        label: buildOfferLabel(offer),
      })),
    [confirmedOffers],
  );
  const workOrders = useMemo(
    () => snapshot?.workOrders ?? (snapshot?.workOrder ? [snapshot.workOrder] : []),
    [snapshot],
  );
  const materialOrders = useMemo(
    () => snapshot?.materialOrders ?? (snapshot?.materialOrder ? [snapshot.materialOrder] : []),
    [snapshot],
  );
  const filteredWorkOrders = useMemo(
    () =>
      workOrders.filter((workOrder) =>
        selectedOfferVersionId ? workOrder.offerVersionId === selectedOfferVersionId : true,
      ),
    [selectedOfferVersionId, workOrders],
  );
  const filteredMaterialOrders = useMemo(
    () =>
      materialOrders.filter((materialOrder) =>
        selectedOfferVersionId ? materialOrder.offerVersionId === selectedOfferVersionId : true,
      ),
    [materialOrders, selectedOfferVersionId],
  );
  const selectedWorkOrder = useMemo(
    () => filteredWorkOrders.find((w) => w._id === selectedWorkOrderId) ?? filteredWorkOrders[0] ?? null,
    [filteredWorkOrders, selectedWorkOrderId],
  );
  const selectedMaterialOrder = useMemo(
    () =>
      selectedWorkOrder
        ? filteredMaterialOrders.find((materialOrder) => materialOrder.workOrderId === selectedWorkOrder._id) ??
          filteredMaterialOrders[0] ??
          null
        : filteredMaterialOrders[0] ?? null,
    [filteredMaterialOrders, selectedWorkOrder],
  );
  const selectedOffer = useMemo(
    () =>
      confirmedOffers.find((offer) => offer._id === selectedOfferVersionId) ??
      confirmedOffers[0] ??
      null,
    [confirmedOffers, selectedOfferVersionId],
  );
  const selectedOfferLabel = selectedOffer ? buildOfferLabel(selectedOffer) : null;

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/logistics`);
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Napaka pri nalaganju logistike.");
        return;
      }
      setSnapshot(payload.data as ProjectLogisticsSnapshot);
    } catch (error) {
      toast.error("Napaka pri nalaganju logistike.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const fetchEmployees = async () => {
      try {
        const response = await fetch("/api/employees", {
          headers: buildTenantHeaders(),
        });
        const payload = await response.json();
        if (!alive) return;
        setEmployees(Array.isArray(payload?.data) ? payload.data : []);
      } catch {
        if (!alive) return;
        setEmployees([]);
      }
    };
    fetchEmployees();
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (confirmedOffers.length === 0) {
      if (selectedOfferVersionId !== null) {
        setSelectedOfferVersionId(null);
      }
      return;
    }
    if (
      !selectedOfferVersionId ||
      !confirmedOffers.some((offer) => offer._id === selectedOfferVersionId)
    ) {
      setSelectedOfferVersionId(confirmedOffers[0]._id);
    }
  }, [confirmedOffers, selectedOfferVersionId]);

  useEffect(() => {
    if (filteredWorkOrders.length === 0) {
      setSelectedWorkOrderId(null);
      return;
    }
    if (!selectedWorkOrderId || !filteredWorkOrders.some((order) => order._id === selectedWorkOrderId)) {
      setSelectedWorkOrderId(filteredWorkOrders[0]._id);
    }
  }, [filteredWorkOrders, selectedWorkOrderId]);

  useEffect(() => {
    if (selectedWorkOrder) {
      setWorkOrderForm({
        ...selectedWorkOrder,
        scheduledAt: selectedWorkOrder.scheduledAt ?? "",
        assignedEmployeeIds: Array.isArray(selectedWorkOrder.assignedEmployeeIds)
          ? selectedWorkOrder.assignedEmployeeIds
          : [],
      });
    } else {
      setWorkOrderForm({});
    }
  }, [selectedWorkOrder]);

  useEffect(() => {
    setMaterialOrderForm(selectedMaterialOrder ?? null);
  }, [selectedMaterialOrder]);

  useEffect(() => {
    if (!client) return;
    const formattedAddress = formatClientAddress(client);
    setWorkOrderForm((prev) => {
      const updates: Partial<LogisticsWorkOrder> = {};
      if (!emailTouched && isBlank(prev.customerEmail) && client.email) {
        updates.customerEmail = client.email;
      }
      if (!phoneTouched && isBlank(prev.customerPhone) && client.phone) {
        updates.customerPhone = client.phone;
      }
      if (!locationTouched && isBlank(prev.location) && formattedAddress) {
        updates.location = formattedAddress;
      }
      if (Object.keys(updates).length === 0) {
        return prev;
      }
      return { ...prev, ...updates };
    });
  }, [client, emailTouched, phoneTouched, locationTouched]);

  useEffect(() => {
    const snapshotAddress = selectedWorkOrder?.customerAddress;
    const clientAddress = formatClientAddress(client ?? null);
    const desiredAddress = snapshotAddress || clientAddress;
    if (!locationTouched && isBlank(workOrderForm.location) && desiredAddress) {
      setWorkOrderForm((prev) => ({ ...prev, location: desiredAddress }));
    }
  }, [client, selectedWorkOrder?.customerAddress, locationTouched, workOrderForm.location]);

  const refreshAfterMutation = useProjectMutationRefresh(projectId);
  const { confirmOffer, confirmingId } = useConfirmOffer({
    projectId,
    onConfirmed: fetchSnapshot,
  });

  const handleCancelConfirmation = async (offerId: string) => {
    if (!window.confirm("Res želiš preklicati potrditev ponudbe?")) return;
    setCancelling(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/logistics/cancel-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerVersionId: offerId }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Preklic potrditve ni uspel.");
        return;
      }
      toast.success("Potrditev ponudbe je bila preklicana.");
      await refreshAfterMutation(fetchSnapshot);
    } catch (error) {
      toast.error("Preklic potrditve ni uspel.");
    } finally {
      setCancelling(false);
    }
  };

  const handleWorkOrderChange = (field: keyof LogisticsWorkOrder, value: unknown) => {
    if (field === "location") setLocationTouched(true);
    if (field === "customerEmail") setEmailTouched(true);
    if (field === "customerPhone") setPhoneTouched(true);
    setWorkOrderForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAssignedEmployee = (employeeId: string) => {
    setWorkOrderForm((prev) => {
      const current = Array.isArray(prev.assignedEmployeeIds) ? prev.assignedEmployeeIds : [];
      const next = current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId];
      return { ...prev, assignedEmployeeIds: next };
    });
  };

  const handleMaterialStatusChange = (status: MaterialStatus) => {
    if (!materialOrderForm) return;
    setMaterialOrderForm((prev) => (prev ? { ...prev, materialStatus: status } : prev));
  };

  const handleMaterialNextStatus = async (nextStatus: MaterialStatus) => {
    if (!materialOrderForm) return;
    setMaterialOrderForm((prev) => (prev ? { ...prev, materialStatus: nextStatus } : prev));
    await handleSaveWorkOrder({ materialStatus: nextStatus });
  };

  const handleDownloadMaterialPdf = async (docType: "PURCHASE_ORDER" | "DELIVERY_NOTE") => {
    const target = materialOrderForm ?? selectedMaterialOrder ?? null;
    if (!target?._id) {
      toast.error("Naročilo še ni pripravljeno za izvoz.");
      return;
    }
    setMaterialDownloading(docType);
    try {
      const url = `/api/projects/${projectId}/material-orders/${target._id}/pdf?docType=${docType}`;
      const prefix = docType === "DELIVERY_NOTE" ? "dobavnica" : "narocilo";
      const filename = `${prefix}-${projectId}-${target._id}.pdf`;
      await downloadPdf(url, filename);
      toast.success("PDF prenesen.");
    } catch (error) {
      console.error(error);
      toast.error("Prenos PDF ni uspel.");
    } finally {
      setMaterialDownloading(null);
    }
  };

  const handleDownloadWorkOrderPdf = async (docType: "WORK_ORDER" | "WORK_ORDER_CONFIRMATION") => {
    const target = selectedWorkOrder ?? null;
    if (!target?._id) {
      toast.error("Delovni nalog ni izbran.");
      return;
    }
    setWorkOrderDownloading(docType);
    try {
      const url = `/api/projects/${projectId}/work-orders/${target._id}/pdf?docType=${docType}`;
      const prefix = docType === "WORK_ORDER_CONFIRMATION" ? "potrdilo" : "delovni-nalog";
      const filename = `${prefix}-${projectId}-${target._id}.pdf`;
      await downloadPdf(url, filename);
      toast.success("PDF prenesen.");
    } catch (error) {
      console.error(error);
      toast.error("Prenos PDF ni uspel.");
    } finally {
      setWorkOrderDownloading(null);
    }
  };

  const handleSaveWorkOrder = async (
    materialOverrides?: Partial<MaterialOrder>,
    workOrderOverrides?: Partial<LogisticsWorkOrder>,
  ) => {
    if (!selectedWorkOrder) return false;
    const currentMaterial = materialOrderForm ?? selectedMaterialOrder ?? null;
    setSavingWorkOrder(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/work-orders/${selectedWorkOrder._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: selectedWorkOrder._id,
          scheduledAt: typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : null,
          assignedEmployeeIds: Array.isArray(workOrderForm.assignedEmployeeIds) ? workOrderForm.assignedEmployeeIds : [],
          location: workOrderForm.location ?? "",
          notes: workOrderForm.notes ?? "",
          status: workOrderOverrides?.status ?? workOrderForm.status ?? undefined,
          materialOrderId: materialOverrides?._id ?? currentMaterial?._id ?? null,
          materialStatus: materialOverrides?.materialStatus ?? currentMaterial?.materialStatus ?? undefined,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Delovnega naloga ni mogoce shraniti.");
        return false;
      }
      const updated: LogisticsWorkOrder = payload.data;
      const mergedWorkOrder = { ...updated, ...(workOrderOverrides ?? {}) };
      const mergedMaterial =
        currentMaterial && currentMaterial._id
          ? { ...currentMaterial, ...(materialOverrides ?? {}) }
          : currentMaterial;
      setSnapshot((prev) => {
        if (!prev) return prev;

        const previousWorkOrders = prev.workOrders?.length
          ? prev.workOrders
          : prev.workOrder
            ? [prev.workOrder]
            : [];
        const hasWorkOrder = previousWorkOrders.some((workOrder) => workOrder._id === mergedWorkOrder._id);
        const nextWorkOrders = hasWorkOrder
          ? previousWorkOrders.map((workOrder) => (workOrder._id === mergedWorkOrder._id ? mergedWorkOrder : workOrder))
          : [...previousWorkOrders, mergedWorkOrder];

        const previousMaterialOrders = prev.materialOrders?.length
          ? prev.materialOrders
          : prev.materialOrder
            ? [prev.materialOrder]
            : [];
        const nextMaterialOrders = mergedMaterial && mergedMaterial._id
          ? previousMaterialOrders.some((materialOrder) => materialOrder._id === mergedMaterial._id)
            ? previousMaterialOrders.map((materialOrder) =>
                materialOrder._id === mergedMaterial._id ? mergedMaterial : materialOrder,
              )
            : [...previousMaterialOrders, mergedMaterial]
          : previousMaterialOrders;

        const selectedMaterial = nextMaterialOrders.find((order) => order.workOrderId === mergedWorkOrder._id) ?? null;

        return {
          ...prev,
          workOrders: nextWorkOrders,
          workOrder: mergedWorkOrder,
          materialOrders: nextMaterialOrders,
          materialOrder: selectedMaterial ?? nextMaterialOrders[0] ?? null,
        };
      });
      if (mergedMaterial) {
        setMaterialOrderForm((prev) => (prev ? { ...prev, ...(materialOverrides ?? {}), ...mergedMaterial } : mergedMaterial));
      }
      setWorkOrderForm({
        ...mergedWorkOrder,
        scheduledAt: mergedWorkOrder.scheduledAt ?? "",
      });
      if (onWorkOrderUpdated) {
        onWorkOrderUpdated(mergedWorkOrder);
      }
      await refreshAfterMutation(fetchSnapshot);
      toast.success("Delovni nalog posodobljen.");
      return true;
    } catch (error) {
      toast.error("Delovnega naloga ni mogoce shraniti.");
      return false;
    } finally {
      setSavingWorkOrder(false);
    }
  };

  const effectiveMaterialStatus: MaterialStatus | null =
    materialOrderForm?.materialStatus ?? selectedMaterialOrder?.materialStatus ?? null;
  const nextMaterialStatus = getNextMaterialStatus(effectiveMaterialStatus);

  const resolveField = (value?: string | null, fallback?: string | null) => (value ?? fallback ?? "").trim();

  const resolvedCustomerName = resolveField(workOrderForm.customerName, selectedWorkOrder?.customerName);
  const resolvedCustomerAddress = resolveField(workOrderForm.customerAddress, selectedWorkOrder?.customerAddress);
  const resolvedCustomerEmail = resolveField(workOrderForm.customerEmail, selectedWorkOrder?.customerEmail);
    const resolvedCustomerPhone = resolveField(workOrderForm.customerPhone, selectedWorkOrder?.customerPhone);
    const resolvedSchedule = resolveField(
      typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : undefined,
      selectedWorkOrder?.scheduledAt ?? undefined,
    );
  const hasAssignedTeam = (workOrderForm.assignedEmployeeIds ?? selectedWorkOrder?.assignedEmployeeIds ?? []).length > 0;

  const canIssueOrder =
    effectiveMaterialStatus === "Pripravljeno" &&
    resolvedCustomerName &&
    resolvedCustomerAddress &&
    resolvedCustomerEmail &&
    resolvedCustomerPhone &&
    resolvedSchedule &&
    hasAssignedTeam;

  const handleIssueWorkOrder = async () => {
    if (!canIssueOrder || issuingOrder || !selectedWorkOrder) return;
    setIssuingOrder(true);
    setWorkOrderForm((prev) => ({ ...prev, status: "issued" }));
    const saved = await handleSaveWorkOrder(undefined, { status: "issued" });
    if (saved) {
      toast.success("Delovni nalog izdan.");
    }
    setIssuingOrder(false);
  };

  const renderWorkOrder = (workOrder: LogisticsWorkOrder | null) => {
    if (!workOrder) {
      return <p className="text-sm text-muted-foreground">Delovni nalog bo ustvarjen ob potrditvi ponudbe.</p>;
    }

    const customerName = workOrder.customerName || client?.name || "";
    const customerAddress = workOrder.customerAddress || formatClientAddress(client ?? null) || "";
    const customerEmail = workOrder.customerEmail || client?.email || "";
    const customerPhone = workOrder.customerPhone || client?.phone || "";
    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Stranka</label>
              <p className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">{customerName || "-"}</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Naslov</label>
              <p className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">{customerAddress || "-"}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                value={workOrderForm.customerEmail ?? ""}
                onChange={(e) => handleWorkOrderChange("customerEmail", e.target.value)}
                placeholder={customerEmail || "Email stranke"}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Telefon</label>
              <Input
                value={workOrderForm.customerPhone ?? ""}
                onChange={(e) => handleWorkOrderChange("customerPhone", e.target.value)}
                placeholder={customerPhone || "Telefon stranke"}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Termin izvedbe</label>
              <Input
                type="datetime-local"
                value={(workOrderForm.scheduledAt as string) ?? ""}
                onChange={(e) => handleWorkOrderChange("scheduledAt", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tehniki (ekipa)</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {employees.filter((employee) => employee.active).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ni zaposlenih.</p>
                ) : (
                  employees
                    .filter((employee) => employee.active)
                    .map((employee) => (
                    <label key={employee.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        checked={(workOrderForm.assignedEmployeeIds ?? []).includes(employee.id)}
                        onChange={() => toggleAssignedEmployee(employee.id)}
                      />
                      {employee.name}
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Status materiala</label>
              <p className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                {effectiveMaterialStatus ?? "-"}
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Opombe</label>
          <Textarea
            value={workOrderForm.notes ?? ""}
            onChange={(e) => handleWorkOrderChange("notes", e.target.value)}
            placeholder="Navodila za tehnika"
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleSaveWorkOrder()} disabled={savingWorkOrder}>
            {savingWorkOrder ? "Shranjujem..." : "Shrani podatke"}
          </Button>
          <Button onClick={handleIssueWorkOrder} disabled={!canIssueOrder || savingWorkOrder || issuingOrder}>
            {issuingOrder ? "Izdajam..." : "Izdaj nalog"}
          </Button>
        </div>
        <div className="border rounded-[var(--radius-card)] bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikel</TableHead>
                <TableHead className="text-right">Količina</TableHead>
                <TableHead>Enota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(workOrder.items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const shouldShowOfferSelector = confirmedOffers.length > 0;
  const shouldRenderOfferDropdown = confirmedOffers.length > 1;

  const headerWorkOrderStatus: WorkOrderStatus =
    (workOrderForm.status as WorkOrderStatus) ?? (selectedWorkOrder?.status as WorkOrderStatus) ?? "draft";
  const canDownloadMaterialPdf = !!(materialOrderForm ?? selectedMaterialOrder ?? null)?._id;
  const canDownloadWorkOrderPdf = !!selectedWorkOrder?._id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Verzije ponudb</CardTitle>
          {hasConfirmed && snapshot?.confirmedOfferVersionId && (
            <Badge variant="secondary">Potrjeno: {snapshot.confirmedOfferVersionId}</Badge>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Nalaganje...</p>
          ) : snapshot ? (
            <div className="border rounded-[var(--radius-card)] bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Verzija</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Skupaj z DDV</TableHead>
                    <TableHead>Akcije</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(snapshot.offerVersions ?? []).map((offer) => {
                    const statusKey = (offer.status ?? "").toUpperCase();
                    const statusLabel = STATUS_LABELS[statusKey] ?? offer.status ?? "";
                    const isConfirmed = snapshot.confirmedOfferVersionId === offer._id;
                    const isAccepted = statusKey === "ACCEPTED";
                    const isCancelled = statusKey === "CANCELLED";
                    return (
                      <TableRow key={offer._id}>
                        <TableCell className="font-medium flex items-center gap-2">
                          {offer.title}
                          {isConfirmed && <Badge variant="secondary">Potrjeno</Badge>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="uppercase text-xs tracking-wide">
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(offer.totalWithVat ?? 0)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {!isAccepted && !isCancelled && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={confirmingId === offer._id}
                                onClick={() => confirmOffer(offer._id)}
                              >
                                {confirmingId === offer._id ? "Potrjujem..." : "Potrdi to verzijo"}
                              </Button>
                            )}
                            {isAccepted && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleCancelConfirmation(offer._id)}
                                disabled={cancelling}
                              >
                                {cancelling ? "Preklicujem..." : "Prekliči potrditev"}
                              </Button>
                            )}
                            {isCancelled && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => confirmOffer(offer._id)}
                                disabled={confirmingId === offer._id}
                              >
                                {confirmingId === offer._id ? "Potrjujem..." : "Ponovno potrdi verzijo"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Ni podatkov.</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6 rounded-[var(--radius-card)] border border-border/60 bg-card/30 p-4">
        {shouldShowOfferSelector && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Priprava za ponudbo</p>
              <p className="text-base font-semibold">{selectedOfferLabel ?? "Izberi potrjeno ponudbo"}</p>
            </div>
            {shouldRenderOfferDropdown ? (
              <Select value={selectedOfferVersionId ?? ""} onValueChange={(value) => setSelectedOfferVersionId(value)}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Izberi potrjeno ponudbo" />
                </SelectTrigger>
                <SelectContent align="end">
                  {offerSelectionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              selectedOfferLabel && (
                <Badge variant="outline" className="px-3 py-1 text-sm font-medium">
                  {selectedOfferLabel}
                </Badge>
              )
            )}
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Material</p>
              <CardTitle className="mt-1">Naročilo za material</CardTitle>
              <p className="text-sm text-muted-foreground">Upravljaj status naročila in spremljaj pripravo materiala.</p>
            </div>
            {materialOrderForm && (
              <div className="flex flex-col gap-1 text-right">
                <span className="text-xs uppercase text-muted-foreground">Status naročila</span>
                <Select
                  value={materialOrderForm.materialStatus ?? "Za naročit"}
                  onValueChange={(value) => handleMaterialStatusChange(value as MaterialStatus)}
                >
                  <SelectTrigger className="h-10 w-[200px] border border-input bg-background focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {materialStatusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">PDF izvozi</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownloadMaterialPdf("PURCHASE_ORDER")}
                  disabled={!canDownloadMaterialPdf || (materialDownloading !== null && materialDownloading !== "PURCHASE_ORDER")}
                >
                  {materialDownloading === "PURCHASE_ORDER" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Prenesi naročilnico
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownloadMaterialPdf("DELIVERY_NOTE")}
                  disabled={!canDownloadMaterialPdf || (materialDownloading !== null && materialDownloading !== "DELIVERY_NOTE")}
                >
                  {materialDownloading === "DELIVERY_NOTE" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Prenesi dobavnico
                </Button>
              </div>
            </div>
            <MaterialOrderCard
              materialOrder={materialOrderForm}
              nextStatus={nextMaterialStatus}
              onAdvanceStatus={handleMaterialNextStatus}
              savingWorkOrder={savingWorkOrder}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Izvedba</p>
              <CardTitle className="mt-1">Delovni nalog</CardTitle>
              <p className="text-sm text-muted-foreground">Dodeli ekipo, spremljaj napredek in izvozi PDF.</p>
            </div>
            {selectedWorkOrder && (
              <div className="flex flex-col gap-1 text-right">
                <span className="text-xs uppercase text-muted-foreground">Status naloga</span>
                <Select value={headerWorkOrderStatus} onValueChange={(value) => handleWorkOrderChange("status", value)}>
                  <SelectTrigger className="h-10 w-[200px] border border-input bg-background focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {workOrderStatusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {workOrderStatusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {filteredWorkOrders.length > 0 ? (
                <Select value={selectedWorkOrder?._id ?? ""} onValueChange={(id) => setSelectedWorkOrderId(id)}>
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="Izberi delovni nalog" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredWorkOrders.map((wo, index) => (
                      <SelectItem key={wo._id} value={wo._id}>
                        {wo.title || `Delovni nalog #${wo.sequence ?? index + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-muted-foreground">Delovni nalog še ni ustvarjen.</span>
              )}
              {selectedWorkOrder && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadWorkOrderPdf("WORK_ORDER")}
                    disabled={!canDownloadWorkOrderPdf || (workOrderDownloading !== null && workOrderDownloading !== "WORK_ORDER")}
                  >
                    {workOrderDownloading === "WORK_ORDER" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Prenesi nalog
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadWorkOrderPdf("WORK_ORDER_CONFIRMATION")}
                    disabled={
                      !canDownloadWorkOrderPdf || (workOrderDownloading !== null && workOrderDownloading !== "WORK_ORDER_CONFIRMATION")
                    }
                  >
                    {workOrderDownloading === "WORK_ORDER_CONFIRMATION" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Potrditev izvedbe
                  </Button>
                </div>
              )}
            </div>
            {renderWorkOrder(selectedWorkOrder)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
