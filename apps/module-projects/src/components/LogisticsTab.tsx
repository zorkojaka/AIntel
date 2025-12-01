import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  MaterialOrder,
  ProjectLogisticsSnapshot,
  WorkOrder as LogisticsWorkOrder,
} from "@aintel/shared/types/logistics";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface LogisticsTabProps {
  projectId: string;
}

const workOrderStatuses = ["draft", "scheduled", "in_progress", "completed", "cancelled"] as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" }).format(value);
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toISOString().slice(0, 16);
}

export function LogisticsTab({ projectId }: LogisticsTabProps) {
  const [snapshot, setSnapshot] = useState<ProjectLogisticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [workOrderForm, setWorkOrderForm] = useState<Partial<LogisticsWorkOrder>>({});
  const [savingWorkOrder, setSavingWorkOrder] = useState(false);

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

  const handleConfirmOffer = async (offerId: string) => {
    setConfirmingId(offerId);
    try {
      const response = await fetch(`/api/projects/${projectId}/offers/${offerId}/confirm`, { method: "POST" });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Ponudbe ni mogoče potrditi.");
        return;
      }
      setSnapshot(payload.data as ProjectLogisticsSnapshot);
      toast.success("Ponudba potrjena.");
    } catch (error) {
      toast.error("Ponudbe ni mogoče potrditi.");
    } finally {
      setConfirmingId(null);
    }
  };

  const handleWorkOrderChange = (field: keyof LogisticsWorkOrder, value: unknown) => {
    setWorkOrderForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveWorkOrder = async () => {
    if (!snapshot?.workOrder) return;
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
          status: workOrderForm.status ?? undefined,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Delovnega naloga ni mogoče shraniti.");
        return;
      }
      const updated: LogisticsWorkOrder = payload.data;
      setSnapshot((prev) => (prev ? { ...prev, workOrder: updated } : prev));
      setWorkOrderForm({ ...updated, scheduledAt: formatDateTimeLocal(updated.scheduledAt) });
      toast.success("Delovni nalog posodobljen.");
    } catch (error) {
      toast.error("Delovnega naloga ni mogoče shraniti.");
    } finally {
      setSavingWorkOrder(false);
    }
  };

  const renderMaterialOrder = (materialOrder: MaterialOrder | null) => {
    if (!materialOrder) {
      return <p className="text-sm text-muted-foreground">Naročilo za material bo ustvarjeno ob potrditvi ponudbe.</p>;
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h4 className="text-base font-semibold m-0">Naročilo za material</h4>
          <Badge variant="outline" className="uppercase text-xs tracking-wide">
            {materialOrder.status}
          </Badge>
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
      </div>
    );
  };

  const renderWorkOrder = (workOrder: LogisticsWorkOrder | null) => {
    if (!workOrder) {
      return <p className="text-sm text-muted-foreground">Delovni nalog bo ustvarjen ob potrditvi ponudbe.</p>;
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h4 className="text-base font-semibold m-0">Delovni nalog</h4>
          <Badge variant="outline" className="uppercase text-xs tracking-wide">
            {workOrder.status}
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Termin izvedbe</label>
            <Input
              type="datetime-local"
              value={(workOrderForm.scheduledAt as string) ?? ""}
              onChange={(e) => handleWorkOrderChange("scheduledAt", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Ime tehnika</label>
            <Input
              value={workOrderForm.technicianName ?? ""}
              onChange={(e) => handleWorkOrderChange("technicianName", e.target.value)}
              placeholder="Tehnik"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">ID tehnika</label>
            <Input
              value={workOrderForm.technicianId ?? ""}
              onChange={(e) => handleWorkOrderChange("technicianId", e.target.value)}
              placeholder="ID"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Lokacija</label>
            <Input
              value={workOrderForm.location ?? ""}
              onChange={(e) => handleWorkOrderChange("location", e.target.value)}
              placeholder="Naslov montaže"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Status</label>
            <Select
              value={(workOrderForm.status as string) ?? workOrder.status}
              onValueChange={(value) => handleWorkOrderChange("status", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Izberi status" />
              </SelectTrigger>
              <SelectContent>
                {workOrderStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Opombe</label>
            <Textarea
              value={workOrderForm.notes ?? ""}
              onChange={(e) => handleWorkOrderChange("notes", e.target.value)}
              placeholder="Navodila za tehnika"
              rows={3}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSaveWorkOrder} disabled={savingWorkOrder}>
            {savingWorkOrder ? "Shranjujem..." : "Shrani delovni nalog"}
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
                    const isConfirmed = snapshot.confirmedOfferVersionId === offer._id;
                    const isAccepted = offer.status === "accepted";
                    return (
                      <TableRow key={offer._id}>
                        <TableCell className="font-medium flex items-center gap-2">
                          {offer.title}
                          {isConfirmed && <Badge variant="secondary">Potrjeno</Badge>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="uppercase text-xs tracking-wide">
                            {offer.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(offer.totalWithVat)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isAccepted || confirmingId === offer._id}
                            onClick={() => handleConfirmOffer(offer._id)}
                          >
                            {isAccepted ? "Potrjeno" : confirmingId === offer._id ? "Potrjujem..." : "Potrdi to verzijo"}
                          </Button>
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
        <CardHeader>
          <CardTitle>Naročilo za material</CardTitle>
        </CardHeader>
        <CardContent>{renderMaterialOrder(snapshot?.materialOrder ?? null)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delovni nalog</CardTitle>
        </CardHeader>
        <CardContent>{renderWorkOrder(snapshot?.workOrder ?? null)}</CardContent>
      </Card>
    </div>
  );
}
