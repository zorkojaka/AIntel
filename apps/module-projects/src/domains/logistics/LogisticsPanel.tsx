import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  MaterialOrder,
  MaterialStatus,
  ProjectLogisticsSnapshot,
  WorkOrder as LogisticsWorkOrder,
  WorkOrderStatus,
} from "@aintel/shared/types/logistics";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

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

type TechnicianOption = {
  id: string;
  name: string;
};

const technicians: TechnicianOption[] = [
  { id: "tech-1", name: "Tehnik 1" },
  { id: "tech-2", name: "Tehnik 2" },
];

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

function selectTechnician(
  id: string,
  update: (payload: { id: string; name: string }) => void,
  technicianList: TechnicianOption[],
) {
  const selected = technicianList.find((tech) => tech.id === id);
  if (!selected) return;
  update({ id: selected.id, name: selected.name });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" }).format(value);
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toISOString().slice(0, 16);
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

export function LogisticsPanel({ projectId, client }: LogisticsPanelProps) {
  const [snapshot, setSnapshot] = useState<ProjectLogisticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [workOrderForm, setWorkOrderForm] = useState<Partial<LogisticsWorkOrder>>({});
  const [materialOrderForm, setMaterialOrderForm] = useState<MaterialOrder | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [locationTouched, setLocationTouched] = useState(false);
  const [savingWorkOrder, setSavingWorkOrder] = useState(false);
  const [issuingOrder, setIssuingOrder] = useState(false);

  const hasConfirmed = useMemo(() => !!snapshot?.confirmedOfferVersionId, [snapshot]);

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
    if (snapshot?.workOrder) {
      setWorkOrderForm({
        ...snapshot.workOrder,
        scheduledAt: snapshot.workOrder.scheduledAt ? formatDateTimeLocal(snapshot.workOrder.scheduledAt) : "",
      });
    }
  }, [snapshot]);

  useEffect(() => {
    setMaterialOrderForm(snapshot?.materialOrder ?? null);
  }, [snapshot?.materialOrder]);

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
    const snapshotAddress = snapshot?.workOrder?.customerAddress;
    const clientAddress = formatClientAddress(client ?? null);
    const desiredAddress = snapshotAddress || clientAddress;
    if (!locationTouched && isBlank(workOrderForm.location) && desiredAddress) {
      setWorkOrderForm((prev) => ({ ...prev, location: desiredAddress }));
    }
  }, [client, snapshot?.workOrder?.customerAddress, locationTouched, workOrderForm.location]);

  const handleConfirmOffer = async (offerId: string) => {
    setConfirmingId(offerId);
    try {
      const response = await fetch(`/api/projects/${projectId}/offers/${offerId}/confirm`, { method: "POST" });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Ponudbe ni mogoče potrditi.");
        return;
      }
      toast.success("Ponudba potrjena.");
      await fetchSnapshot();
    } catch (error) {
      toast.error("Ponudbe ni mogoče potrditi.");
    } finally {
      setConfirmingId(null);
    }
  };

  const handleCancelConfirmation = async () => {
    if (!window.confirm("Res želiš preklicati potrditev ponudbe?")) return;
    setCancelling(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/logistics/cancel-confirmation`, { method: "POST" });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Preklic potrditve ni uspel.");
        return;
      }
      toast.success("Potrditev ponudbe je bila preklicana.");
      await fetchSnapshot();
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

  const handleMaterialStatusChange = (status: MaterialStatus) => {
    setMaterialOrderForm((prev) => (prev ? { ...prev, materialStatus: status } : prev));
  };

  const handleMaterialNextStatus = async (nextStatus: MaterialStatus) => {
    setMaterialOrderForm((prev) => (prev ? { ...prev, materialStatus: nextStatus } : prev));
    await handleSaveWorkOrder({ materialStatus: nextStatus });
  };

  const handleMaterialTechnicianSelect = (technicianId: string) => {
    if (!technicianId || !materialOrderForm) return;
    selectTechnician(
      technicianId,
      ({ id, name }) =>
        setMaterialOrderForm((prev) => (prev ? { ...prev, technicianId: id, technicianName: name } : prev)),
      technicians,
    );
  };

  const handleSaveWorkOrder = async (
    materialOverrides?: Partial<MaterialOrder>,
    workOrderOverrides?: Partial<LogisticsWorkOrder>,
  ) => {
    if (!snapshot?.workOrder) return false;
    const currentMaterial = materialOrderForm ?? snapshot.materialOrder ?? null;
    setSavingWorkOrder(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/work-orders/${snapshot.workOrder._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: workOrderForm.scheduledAt ? new Date(workOrderForm.scheduledAt as string).toISOString() : null,
          technicianName: workOrderForm.technicianName ?? "",
          technicianId: workOrderForm.technicianId ?? "",
          location: workOrderForm.location ?? "",
          notes: workOrderForm.notes ?? "",
          status: workOrderOverrides?.status ?? workOrderForm.status ?? undefined,
          materialOrderId: materialOverrides?._id ?? currentMaterial?._id ?? null,
          materialStatus: materialOverrides?.materialStatus ?? currentMaterial?.materialStatus ?? undefined,
          materialTechnicianId: materialOverrides?.technicianId ?? currentMaterial?.technicianId ?? null,
          materialTechnicianName: materialOverrides?.technicianName ?? currentMaterial?.technicianName ?? null,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Delovnega naloga ni mogoce shraniti.");
        return false;
      }
      const updated: LogisticsWorkOrder = payload.data;
      const mergedWorkOrder = { ...updated, ...(workOrderOverrides ?? {}) };
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              workOrder: mergedWorkOrder,
              materialOrder:
                currentMaterial || materialOverrides
                  ? {
                      ...(currentMaterial ?? prev.materialOrder ?? {}),
                      ...(materialOverrides ?? {}),
                    }
                  : prev.materialOrder,
            }
          : prev,
      );
      if (materialOverrides) {
        setMaterialOrderForm((prev) => (prev ? { ...prev, ...materialOverrides } : prev));
      }
      setWorkOrderForm({
        ...mergedWorkOrder,
        scheduledAt: formatDateTimeLocal(mergedWorkOrder.scheduledAt),
      });
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
    materialOrderForm?.materialStatus ?? snapshot?.materialOrder?.materialStatus ?? null;

  const resolveField = (value?: string | null, fallback?: string | null) => (value ?? fallback ?? "").trim();

  const resolvedCustomerName = resolveField(workOrderForm.customerName, snapshot?.workOrder?.customerName);
  const resolvedCustomerAddress = resolveField(workOrderForm.customerAddress, snapshot?.workOrder?.customerAddress);
  const resolvedCustomerEmail = resolveField(workOrderForm.customerEmail, snapshot?.workOrder?.customerEmail);
  const resolvedCustomerPhone = resolveField(workOrderForm.customerPhone, snapshot?.workOrder?.customerPhone);
  const resolvedSchedule = resolveField(
    typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : undefined,
    snapshot?.workOrder?.scheduledAt ? formatDateTimeLocal(snapshot.workOrder.scheduledAt) : undefined,
  );
  const resolvedTechnicianId = resolveField(workOrderForm.technicianId, snapshot?.workOrder?.technicianId);

  const canIssueOrder =
    effectiveMaterialStatus === "Pripravljeno" &&
    resolvedCustomerName &&
    resolvedCustomerAddress &&
    resolvedCustomerEmail &&
    resolvedCustomerPhone &&
    resolvedSchedule &&
    resolvedTechnicianId;

  const handleIssueWorkOrder = async () => {
    if (!canIssueOrder || issuingOrder) return;
    setIssuingOrder(true);
    setWorkOrderForm((prev) => ({ ...prev, status: "issued" }));
    const saved = await handleSaveWorkOrder(undefined, { status: "issued" });
    if (!saved) {
      setIssuingOrder(false);
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in-progress" }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Status projekta ni bilo mogoče posodobiti.");
        return;
      }
      toast.success("Nalog izdan in projekt v izvedbi.");
      await fetchSnapshot();
    } catch (error) {
      toast.error("Status projekta ni bilo mogoče posodobiti.");
    } finally {
      setIssuingOrder(false);
    }
  };

  const renderMaterialOrder = (materialOrder: MaterialOrder | null) => {
    if (!materialOrder) {
      return <p className="text-sm text-muted-foreground">Naročilo za material bo ustvarjeno ob potrditvi ponudbe.</p>;
    }

    const technicianValue: string | undefined = materialOrder.technicianId ?? undefined;
    const nextStatus = getNextMaterialStatus(materialOrder.materialStatus);

    return (
      <div className="space-y-4">
        <div className="max-w-sm space-y-2">
          <label className="text-sm font-medium">Tehnik</label>
          <Select value={technicianValue} onValueChange={handleMaterialTechnicianSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Izberi tehnika" />
            </SelectTrigger>
            <SelectContent>
              {technicians
                .filter((technician) => technician.id.trim().length > 0)
                .map((technician) => (
                  <SelectItem key={technician.id} value={technician.id}>
                    {technician.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="border rounded-[var(--radius-card)] bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naziv</TableHead>
                <TableHead className="text-right">Količina</TableHead>
                <TableHead>Enota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(materialOrder.items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {nextStatus && (
          <div className="flex justify-end">
            <Button onClick={() => handleMaterialNextStatus(nextStatus)} disabled={savingWorkOrder}>
              {nextStatus}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderWorkOrder = (workOrder: LogisticsWorkOrder | null) => {
    if (!workOrder) {
      return <p className="text-sm text-muted-foreground">Delovni nalog bo ustvarjen ob potrditvi ponudbe.</p>;
    }

    const customerName = workOrder.customerName || client?.name || "";
    const customerAddress = workOrder.customerAddress || formatClientAddress(client ?? null) || "";
    const customerEmail = workOrder.customerEmail || client?.email || "";
    const customerPhone = workOrder.customerPhone || client?.phone || "";
    const technicianValue: string | undefined =
      workOrderForm.technicianId ?? workOrder.technicianId ?? undefined;

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
              <label className="text-sm font-medium">Tehnik</label>
              <Select
                value={technicianValue}
                onValueChange={(id) =>
                  selectTechnician(
                    id,
                    ({ id: technicianId, name }) =>
                      setWorkOrderForm((prev) => ({
                        ...prev,
                        technicianId,
                        technicianName: name,
                      })),
                    technicians,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Izberi tehnika" />
                </SelectTrigger>
                <SelectContent>
                  {technicians
                    .filter((technician) => technician.id.trim().length > 0)
                    .map((technician) => (
                      <SelectItem key={technician.id} value={technician.id}>
                        {technician.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
          <Button onClick={() => handleSaveWorkOrder()} disabled={savingWorkOrder}>
            {savingWorkOrder ? "Shranjujem..." : "Shrani delovni nalog"}
          </Button>
          <Button
            variant="outline"
            onClick={handleIssueWorkOrder}
            disabled={!canIssueOrder || savingWorkOrder || issuingOrder}
          >
            {issuingOrder ? "Dokončujem..." : "Dokončaj naročilo"}
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

  const headerWorkOrderStatus: WorkOrderStatus =
    (workOrderForm.status as WorkOrderStatus) ?? (snapshot?.workOrder?.status as WorkOrderStatus) ?? "draft";

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
                                onClick={() => handleConfirmOffer(offer._id)}
                              >
                                {confirmingId === offer._id ? "Potrjujem..." : "Potrdi to verzijo"}
                              </Button>
                            )}
                            {isAccepted && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={handleCancelConfirmation}
                                disabled={cancelling}
                              >
                                {cancelling ? "Preklicujem..." : "Prekliči potrditev"}
                              </Button>
                            )}
                            {isCancelled && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleConfirmOffer(offer._id)}
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

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="m-0">Naročilo za material</CardTitle>
          {materialOrderForm && (
            <Select
              value={materialOrderForm.materialStatus ?? "Za naročit"}
              onValueChange={(value) => handleMaterialStatusChange(value as MaterialStatus)}
            >
              <SelectTrigger className="h-8 w-fit border border-input bg-background px-3 py-0 focus:ring-0">
                <Badge variant="outline" className="uppercase text-xs tracking-wide px-3 py-1">
                  <SelectValue />
                </Badge>
              </SelectTrigger>
              <SelectContent align="end">
                {materialStatusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>{renderMaterialOrder(materialOrderForm)}</CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="m-0">Delovni nalog</CardTitle>
          {snapshot?.workOrder && (
            <Select
              value={headerWorkOrderStatus}
              onValueChange={(value) => handleWorkOrderChange("status", value)}
            >
              <SelectTrigger className="h-8 w-fit border border-input bg-background px-3 py-0 focus:ring-0">
                <Badge variant="outline" className="uppercase text-xs tracking-wide px-3 py-1">
                  <SelectValue />
                </Badge>
              </SelectTrigger>
              <SelectContent align="end">
                {workOrderStatusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {workOrderStatusLabels[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>{renderWorkOrder(snapshot?.workOrder ?? null)}</CardContent>
      </Card>
    </div>
  );
}
