import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ProjectLogistics } from "@aintel/shared/types/projects/Logistics";
import type { MaterialOrder, WorkOrder, WorkOrderStatus } from "@aintel/shared/types/logistics";
import { SignaturePad } from "./SignaturePad";

interface ExecutionPanelProps {
  projectId: string;
  logistics?: ProjectLogistics | null;
  onSaveSignature: (signature: string, signerName: string) => void | Promise<void>;
  onWorkOrderUpdated?: (workOrder: WorkOrder) => void;
}

const STATUS_OPTIONS: { value: WorkOrderStatus; label: string }[] = [
  { value: "draft", label: "V pripravi" },
  { value: "issued", label: "Izdan" },
  { value: "in-progress", label: "V delu" },
  { value: "confirmed", label: "Potrjen" },
  { value: "completed", label: "Zaključen" },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Ni določen";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Ni določen";
  return date.toLocaleString("sl-SI", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getMaterialForWorkOrder(materialOrders: MaterialOrder[], workOrderId: string) {
  return materialOrders.find((materialOrder) => materialOrder.workOrderId === workOrderId) ?? null;
}

export function ExecutionPanel({ projectId, logistics, onSaveSignature, onWorkOrderUpdated }: ExecutionPanelProps) {
  const workOrders = logistics?.workOrders ?? [];
  const materialOrders = logistics?.materialOrders ?? [];
  const [drafts, setDrafts] = useState<
    Record<string, { status: WorkOrderStatus; executionNote: string }>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const workOrdersByStatus = useMemo(() => {
    const grouped: Record<WorkOrderStatus, WorkOrder[]> = {
      draft: [],
      issued: [],
      "in-progress": [],
      confirmed: [],
      completed: [],
    };
    workOrders.forEach((order) => {
      const status = (order.status ?? "draft") as WorkOrderStatus;
      if (!grouped[status]) {
        grouped[status] = [];
      }
      grouped[status].push(order);
    });
    return grouped;
  }, [workOrders]);

  const getDraftValues = (order: WorkOrder) =>
    drafts[order._id] ?? {
      status: order.status,
      executionNote: order.executionNote ?? "",
    };

  const updateDraft = (order: WorkOrder, values: Partial<{ status: WorkOrderStatus; executionNote: string }>) => {
    setDrafts((prev) => {
      const current = getDraftValues(order);
      return {
        ...prev,
        [order._id]: {
          ...current,
          ...values,
        },
      };
    });
  };

  const handleSave = async (order: WorkOrder) => {
    const draft = getDraftValues(order);
    setSavingId(order._id);
    try {
      const response = await fetch(`/api/projects/${projectId}/work-orders/${order._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: order._id,
          status: draft.status,
          executionNote: draft.executionNote?.trim() ? draft.executionNote : null,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Delovnega naloga ni mogoče posodobiti.");
        return;
      }
      const updated: WorkOrder = payload.data;
      setDrafts((prev) => ({
        ...prev,
        [order._id]: {
          status: updated.status,
          executionNote: updated.executionNote ?? "",
        },
      }));
      onWorkOrderUpdated?.(updated);
      toast.success("Delovni nalog posodobljen.");
    } catch (error) {
      toast.error("Delovnega naloga ni mogoče posodobiti.");
    } finally {
      setSavingId(null);
    }
  };

  const hasWorkOrders = workOrders.length > 0;

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        {STATUS_OPTIONS.map((statusOption) => {
          const entries = workOrdersByStatus[statusOption.value] ?? [];
          if (entries.length === 0) {
            return null;
          }
          return (
            <Card key={statusOption.value}>
              <CardHeader>
                <CardTitle>{statusOption.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {entries.map((order) => {
                  const draft = getDraftValues(order);
                  const materialOrder = getMaterialForWorkOrder(materialOrders, order._id);
                  const isSaving = savingId === order._id;
                  return (
                    <div key={order._id} className="rounded-lg border p-4 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">{order.customerName || "Neznana stranka"}</p>
                          <p className="text-sm text-muted-foreground">
                            {order.customerAddress || "Naslov ni zapisan"}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground text-right space-y-1">
                          <div>{formatDateTime(order.scheduledAt)}</div>
                          <div>{order.technicianName || "Ni dodeljenega tehnika"}</div>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground uppercase">Status materiala</p>
                          <Badge variant="secondary">
                            {materialOrder?.materialStatus ?? "Ni podatka"}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground uppercase">Status delovnega naloga</label>
                          <Select
                            value={draft.status}
                            onValueChange={(value) =>
                              updateDraft(order, { status: value as WorkOrderStatus })
                            }
                            disabled={isSaving}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Opombe ob izvedbi</label>
                        <Textarea
                          value={draft.executionNote}
                          onChange={(event) => updateDraft(order, { executionNote: event.target.value })}
                          placeholder="Opis dodatnih del, materiala ali opažanj na terenu."
                          rows={4}
                          disabled={isSaving}
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={() => handleSave(order)} disabled={isSaving}>
                          {isSaving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Shranjujem...
                            </>
                          ) : (
                            "Shrani"
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
        {!hasWorkOrders && (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              Delovni nalogi še niso na voljo. Potrdite ponudbo in pripravite logistiko za prikaz izvedbe.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Potrditev zaključka</h3>
        <Card className="p-6">
          <SignaturePad onSign={onSaveSignature} />
        </Card>
      </div>
    </div>
  );
}
