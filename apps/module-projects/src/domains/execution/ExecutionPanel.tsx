import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Checkbox } from "../../components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../../components/ui/command";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import type { ProjectLogistics } from "@aintel/shared/types/projects/Logistics";
import type { MaterialOrder, WorkOrder, WorkOrderItem, WorkOrderStatus } from "@aintel/shared/types/logistics";
import type { PriceListSearchItem } from "@aintel/shared/types/price-list";
import { SignaturePad } from "./SignaturePad";

interface ExecutionPanelProps {
  projectId: string;
  logistics?: ProjectLogistics | null;
  onSaveSignature: (signature: string, signerName: string) => void | Promise<void>;
  onWorkOrderUpdated?: (workOrder: WorkOrder) => void;
}

type WorkOrderDraft = {
  status: WorkOrderStatus;
  executionNote: string;
  items: WorkOrder["items"];
};

type WorkOrderItemDraft = WorkOrderItem;

function mergeDraftItems(
  serverItems: WorkOrderItemDraft[],
  previousItems: WorkOrderItemDraft[],
): WorkOrderItemDraft[] {
  if (previousItems.length === 0) {
    return serverItems;
  }
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  return serverItems.map((serverItem) => {
    const previousItem = previousById.get(serverItem.id);
    if (!previousItem) {
      return serverItem;
    }
    return {
      ...previousItem,
      ...serverItem,
      offeredQuantity:
        typeof serverItem.offeredQuantity === "number"
          ? serverItem.offeredQuantity
          : previousItem.offeredQuantity,
      plannedQuantity:
        typeof serverItem.plannedQuantity === "number"
          ? serverItem.plannedQuantity
          : previousItem.plannedQuantity,
      executedQuantity:
        typeof serverItem.executedQuantity === "number"
          ? serverItem.executedQuantity
          : previousItem.executedQuantity,
      itemNote:
        serverItem.itemNote === null
          ? null
          : typeof serverItem.itemNote === "string"
            ? serverItem.itemNote
            : previousItem.itemNote,
      isExtra:
        typeof serverItem.isExtra === "boolean"
          ? serverItem.isExtra
          : previousItem.isExtra,
      isCompleted:
        typeof serverItem.isCompleted === "boolean"
          ? serverItem.isCompleted
          : previousItem.isCompleted,
    };
  });
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
  const [pendingWorkOrders, setPendingWorkOrders] = useState<Record<string, WorkOrderDraft>>({});
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [priceSearchRowId, setPriceSearchRowId] = useState<string | null>(null);
  const [priceSearchTerm, setPriceSearchTerm] = useState("");
  const [priceSearchResults, setPriceSearchResults] = useState<PriceListSearchItem[]>([]);
  const [priceSearchLoading, setPriceSearchLoading] = useState(false);
  const priceSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWorkOrdersRef = useRef<Record<string, WorkOrderDraft>>({});
  useEffect(() => {
    pendingWorkOrdersRef.current = pendingWorkOrders;
  }, [pendingWorkOrders]);
  const [savingStates, setSavingStates] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, boolean>>({});

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

  const getInitialDraftValues = (order: WorkOrder) => ({
    status: order.status,
    executionNote: order.executionNote ?? "",
    items: (order.items ?? []).map((item: WorkOrderItemDraft) => ({
      ...item,
      offeredQuantity:
        typeof item.offeredQuantity === "number"
          ? item.offeredQuantity
          : typeof item.quantity === "number"
            ? item.quantity
            : 0,
      plannedQuantity:
        typeof item.plannedQuantity === "number"
          ? item.plannedQuantity
          : typeof item.quantity === "number"
            ? item.quantity
            : 0,
      executedQuantity:
        typeof item.executedQuantity === "number"
          ? item.executedQuantity
          : typeof item.quantity === "number"
            ? item.quantity
            : 0,
      itemNote: item.itemNote ?? "",
      isExtra: !!item.isExtra,
      isCompleted: !!item.isCompleted,
    })),
  });

  const getDraftValues = (order: WorkOrder) =>
    pendingWorkOrdersRef.current[order._id] ?? getInitialDraftValues(order);

  const updateDraft = (
    order: WorkOrder,
    values: Partial<{
      status: WorkOrderStatus;
      executionNote: string;
      items: WorkOrder["items"];
    }>
  ) => {
    setPendingWorkOrders((prev) => {
      const current = prev[order._id] ?? getInitialDraftValues(order);
      return {
        ...prev,
        [order._id]: {
          ...current,
          ...values,
        },
      };
    });
  };

  const updateDraftItem = (
    order: WorkOrder,
    itemId: string,
    values: Partial<WorkOrder["items"][number]>
  ) => {
    setPendingWorkOrders((prev) => {
      const current = prev[order._id] ?? getInitialDraftValues(order);
      const nextItems = current.items.map((item: WorkOrderItemDraft) =>
        item.id === itemId
          ? {
              ...item,
              ...values,
              quantity:
                typeof values.plannedQuantity === "number" ? values.plannedQuantity : item.quantity,
            }
          : item
      );
      return {
        ...prev,
        [order._id]: {
          ...current,
          items: nextItems,
        },
      };
    });
  };

  const handleAddExtraItem = (order: WorkOrder) => {
    const id =
      typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newItem: WorkOrder["items"][number] = {
      id,
      productId: null,
      name: "",
      quantity: 0,
      unit: "",
      note: "",
      offerItemId: null,
      offeredQuantity: 0,
      plannedQuantity: 0,
      executedQuantity: 0,
      isExtra: true,
      itemNote: "",
      isCompleted: false,
    };
    updateDraft(order, {
      items: [...getDraftValues(order).items, newItem],
    });
    setUnsavedChanges((prev) => ({ ...prev, [order._id]: true }));
    setPriceSearchRowId(id);
    setPriceSearchTerm("");
  };

  useEffect(() => {
    if (priceSearchDebounce.current) {
      clearTimeout(priceSearchDebounce.current);
    }
    if (!priceSearchRowId) {
      setPriceSearchResults([]);
      setPriceSearchLoading(false);
      return;
    }
    if (!priceSearchTerm.trim()) {
      setPriceSearchResults([]);
      setPriceSearchLoading(false);
      return;
    }
    priceSearchDebounce.current = setTimeout(async () => {
      setPriceSearchLoading(true);
      try {
        const response = await fetch(
          `/api/price-list/items/search?q=${encodeURIComponent(priceSearchTerm.trim())}&limit=10`
        );
        const payload = await response.json();
        if (!payload.success) {
          toast.error(payload.error ?? "Napaka pri iskanju cenika.");
          setPriceSearchResults([]);
          return;
        }
        const apiResults = Array.isArray(payload.data) ? payload.data : [];
        const normalizedQuery = priceSearchTerm.trim().toLocaleLowerCase("sl-SI");
        const filteredResults =
          normalizedQuery.length === 0
            ? apiResults
            : apiResults.filter((item: PriceListSearchItem) =>
                (item.name ?? "").toLocaleLowerCase("sl-SI").includes(normalizedQuery)
              );
        setPriceSearchResults(filteredResults);
      } catch (error) {
        console.error(error);
        toast.error("Iskanje v ceniku ni uspelo.");
      } finally {
        setPriceSearchLoading(false);
      }
    }, 300);
    return () => {
      if (priceSearchDebounce.current) {
        clearTimeout(priceSearchDebounce.current);
      }
    };
  }, [priceSearchRowId, priceSearchTerm]);

  const buildItemPayload = (items: WorkOrder["items"]) =>
    items.map((item: WorkOrderItemDraft) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      productId: item.productId ?? null,
      offerItemId: item.offerItemId ?? null,
      offeredQuantity: typeof item.offeredQuantity === "number" ? item.offeredQuantity : 0,
      plannedQuantity: typeof item.plannedQuantity === "number" ? item.plannedQuantity : 0,
      executedQuantity: typeof item.executedQuantity === "number" ? item.executedQuantity : 0,
      isExtra: !!item.isExtra,
      itemNote: item.itemNote && item.itemNote.length > 0 ? item.itemNote : null,
      isCompleted: !!item.isCompleted,
    }));

  const saveWorkOrder = useCallback(
    async (orderId: string, overrides?: { status?: WorkOrderStatus }) => {
      const order = workOrders.find((candidate) => candidate._id === orderId);
      if (!order) return false;
      const draft = getDraftValues(order);
      setSavingStates((prev) => ({ ...prev, [orderId]: "saving" }));
      try {
        const response = await fetch(`/api/projects/${projectId}/work-orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId: orderId,
            status: overrides?.status ?? draft.status ?? order.status,
            executionNote: draft.executionNote?.trim() ? draft.executionNote : null,
            items: buildItemPayload(draft.items ?? []),
          }),
        });
        const payload = await response.json();
        if (!payload.success) {
          setSavingStates((prev) => ({ ...prev, [orderId]: "error" }));
          toast.error(payload.error ?? "Delovnega naloga ni mogoče shraniti.");
          return false;
        }
        const updated: WorkOrder = payload.data;
        const updatedDraft = getInitialDraftValues(updated);
        const mergedItems = mergeDraftItems(
          updatedDraft.items ?? [],
          (draft.items ?? []) as WorkOrderItemDraft[],
        );
        setPendingWorkOrders((prev) => ({
          ...prev,
          [orderId]: {
            status: updatedDraft.status,
            executionNote: updatedDraft.executionNote,
            items: mergedItems,
          },
        }));
        setUnsavedChanges((prev) => {
          if (!prev[orderId]) return prev;
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
        onWorkOrderUpdated?.(updated);
        setSavingStates((prev) => ({ ...prev, [orderId]: "saved" }));
        setTimeout(() => {
          setSavingStates((prev) => {
            if (prev[orderId] !== "saved") return prev;
            const next = { ...prev };
            delete next[orderId];
            return next;
          });
        }, 2000);
        return true;
      } catch (error) {
        console.error(error);
        setSavingStates((prev) => ({ ...prev, [orderId]: "error" }));
        toast.error("Delovnega naloga ni mogoče shraniti.");
        return false;
      }
    },
    [workOrders, projectId, onWorkOrderUpdated],
  );

  const handleCompleteWorkOrder = async (order: WorkOrder) => {
    setCompletingId(order._id);
    const success = await saveWorkOrder(order._id, { status: "completed" });
    if (success) {
      toast.success("Delovni nalog zaključen.");
    } else {
      toast.error("Delovnega naloga ni mogoče zaključiti.");
    }
    setCompletingId(null);
  };

  const applyDraftChange = (order: WorkOrder, values: Partial<{ status: WorkOrderStatus; executionNote: string }>) => {
    updateDraft(order, values);
    setUnsavedChanges((prev) => ({ ...prev, [order._id]: true }));
  };

  const applyItemChange = (
    order: WorkOrder,
    itemId: string,
    values: Partial<WorkOrder["items"][number]>
  ) => {
    updateDraftItem(order, itemId, values);
    setUnsavedChanges((prev) => ({ ...prev, [order._id]: true }));
  };

  const renderItemStatusBadge = (item: WorkOrderItemDraft) => {
    const offered = typeof item.offeredQuantity === "number" ? item.offeredQuantity : 0;
    const executed = typeof item.executedQuantity === "number" ? item.executedQuantity : 0;
    if (item.isExtra || offered === 0) {
      return <Badge variant="outline">Dodatno</Badge>;
    }
    if (executed === offered) {
      return <Badge variant="secondary">OK</Badge>;
    }
    if (executed < offered) {
      return <Badge variant="destructive">Manj</Badge>;
    }
    return <Badge className="bg-amber-100 text-amber-900">Več</Badge>;
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
                  const items: WorkOrderItemDraft[] = (draft.items ?? []) as WorkOrderItemDraft[];
                  const isOrderCompleted = (order.status ?? "draft") === "completed";
                  const allItemsCompleted =
                    items.length > 0 && items.every((item: WorkOrderItemDraft) => !!item.isCompleted);
                  const isCompletingOrder = completingId === order._id;
                  const savingState = savingStates[order._id];
                  const isSavingOrder = savingState === "saving";
                  const orderHasUnsavedChanges = !!unsavedChanges[order._id];
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
                            onValueChange={(value: string) =>
                              applyDraftChange(order, { status: value as WorkOrderStatus })
                            }
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
                          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => applyDraftChange(order, { executionNote: event.target.value })}
                          placeholder="Opis dodatnih del, materiala ali opažanj na terenu."
                          rows={4}
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">Postavke</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddExtraItem(order)}
                          >
                            + Dodaj dodatno postavko
                          </Button>
                        </div>
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full min-w-[720px] text-sm">
                            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                              <tr>
                                <th className="p-2 text-left font-semibold">Naziv</th>
                                <th className="p-2 text-right font-semibold">Ponujeno</th>
                                <th className="p-2 text-right font-semibold">Izvedeno</th>
                                <th className="p-2 text-left font-semibold">Opomba</th>
                                <th className="p-2 text-center font-semibold">Status</th>
                                <th className="p-2 text-center font-semibold">Dokončano</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="p-3 text-center text-muted-foreground">
                                    Ni postavk za prikaz.
                                  </td>
                                </tr>
                              )}
                              {items.map((item: WorkOrderItemDraft) => {
                                const offeredValue =
                                  typeof item.offeredQuantity === "number" ? item.offeredQuantity : 0;
                                const isExtraEditable = item.isExtra && offeredValue === 0;
                                const hasCenikProduct = typeof item.productId === "string" && item.productId.length > 0;
                                const executedValue =
                                  typeof item.executedQuantity === "number" ? item.executedQuantity : 0;
                                const isCompleted = !!item.isCompleted;
                                const handleCompletionChange = (checked: boolean) => {
                                  const updates: Partial<WorkOrder["items"][number]> = { isCompleted: checked };
                                  if (
                                    checked &&
                                    offeredValue > 0 &&
                                    (typeof item.executedQuantity !== "number" || item.executedQuantity === 0)
                                  ) {
                                    updates.executedQuantity = offeredValue;
                                  }
                                  applyItemChange(order, item.id, updates);
                                };
                                return (
                                  <tr key={item.id} className="border-t">
                                    <td className="p-2 align-top">
                                      {isExtraEditable ? (
                                        <Popover
                                          open={priceSearchRowId === item.id}
                                          onOpenChange={(open: boolean) => {
                                            setPriceSearchRowId(open ? item.id : null);
                                            setPriceSearchTerm(open ? item.name : "");
                                          }}
                                        >
                                          <PopoverTrigger asChild>
                                            <Input
                                              value={item.name}
                                              placeholder="Naziv ali iskanje v ceniku"
                                              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                                const value = event.target.value;
                                                applyItemChange(order, item.id, { name: value });
                                                setPriceSearchRowId(item.id);
                                                setPriceSearchTerm(value);
                                              }}
                                              onFocus={() => {
                                                setPriceSearchRowId(item.id);
                                                setPriceSearchTerm(item.name);
                                              }}
                                            />
                                          </PopoverTrigger>
                                          <PopoverContent className="w-[320px] p-0" side="bottom" align="start">
                                            <Command shouldFilter={false}>
                                              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                                                <Search className="h-4 w-4" />
                                                <span>Poi??i v ceniku</span>
                                                {priceSearchLoading && (
                                                  <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                                                )}
                                              </div>
                                              <CommandInput
                                                placeholder="Vnesi naziv ali kodo"
                                                value={priceSearchRowId === item.id ? priceSearchTerm : ""}
                                                onValueChange={(value: string) => {
                                                  setPriceSearchTerm(value);
                                                  setPriceSearchRowId(item.id);
                                                }}
                                              />
                                              <CommandList>
                                                <CommandEmpty>Ni zadetkov v ceniku, nadaljujte ro?no.</CommandEmpty>
                                                <CommandGroup>
                                                  {priceSearchResults.slice(0, 5).map((result: PriceListSearchItem) => (
                                                    <CommandItem
                                                      key={result.id}
                                                      onSelect={(_value: string) => {
                                                        applyItemChange(order, item.id, {
                                                          name: result.name,
                                                          unit: result.unit ?? "kos",
                                                          productId: result.id,
                                                        });
                                                        setPriceSearchRowId(null);
                                                        setPriceSearchTerm("");
                                                      }}
                                                      className="flex flex-col items-start gap-1"
                                                    >
                                                      <span className="font-medium">
                                                        {result.name || "Neimenovan produkt"}
                                                      </span>
                                                      {result.unit && (
                                                        <span className="text-xs text-muted-foreground">
                                                          {result.unit}
                                                        </span>
                                                      )}
                                                    </CommandItem>
                                                  ))}
                                                </CommandGroup>
                                              </CommandList>
                                            </Command>
                                          </PopoverContent>
                                          <div className="mt-2">
                                            {isExtraEditable && !hasCenikProduct ? (
                                              <Input
                                                value={item.unit ?? ""}
                                                placeholder="Enota"
                                                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                                  applyItemChange(order, item.id, { unit: event.target.value })
                                                }
                                                className="w-28"
                                              />
                                            ) : (
                                              <p className="text-xs text-muted-foreground">{item.unit || "-"}</p>
                                            )}
                                          </div>
                                        </Popover>
                                      ) : (
                                        <div>
                                          <p className="font-medium">{item.name || "-"}</p>
                                          <p className="text-xs text-muted-foreground">{item.unit || "-"}</p>
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2 text-right align-top">
                                      {offeredValue.toLocaleString("sl-SI")}
                                    </td>
                                    <td className="p-2 align-top">
                                      <Input
                                        type="number"
                                        value={item.executedQuantity ?? ""}
                                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                          applyItemChange(order, item.id, {
                                            executedQuantity: Number(event.target.value),
                                          })
                                        }
                                        className="w-24 text-right"
                                      />
                                    </td>
                                    <td className="p-2 align-top">
                                      <Textarea
                                        value={item.itemNote ?? ""}
                                        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                                          applyItemChange(order, item.id, { itemNote: event.target.value })
                                        }
                                        rows={2}
                                        className="min-h-[56px]"
                                      />
                                    </td>
                                    <td className="p-2 text-center align-top">{renderItemStatusBadge(item)}</td>
                                    <td className="p-2 text-center align-middle">
                                      <Checkbox
                                        className="h-5 w-5"
                                        checked={isCompleted}
                                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                          handleCompletionChange(event.target.checked)
                                        }
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <div className="text-xs text-muted-foreground">
                            {savingState === "saving" && "Shranjujem spremembe..."}
                            {savingState === "saved" && (
                              <span className="text-emerald-600">Spremembe shranjene.</span>
                            )}
                            {savingState === "error" && (
                              <span className="text-destructive">Shranjevanje ni uspelo.</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => saveWorkOrder(order._id)}
                              disabled={!orderHasUnsavedChanges || isSavingOrder || isCompletingOrder}
                            >
                              {isSavingOrder ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Shranjujem...
                                </>
                              ) : (
                                "Shrani delovni nalog"
                              )}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => handleCompleteWorkOrder(order)}
                              disabled={
                                items.length === 0 ||
                                !allItemsCompleted ||
                                isOrderCompleted ||
                                isCompletingOrder ||
                                isSavingOrder
                              }
                            >
                              {isOrderCompleted ? (
                                "Delovni nalog je zaključen"
                              ) : isCompletingOrder ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Zaključujem...
                                </>
                              ) : (
                                "Zaključi delovni nalog"
                              )}
                            </Button>
                          </div>
                        </div>
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
