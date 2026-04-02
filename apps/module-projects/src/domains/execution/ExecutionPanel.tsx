import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Download, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ProjectLogistics } from "@aintel/shared/types/projects/Logistics";
import type { MaterialOrder, WorkOrder, WorkOrderItem, WorkOrderStatus } from "@aintel/shared/types/logistics";
import { cn } from "../../components/ui/utils";
import { MaterialOrderCard } from "../logistics/MaterialOrderCard";
import { SignaturePad } from "./SignaturePad";
import { PriceListProductAutocomplete } from "../../components/PriceListProductAutocomplete";
import { useProjectMutationRefresh } from "../core/useProjectMutationRefresh";
import { downloadPdf } from "../../api";
import type { Employee } from "@aintel/shared/types/employee";
import { buildTenantHeaders } from "@aintel/shared/utils/tenant";
import { WorkOrderConfirmationComposeDialog } from "../communication/WorkOrderConfirmationComposeDialog";

interface ExecutionPanelProps {
  projectId: string;
  projectDisplayId?: string;
  logistics?: ProjectLogistics | null;
  onSaveSignature: (
    signature: string,
    signerName: string,
    workOrderId?: string,
    customerRemark?: string,
  ) => void | Promise<void>;
  onWorkOrderUpdated?: (workOrder: WorkOrder) => void;
  onWorkOrderDraftChange?: (workOrder: WorkOrder) => void;
  onRegisterSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
}

type WorkOrderDraft = {
  status: WorkOrderStatus;
  executionNote: string;
  items: WorkOrder["items"];
};

type WorkOrderItemDraft = WorkOrderItem;

type ExecutionItemStatus = "completed" | "in_progress" | "exception" | "manual";

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

function formatExecutionDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getOrderConfirmationState(order: WorkOrder) {
  return order.confirmationState ?? "unsigned";
}

function getActiveSignedConfirmation(order: WorkOrder) {
  const activeConfirmation = order.activeConfirmationVersion ?? null;
  if (order.confirmationState !== "signed_active") {
    return null;
  }
  if (!order.confirmationActiveVersionId || !activeConfirmation) {
    return null;
  }
  if (activeConfirmation.id !== order.confirmationActiveVersionId) {
    return null;
  }
  if (activeConfirmation.state !== "active" || !activeConfirmation.signedAt) {
    return null;
  }
  return activeConfirmation;
}

function formatExecutionDuration(items: WorkOrder["items"] | undefined) {
  const totalMinutes = (items ?? []).reduce((sum, item) => {
    const quantity = typeof item.quantity === "number" ? item.quantity : 0;
    const casovnaNorma = typeof item.casovnaNorma === "number" ? item.casovnaNorma : 0;
    return sum + quantity * casovnaNorma;
  }, 0);

  if (totalMinutes <= 0) return null;
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

function getMaterialForWorkOrder(materialOrders: MaterialOrder[], workOrderId: string) {
  return materialOrders.find((materialOrder) => materialOrder.workOrderId === workOrderId) ?? null;
}

function getMaterialDraftValue(materialOrder: MaterialOrder | null, pending: Record<string, MaterialOrder>) {
  if (!materialOrder?._id) return null;
  return pending[materialOrder._id] ?? materialOrder;
}

function getExecutionItemStatus(item: WorkOrderItemDraft): ExecutionItemStatus {
  if (item.isExtra) {
    return "manual";
  }

  const planned = typeof item.offeredQuantity === "number" ? item.offeredQuantity : 0;
  const executed = typeof item.executedQuantity === "number" ? item.executedQuantity : 0;
  const isCompleted = !!item.isCompleted;

  if (!isCompleted) {
    return "in_progress";
  }

  if (executed === planned) {
    return "completed";
  }

  return "exception";
}

const executionItemStatusStyles: Record<
  ExecutionItemStatus,
  {
    badgeClassName: string;
    badgeLabel: string;
    rowClassName: string;
    quantityClassName: string;
    cardClassName: string;
  }
> = {
  completed: {
    badgeClassName: "border-emerald-600/20 bg-emerald-600 text-white hover:bg-emerald-600",
    badgeLabel: "Usklajeno",
    rowClassName: "border-l-4 border-l-emerald-500 bg-emerald-500/5",
    quantityClassName: "text-emerald-700",
    cardClassName: "border-emerald-500/30 bg-emerald-500/5",
  },
  in_progress: {
    badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    badgeLabel: "V teku",
    rowClassName: "border-l-4 border-l-amber-500 bg-amber-500/5",
    quantityClassName: "text-amber-700",
    cardClassName: "border-amber-500/30 bg-amber-500/5",
  },
  exception: {
    badgeClassName: "border-transparent bg-destructive text-white hover:bg-destructive",
    badgeLabel: "Odstopanje",
    rowClassName: "border-l-4 border-l-destructive bg-destructive/5",
    quantityClassName: "text-destructive",
    cardClassName: "border-destructive/25 bg-destructive/5",
  },
  manual: {
    badgeClassName: "border-transparent bg-destructive text-white hover:bg-destructive",
    badgeLabel: "Dodatno",
    rowClassName: "border-l-4 border-l-destructive bg-destructive/5",
    quantityClassName: "text-destructive",
    cardClassName: "border-destructive/25 bg-destructive/5",
  },
};

export function ExecutionPanel({
  projectId,
  projectDisplayId,
  logistics,
  onSaveSignature,
  onWorkOrderUpdated,
  onWorkOrderDraftChange,
  onRegisterSaveHandler,
}: ExecutionPanelProps) {
  const rawWorkOrders = logistics?.workOrders ?? [];
  const materialOrders = logistics?.materialOrders ?? [];
  const refreshAfterMutation = useProjectMutationRefresh(projectId);
  const [pendingWorkOrders, setPendingWorkOrders] = useState<Record<string, WorkOrderDraft>>({});
  const [pendingMaterialOrders, setPendingMaterialOrders] = useState<Record<string, MaterialOrder>>({});
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [savingStates, setSavingStates] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, boolean>>({});
  const [unsavedMaterialChanges, setUnsavedMaterialChanges] = useState<Record<string, boolean>>({});
  const [downloadingWorkOrderId, setDownloadingWorkOrderId] = useState<string | null>(null);
  const [signoffOrderId, setSignoffOrderId] = useState<string | null>(null);
  const [confirmationEmailOrderId, setConfirmationEmailOrderId] = useState<string | null>(null);
  const [correctionOrderId, setCorrectionOrderId] = useState<string | null>(null);
  const [startingCorrectionId, setStartingCorrectionId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [customerRemarkDraft, setCustomerRemarkDraft] = useState("");

  const workOrders = useMemo(() => rawWorkOrders, [rawWorkOrders]);

  useEffect(() => {
    let alive = true;
    const fetchEmployees = async () => {
      try {
        const response = await fetch("/api/employees", { headers: buildTenantHeaders() });
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
  }, []);

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

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => {
      if (employee.active) {
        map.set(employee.id, employee.name);
      }
    });
    return map;
  }, [employees]);

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

  const getDraftValues = useCallback(
    (order: WorkOrder) => pendingWorkOrders[order._id] ?? getInitialDraftValues(order),
    [pendingWorkOrders],
  );

  const updateDraft = (
    order: WorkOrder,
    values: Partial<{
      status: WorkOrderStatus;
      executionNote: string;
      items: WorkOrder["items"];
    }>
  ) => {
    const current = pendingWorkOrders[order._id] ?? getInitialDraftValues(order);
    const nextDraft = {
      ...current,
      ...values,
    };
    setPendingWorkOrders((prev) => {
      return {
        ...prev,
        [order._id]: nextDraft,
      };
    });
    onWorkOrderDraftChange?.({
      ...order,
      status: nextDraft.status,
      executionNote: nextDraft.executionNote,
      items: nextDraft.items,
    });
  };

  const updateDraftItem = (
    order: WorkOrder,
    itemId: string,
    values: Partial<WorkOrder["items"][number]>
  ) => {
    const current = pendingWorkOrders[order._id] ?? getInitialDraftValues(order);
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
    setPendingWorkOrders((prev) => {
      return {
        ...prev,
        [order._id]: {
          ...current,
          items: nextItems,
        },
      };
    });
    onWorkOrderDraftChange?.({
      ...order,
      status: current.status,
      executionNote: current.executionNote,
      items: nextItems,
    });
  };

  const handleAddExtraItem = (order: WorkOrder) => {
    if (getOrderConfirmationState(order) === "signed_active") {
      return;
    }
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
  };



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
    async (
      orderId: string,
      overrides?: { status?: WorkOrderStatus },
      options?: { skipRefresh?: boolean },
    ) => {
      const order = workOrders.find((candidate) => candidate._id === orderId);
      if (!order) return false;
      if (getOrderConfirmationState(order) === "signed_active") {
        toast.error("Potrdilo delovnega naloga je podpisano. Izvedbenih vrednosti ni več mogoče spreminjati.");
        return false;
      }
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
        if (!options?.skipRefresh) {
          await refreshAfterMutation();
        }
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
    [workOrders, projectId, onWorkOrderUpdated, getDraftValues, refreshAfterMutation],
  );

  const handleCompleteWorkOrder = async (order: WorkOrder) => {
    if (getOrderConfirmationState(order) === "signed_active") {
      toast.error("Potrdilo delovnega naloga je podpisano. Delovni nalog je zaklenjen.");
      return;
    }
    setCompletingId(order._id);
    const success = await saveWorkOrder(order._id, { status: "completed" });
    if (success) {
      toast.success("Delovni nalog zaključen.");
    } else {
      toast.error("Delovnega naloga ni mogoče zaključiti.");
    }
    setCompletingId(null);
  };

  const handleDownloadWorkOrder = async (order: WorkOrder | null) => {
    if (!order?._id) return;
    setDownloadingWorkOrderId(order._id);
    try {
      const filename = `delovni-nalog-${order._id}.pdf`;
      await downloadPdf(`/api/projects/${projectId}/work-orders/${order._id}/pdf?docType=WORK_ORDER`, filename);
      toast.success("Delovni nalog prenesen.");
    } catch (error) {
      console.error(error);
      toast.error("Prenos delovnega naloga ni uspel.");
    } finally {
      setDownloadingWorkOrderId(null);
    }
  };

  const applyDraftChange = (order: WorkOrder, values: Partial<{ status: WorkOrderStatus; executionNote: string }>) => {
    if (getOrderConfirmationState(order) === "signed_active") {
      return;
    }
    updateDraft(order, values);
    setUnsavedChanges((prev) => ({ ...prev, [order._id]: true }));
  };

  const applyItemChange = (
    order: WorkOrder,
    itemId: string,
    values: Partial<WorkOrder["items"][number]>
  ) => {
    if (getOrderConfirmationState(order) === "signed_active") {
      return;
    }
    updateDraftItem(order, itemId, values);
    setUnsavedChanges((prev) => ({ ...prev, [order._id]: true }));
  };

  const handleDeleteManualItem = (order: WorkOrder, item: WorkOrderItemDraft) => {
    if (getOrderConfirmationState(order) === "signed_active") {
      return;
    }
    if (!item.isExtra) {
      return;
    }

    const executedValue = typeof item.executedQuantity === "number" ? item.executedQuantity : 0;
    const confirmMessage =
      executedValue > 0 || item.isCompleted
        ? "Ta dodatna postavka že vsebuje izvedbo. Ali jo želiš vseeno izbrisati?"
        : "Ali želiš izbrisati to postavko?";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    updateDraft(order, {
      items: getDraftValues(order).items.filter((candidate) => candidate.id !== item.id),
    });
    setUnsavedChanges((prev) => ({ ...prev, [order._id]: true }));
  };

  const updateMaterialDraft = (materialOrder: MaterialOrder, updates: Partial<MaterialOrder>) => {
    setPendingMaterialOrders((prev) => {
      const base = prev[materialOrder._id] ?? materialOrder;
      return { ...prev, [materialOrder._id]: { ...base, ...updates } };
    });
    setUnsavedMaterialChanges((prev) => ({ ...prev, [materialOrder._id]: true }));
  };

  const saveMaterialDraft = useCallback(
    async (
      order: WorkOrder,
      materialOrder: MaterialOrder,
      options?: { skipRefresh?: boolean },
    ) => {
      const draftMaterial = getMaterialDraftValue(materialOrder, pendingMaterialOrders) ?? materialOrder;
      setSavingStates((prev) => ({ ...prev, [order._id]: "saving" }));
      try {
        const response = await fetch(`/api/projects/${projectId}/work-orders/${order._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId: order._id,
            materialOrderId: draftMaterial._id,
            materialStatus: draftMaterial.materialStatus,
            pickupMethod: draftMaterial.pickupMethod ?? null,
            pickupLocation: draftMaterial.pickupLocation ?? null,
            logisticsOwnerId: draftMaterial.logisticsOwnerId ?? null,
            pickupConfirmedAt: draftMaterial.pickupConfirmedAt ?? null,
            materialItems: draftMaterial.items ?? [],
          }),
        });
        const payload = await response.json();
        if (!payload.success) {
          setSavingStates((prev) => ({ ...prev, [order._id]: "error" }));
          toast.error(payload.error ?? "Shranjevanje prevzema ni uspelo.");
          return false;
        }
        if (!options?.skipRefresh) {
          await refreshAfterMutation();
        }
        setUnsavedMaterialChanges((prev) => {
          const next = { ...prev };
          delete next[materialOrder._id];
          return next;
        });
        setPendingMaterialOrders((prev) => {
          const next = { ...prev };
          delete next[materialOrder._id];
          return next;
        });
        setSavingStates((prev) => ({ ...prev, [order._id]: "saved" }));
        return true;
      } catch (error) {
        console.error(error);
        setSavingStates((prev) => ({ ...prev, [order._id]: "error" }));
        toast.error("Shranjevanje prevzema ni uspelo.");
        return false;
      }
    },
    [pendingMaterialOrders, projectId, refreshAfterMutation],
  );

  const confirmPickup = async (order: WorkOrder, materialOrder: MaterialOrder) => {
    const draftMaterial = getMaterialDraftValue(materialOrder, pendingMaterialOrders) ?? materialOrder;
    const nextMaterial: MaterialOrder = {
      ...draftMaterial,
      pickupConfirmedAt: new Date().toISOString(),
      materialStatus: "Prevzeto",
    };
    setPendingMaterialOrders((prev) => ({ ...prev, [materialOrder._id]: nextMaterial }));
    const success = await saveMaterialDraft(order, nextMaterial);
    if (success) {
      toast.success("Prevzem potrjen.");
    }
  };

  const handleSaveExecutionChanges = useCallback(async () => {
    const dirtyWorkOrderIds = workOrders
      .map((order) => order._id)
      .filter((orderId) => Boolean(unsavedChanges[orderId]));
    const dirtyMaterialEntries = workOrders
      .map((order) => ({
        order,
        materialOrder: getMaterialForWorkOrder(materialOrders, order._id),
      }))
      .filter(
        (
          entry,
        ): entry is {
          order: WorkOrder;
          materialOrder: MaterialOrder;
        } => Boolean(entry.materialOrder?._id && unsavedMaterialChanges[entry.materialOrder._id]),
      );

    if (dirtyWorkOrderIds.length === 0 && dirtyMaterialEntries.length === 0) {
      return true;
    }

    let hasFailure = false;
    let hasSavedChanges = false;

    for (const orderId of dirtyWorkOrderIds) {
      const saved = await saveWorkOrder(orderId, undefined, { skipRefresh: true });
      hasSavedChanges = hasSavedChanges || saved;
      hasFailure = hasFailure || !saved;
    }

    for (const { order, materialOrder } of dirtyMaterialEntries) {
      const saved = await saveMaterialDraft(order, materialOrder, { skipRefresh: true });
      hasSavedChanges = hasSavedChanges || saved;
      hasFailure = hasFailure || !saved;
    }

    if (hasSavedChanges) {
      await refreshAfterMutation();
    }

    if (hasFailure) {
      toast.error("Nekaterih sprememb izvedbe ni bilo mogoče shraniti.");
      return false;
    }

    toast.success("Spremembe izvedbe shranjene.");
    return true;
  }, [
    materialOrders,
    refreshAfterMutation,
    saveMaterialDraft,
    saveWorkOrder,
    unsavedChanges,
    unsavedMaterialChanges,
    workOrders,
  ]);

  useEffect(() => {
    if (!onRegisterSaveHandler) return;
    onRegisterSaveHandler(handleSaveExecutionChanges);
    return () => onRegisterSaveHandler(null);
  }, [handleSaveExecutionChanges, onRegisterSaveHandler]);

  const renderItemStatusBadge = (item: WorkOrderItemDraft) => {
    const status = getExecutionItemStatus(item);
    const styles = executionItemStatusStyles[status];
    return <Badge className={styles.badgeClassName}>{styles.badgeLabel}</Badge>;
  };

  const selectedSignoffOrder = useMemo(
    () => workOrders.find((order) => order._id === signoffOrderId) ?? null,
    [signoffOrderId, workOrders],
  );
  const selectedConfirmationEmailOrder = useMemo(
    () => workOrders.find((order) => order._id === confirmationEmailOrderId) ?? null,
    [confirmationEmailOrderId, workOrders],
  );
  const selectedSignoffActiveConfirmation = useMemo(
    () => (selectedSignoffOrder ? getActiveSignedConfirmation(selectedSignoffOrder) : null),
    [selectedSignoffOrder],
  );
  const selectedSignoffExecutionDateLabel = useMemo(
    () => formatExecutionDateTime(selectedSignoffOrder?.scheduledAt ?? null),
    [selectedSignoffOrder],
  );
  const selectedSignoffExecutionDurationLabel = useMemo(
    () => formatExecutionDuration(selectedSignoffOrder?.items),
    [selectedSignoffOrder],
  );
  const selectedSignoffTeamLabel = useMemo(
    () =>
      (selectedSignoffOrder?.assignedEmployeeIds ?? [])
        .map((employeeId) => employeeNameById.get(employeeId) ?? null)
        .filter((name): name is string => Boolean(name))
        .join(", "),
    [employeeNameById, selectedSignoffOrder],
  );

  useEffect(() => {
    setCustomerRemarkDraft(selectedSignoffOrder?.customerRemark ?? "");
  }, [selectedSignoffOrder]);

  const openWorkOrderConfirmationPdf = useCallback((orderId: string, confirmationVersionId?: string | null) => {
    const params = new URLSearchParams({
      docType: "WORK_ORDER_CONFIRMATION",
      mode: "inline",
    });
    if (confirmationVersionId) {
      params.set("confirmationVersionId", confirmationVersionId);
    }
    const url = `/api/projects/${projectId}/work-orders/${orderId}/pdf?${params.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [projectId]);

  const downloadWorkOrderConfirmationPdf = useCallback(async (orderId: string, confirmationVersionId?: string | null) => {
    try {
      const params = new URLSearchParams({
        docType: "WORK_ORDER_CONFIRMATION",
        mode: "download",
      });
      if (confirmationVersionId) {
        params.set("confirmationVersionId", confirmationVersionId);
      }
      await downloadPdf(
        `/api/projects/${projectId}/work-orders/${orderId}/pdf?${params.toString()}`,
        `potrdilo-delovnega-naloga-${projectId}-${orderId}.pdf`,
      );
      toast.success("Potrdilo delovnega naloga preneseno.");
    } catch (error) {
      console.error(error);
      toast.error("Prenos potrdila delovnega naloga ni uspel.");
    }
  }, [projectId]);

  const handleSendSignedConfirmation = useCallback((order: WorkOrder) => {
    if (!order._id) {
      return;
    }
    if (getOrderConfirmationState(order) !== "signed_active" || !getActiveSignedConfirmation(order)) {
      toast.error("Aktivno podpisano potrdilo ni na voljo. Pred pošiljanjem je potreben nov podpis.");
      return;
    }
    setConfirmationEmailOrderId(order._id);
  }, []);

  const handleStartCorrection = useCallback(async (order: WorkOrder) => {
    if (!order._id) return;
    setStartingCorrectionId(order._id);
    try {
      const response = await fetch(`/api/projects/${projectId}/work-orders/${order._id}/start-correction`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Potrdila ni mogoče odkleniti za popravek.");
        return;
      }
      setCorrectionOrderId(null);
      await refreshAfterMutation();
      toast.success("Potrdilo je odklenjeno za popravek. Za trenutno stanje je potreben nov podpis.");
    } catch (error) {
      console.error(error);
      toast.error("Potrdila ni mogoče odkleniti za popravek.");
    } finally {
      setStartingCorrectionId(null);
    }
  }, [projectId, refreshAfterMutation]);

  const renderConfirmationDialogActions = useCallback(
    (order: WorkOrder, disabled = false, confirmationVersionId?: string | null) => (
      <>
        <div className="flex items-center overflow-hidden rounded-none border border-border/70">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-none border-r border-border/70 px-3"
            disabled={disabled}
            onClick={() => openWorkOrderConfirmationPdf(order._id, confirmationVersionId)}
          >
            Poglej potrdilo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-none"
            disabled={disabled}
            onClick={() => void downloadWorkOrderConfirmationPdf(order._id, confirmationVersionId)}
            aria-label="Prenesi potrdilo delovnega naloga"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => handleSendSignedConfirmation(order)}
        >
          <Send className="mr-2 h-4 w-4" />
          Pošlji email s potrdilom stranki
        </Button>
      </>
    ),
    [downloadWorkOrderConfirmationPdf, handleSendSignedConfirmation, openWorkOrderConfirmationPdf],
  );

  const handleCustomerSignoff = useCallback(
    async (signature: string, signerName: string) => {
      if (!selectedSignoffOrder?._id) return;
      await onSaveSignature(signature, signerName, selectedSignoffOrder._id, customerRemarkDraft);
      setSignoffOrderId(null);
    },
    [customerRemarkDraft, onSaveSignature, selectedSignoffOrder],
  );

  const hasWorkOrders = workOrders.length > 0;

  return (
    <div className="space-y-8 overflow-x-hidden pb-24 md:pb-0">
      <div className="space-y-6">
        {STATUS_OPTIONS.map((statusOption) => {
          const entries = workOrdersByStatus[statusOption.value] ?? [];
          if (entries.length === 0) {
            return null;
          }
          return (
            <div key={statusOption.value} className="space-y-4">
                {entries.map((order) => {
                  const draft = getDraftValues(order);
                  const materialOrder = getMaterialForWorkOrder(materialOrders, order._id);
                  const materialDraft = getMaterialDraftValue(materialOrder, pendingMaterialOrders);
                  const items: WorkOrderItemDraft[] = (draft.items ?? []) as WorkOrderItemDraft[];
                  const allItemsCompleted =
                    items.length > 0 && items.every((item: WorkOrderItemDraft) => !!item.isCompleted);
                  const isOrderCompleted = allItemsCompleted;
                  const confirmationState = getOrderConfirmationState(order);
                  const isConfirmationLocked = confirmationState === "signed_active";
                  const requiresResign = confirmationState === "resign_required";
                  const activeConfirmation = getActiveSignedConfirmation(order);
                  const confirmationHistory = order.confirmationVersions ?? [];
                  const workOrderBadgeClass = isOrderCompleted
                    ? "border-green-500/30 bg-green-500/10 text-green-700"
                    : "border-orange-400/50 bg-orange-500/10 text-orange-700";
                  const isCompletingOrder = completingId === order._id;
                  const savingState = savingStates[order._id];
                  const isSavingOrder = savingState === "saving";
                  const orderHasUnsavedChanges = !!unsavedChanges[order._id];
                  const executionDateLabel = formatExecutionDateTime(order.scheduledAt ?? null);
                  const executionDurationLabel = formatExecutionDuration(items);
                  const executionTeamLabel = (order.assignedEmployeeIds ?? [])
                    .map((employeeId) => employeeNameById.get(employeeId) ?? null)
                    .filter((name): name is string => Boolean(name))
                    .join(", ");
                  return (
                    <div key={order._id} className="space-y-4">
                      {materialOrder ? (
                        <MaterialOrderCard
                          mode="execution"
                          materialOrder={materialDraft ?? materialOrder}
                          technicianNote={order.notes ?? ""}
                          executionDate={order.scheduledAt ?? null}
                          executionDateConfirmedAt={order.scheduledConfirmedAt ?? null}
                          executionDateConfirmedBy={order.scheduledConfirmedBy ?? null}
                          executionDurationLabel={null}
                          mainInstallerId={order.mainInstallerId ?? null}
                          executionTeamIds={order.assignedEmployeeIds ?? []}
                          installerAvailability={[]}
                          employees={employees}
                          onExecutionDateChange={() => {}}
                          onConfirmExecutionDate={() => {}}
                          onUnconfirmExecutionDate={() => {}}
                          onMainInstallerChange={() => {}}
                          onToggleExecutionTeam={() => {}}
                          onPickupMethodChange={(value) => updateMaterialDraft(materialOrder, { pickupMethod: value })}
                          onPickupLocationChange={(value) => updateMaterialDraft(materialOrder, { pickupLocation: value })}
                          onLogisticsOwnerChange={(employeeId) => updateMaterialDraft(materialOrder, { logisticsOwnerId: employeeId })}
                          onPickupNoteChange={() => {}}
                          onDeliveryNotePhotosChange={() => {}}
                          onAddExtraMaterial={() => {}}
                          onConfirmPickup={() => {
                            void confirmPickup(order, materialDraft ?? materialOrder);
                          }}
                          onAdvanceStep={() => {}}
                          savingWorkOrder={isSavingOrder}
                          onPreviewPurchaseOrder={() => window.open(`/api/projects/${projectId}/material-orders/${materialOrder._id}/pdf?docType=PURCHASE_ORDER&mode=inline`, "_blank", "noopener,noreferrer")}
                          onDownloadPurchaseOrder={() => {
                            void downloadPdf(`/api/projects/${projectId}/material-orders/${materialOrder._id}/pdf?docType=PURCHASE_ORDER&mode=download`, `narocilo-${projectId}-${materialOrder._id}.pdf`);
                          }}
                          onDownloadDeliveryNote={() => {}}
                          onDeliveredQtyChange={(itemId, deliveredQty) => {
                            const source = materialDraft ?? materialOrder;
                            updateMaterialDraft(materialOrder, {
                              items: (source.items ?? []).map((item) => (item.id === itemId ? { ...item, deliveredQty: Math.max(0, deliveredQty) } : item)),
                            });
                          }}
                          onDeliveredQtyCommit={(itemId, deliveredQty) => {
                            const source = materialDraft ?? materialOrder;
                            updateMaterialDraft(materialOrder, {
                              items: (source.items ?? []).map((item) => (item.id === itemId ? { ...item, deliveredQty: Math.max(0, deliveredQty) } : item)),
                            });
                          }}
                          onMaterialItemsChange={(items) => updateMaterialDraft(materialOrder, { items })}
                          onSaveMaterialChanges={() => {
                            void saveMaterialDraft(order, materialDraft ?? materialOrder);
                          }}
                          hasPendingMaterialChanges={Boolean(materialOrder?._id && unsavedMaterialChanges[materialOrder._id])}
                          canDownloadPdf={Boolean(materialOrder._id)}
                          downloadingPdf={downloadingWorkOrderId === materialOrder._id ? "PURCHASE_ORDER" : null}
                        />
                      ) : null}
                      <Card className={cn("work-order-status-card overflow-hidden", isOrderCompleted ? "is-completed" : "is-in-progress")}>
                        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-4">
                          <div className="space-y-3">
                            <CardTitle className="text-base font-semibold">Delovni nalog</CardTitle>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <div className="space-y-1">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Ekipa</p>
                                <p className="text-sm font-medium">{executionTeamLabel || "Ni določena"}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Termin izvedbe</p>
                                <p className="text-sm font-medium">{executionDateLabel ?? "Ni določen"}</p>
                                {executionDurationLabel ? (
                                  <p className="text-xs text-muted-foreground">Ocena trajanja izvedbe: {executionDurationLabel}</p>
                                ) : null}
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Stranka</p>
                                <p className="text-sm font-medium">{order.customerName || "Neznana stranka"}</p>
                                <p className="text-sm text-muted-foreground">{order.customerAddress || "Naslov ni zapisan"}</p>
                                {order.customerPhone ? <p className="text-sm text-muted-foreground">{order.customerPhone}</p> : null}
                              </div>
                            </div>
                          </div>
                          <Badge className={workOrderBadgeClass}>
                            {isOrderCompleted ? "Zaključeno" : "V teku"}
                          </Badge>
                        </CardHeader>
                        <CardContent className="space-y-4">
                        {isConfirmationLocked ? (
                          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-900">
                            Potrdilo delovnega naloga je podpisano. Potrjene izvedbene vrednosti so zaklenjene.
                          </div>
                        ) : null}
                        {requiresResign ? (
                          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
                            Popravek potrdila je v teku. Trenutne izvedbene vrednosti so odklenjene, vendar še niso aktivno podpisane. Pred pošiljanjem ali uporabo kot veljavnega potrdila je potreben nov podpis stranke.
                          </div>
                        ) : null}
                        {(activeConfirmation || confirmationHistory.length > 0) ? (
                          <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-medium">Podpisano potrdilo delovnega naloga</p>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <Badge className={isConfirmationLocked ? "border-emerald-600/20 bg-emerald-600 text-white" : "border-amber-500/30 bg-amber-500/10 text-amber-700"}>
                                    {isConfirmationLocked ? "Podpisano in zaklenjeno" : "Nov podpis potreben"}
                                  </Badge>
                                  {activeConfirmation ? <span>Aktivna verzija V{activeConfirmation.versionNumber}</span> : null}
                                </div>
                              </div>
                              {activeConfirmation ? (
                                <div className="flex flex-wrap gap-2">
                                  {renderConfirmationDialogActions(order, false)}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setCorrectionOrderId(order._id)}
                                  >
                                    Popravi potrdilo
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                            {activeConfirmation ? (
                              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Podpisnik</p>
                                    <p className="font-medium">{activeConfirmation.signerName || order.customerName || "Neznana stranka"}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Podpisano</p>
                                    <p>{formatExecutionDateTime(activeConfirmation.signedAt ?? null) ?? "Datum ni na voljo"}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Opombe naročnika</p>
                                    <p className="whitespace-pre-wrap">{activeConfirmation.customerRemark?.trim() || "Brez opomb."}</p>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Podpis</p>
                                  <div className="rounded-md border border-border/70 bg-background p-3">
                                    {activeConfirmation.signature ? (
                                      <img
                                        src={activeConfirmation.signature}
                                        alt="Podpis naročnika"
                                        className="mx-auto max-h-[140px] w-full object-contain"
                                      />
                                    ) : (
                                      <div className="flex min-h-[96px] items-center justify-center text-sm text-muted-foreground">
                                        Podpis je shranjen.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            {confirmationHistory.length > 0 ? (
                              <details className="rounded-md border border-border/60 bg-background/70 p-3">
                                <summary className="cursor-pointer text-sm font-medium">
                                  Prejšnja potrjena potrdila ({confirmationHistory.length})
                                </summary>
                                <div className="mt-3 space-y-2">
                                  {confirmationHistory
                                    .filter((version) => !activeConfirmation || version.id !== activeConfirmation.id)
                                    .slice()
                                    .sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0))
                                    .map((version) => (
                                      <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                                        <div className="space-y-1 text-sm">
                                          <p className="font-medium">V{version.versionNumber}</p>
                                          <p className="text-muted-foreground">
                                            {version.signerName || "Neznan podpisnik"} · {formatExecutionDateTime(version.signedAt ?? null) ?? "Datum ni na voljo"}
                                          </p>
                                        </div>
                                        {renderConfirmationDialogActions(order, false, version.id)}
                                      </div>
                                    ))}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="hidden overflow-x-auto rounded-md border md:block">
                          <table className="w-full min-w-[720px] text-sm">
                            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                              <tr>
                                <th className="p-2 text-center font-semibold">Dokončano</th>
                                <th className="p-2 text-center font-semibold">IZVEDBA/NAROČILO</th>
                                <th className="p-2 text-left font-semibold">Naziv</th>
                                <th className="w-12 p-2 text-right font-semibold"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.length === 0 && (
                                <tr>
                                  <td colSpan={4} className="p-3 text-center text-muted-foreground">
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
                                const itemStatus = getExecutionItemStatus(item);
                                const itemStatusStyles = executionItemStatusStyles[itemStatus];
                                const handleCompletionChange = (checked: boolean) => {
                                  const updates: Partial<WorkOrder["items"][number]> = {
                                    isCompleted: checked,
                                    executedQuantity: checked
                                      ? executedValue > 0
                                        ? executedValue
                                        : offeredValue
                                      : 0,
                                  };
                                  applyItemChange(order, item.id, updates);
                                };
                                return (
                                  <tr key={item.id} className={cn("border-t", itemStatusStyles.rowClassName)}>
                                    <td className="p-2 text-center align-middle">
                                      <Checkbox
                                        className="h-5 w-5"
                                        checked={isCompleted}
                                        disabled={isConfirmationLocked}
                                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                          handleCompletionChange(event.target.checked)
                                        }
                                      />
                                    </td>
                                    <td className="p-2 align-middle">
                                      <div className="flex items-center justify-center gap-0">
                                        <Input
                                          type="number"
                                          value={item.executedQuantity ?? ""}
                                          disabled={isConfirmationLocked}
                                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                            applyItemChange(order, item.id, {
                                              executedQuantity: Number(event.target.value),
                                            })
                                          }
                                          className={cn("w-16 text-right", itemStatusStyles.quantityClassName)}
                                        />
                                        <span className={cn("px-0.5", itemStatusStyles.quantityClassName)}>/</span>
                                        <span className={cn("text-right tabular-nums font-medium", itemStatusStyles.quantityClassName)}>
                                          {offeredValue.toLocaleString("sl-SI")}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="p-2 align-top">
                                      {isExtraEditable ? (
                                        <div>
                                          <PriceListProductAutocomplete
                                            value={item.name}
                                            placeholder="Naziv ali iskanje v ceniku"
                                            inputClassName="text-left"
                                            disabled={isConfirmationLocked}
                                            onChange={(name) =>
                                              applyItemChange(order, item.id, { name, productId: null })
                                            }
                                            onCustomSelected={() =>
                                              applyItemChange(order, item.id, { productId: null })
                                            }
                                            onProductSelected={(product) =>
                                              applyItemChange(order, item.id, {
                                                name: product.name,
                                                unit: product.unit ?? item.unit ?? "",
                                                productId: product.id,
                                              })
                                            }
                                          />
                                          <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <p className="text-xs text-muted-foreground">{item.unit || "-"}</p>
                                            {renderItemStatusBadge(item)}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-1">
                                          <p className="font-medium">{item.name || "-"}</p>
                                          <div className="flex flex-wrap items-center gap-2">
                                            {item.isExtra && offeredValue === 0 ? null : (
                                              <p className="text-xs text-muted-foreground">{item.unit || "-"}</p>
                                            )}
                                            {renderItemStatusBadge(item)}
                                          </div>
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2 text-right align-top">
                                      {item.isExtra ? (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                          disabled={isConfirmationLocked}
                                          onClick={() => handleDeleteManualItem(order, item)}
                                          aria-label="Izbriši dodatno postavko"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      ) : null}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="space-y-3 md:hidden">
                          {items.length === 0 ? (
                            <div className="rounded-md border p-3 text-sm text-muted-foreground">Ni postavk za prikaz.</div>
                          ) : null}
                          {items.map((item: WorkOrderItemDraft) => {
                            const offeredValue = typeof item.offeredQuantity === "number" ? item.offeredQuantity : 0;
                            const isExtraEditable = item.isExtra && offeredValue === 0;
                            const hasCenikProduct = typeof item.productId === "string" && item.productId.length > 0;
                            const isCompleted = !!item.isCompleted;
                            const itemStatus = getExecutionItemStatus(item);
                            const itemStatusStyles = executionItemStatusStyles[itemStatus];
                            const handleCompletionChange = (checked: boolean) => {
                              const updates: Partial<WorkOrder["items"][number]> = {
                                isCompleted: checked,
                                executedQuantity: checked
                                  ? (typeof item.executedQuantity === "number" && item.executedQuantity > 0
                                      ? item.executedQuantity
                                      : offeredValue)
                                  : 0,
                              };
                              applyItemChange(order, item.id, updates);
                            };

                            return (
                              <div key={item.id} className={cn("space-y-3 rounded-md border p-3", itemStatusStyles.cardClassName)}>
                                <div className="space-y-1">
                                  {isExtraEditable ? (
                                    <div className="space-y-1">
                                      <PriceListProductAutocomplete
                                        value={item.name ?? ""}
                                        onChange={(value) => applyItemChange(order, item.id, { name: value })}
                                        onSelect={(product) =>
                                          applyItemChange(order, item.id, {
                                            productId: product.id,
                                            name: product.name,
                                            unit: product.unit,
                                            offerItemId: item.offerItemId ?? null,
                                          })
                                        }
                                        placeholder="Poišči iz cenika"
                                      />
                                      <div>{renderItemStatusBadge(item)}</div>
                                    </div>
                                  ) : (
                                    <p className="text-sm font-medium">{item.name}</p>
                                  )}
                                  {!isExtraEditable ? <div>{renderItemStatusBadge(item)}</div> : null}
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Ponujeno</p>
                                    <p className={cn("font-medium", itemStatusStyles.quantityClassName)}>{offeredValue.toLocaleString("sl-SI")}</p>
                                  </div>
                                  <label className="space-y-1">
                                    <span className="text-xs text-muted-foreground">Izvedeno</span>
                                    <Input
                                      type="number"
                                      value={item.executedQuantity ?? ""}
                                      disabled={isConfirmationLocked}
                                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                        applyItemChange(order, item.id, {
                                          executedQuantity: Number(event.target.value),
                                        })
                                      }
                                      className={cn("h-11", itemStatusStyles.quantityClassName)}
                                    />
                                  </label>
                                </div>
                                <label className="space-y-1">
                                  <span className="text-xs text-muted-foreground">Opomba</span>
                                  <Textarea
                                    value={item.itemNote ?? ""}
                                    disabled={isConfirmationLocked}
                                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                                      applyItemChange(order, item.id, { itemNote: event.target.value })
                                    }
                                    rows={2}
                                    className="min-h-[56px]"
                                  />
                                </label>
                                <label className={cn("flex min-h-[44px] items-center justify-between rounded-md px-3 text-sm", itemStatusStyles.cardClassName)}>
                                  <span>{isCompleted ? "Dokončano" : "Označi kot dokončano"}</span>
                                  <Checkbox
                                    className="h-5 w-5"
                                    checked={isCompleted}
                                    disabled={isConfirmationLocked}
                                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                      handleCompletionChange(event.target.checked)
                                    }
                                  />
                                </label>
                                {item.isExtra && !hasCenikProduct ? (
                                  <p className="text-xs text-muted-foreground">Dodajte izdelek iz cenika za pravilno poročanje.</p>
                                ) : null}
                                {item.isExtra ? (
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                      disabled={isConfirmationLocked}
                                      onClick={() => handleDeleteManualItem(order, item)}
                                      aria-label="Izbriši dodatno postavko"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        <div className="grid gap-4 md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] md:items-start">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Opombe ob izvedbi</label>
                            <Textarea
                              value={draft.executionNote}
                              disabled={isConfirmationLocked}
                              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => applyDraftChange(order, { executionNote: event.target.value })}
                              placeholder="Opis dodatnih del, materiala ali opažanj na terenu."
                              rows={4}
                            />
                          </div>
                          <div className="flex items-start justify-start md:justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isConfirmationLocked}
                              onClick={() => handleAddExtraItem(order)}
                            >
                              + Dodaj dodatno postavko
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
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
                                variant="outline"
                                onClick={() => handleDownloadWorkOrder(order)}
                                disabled={!order._id || downloadingWorkOrderId === order._id}
                              >
                                {downloadingWorkOrderId === order._id ? (
                                  <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Prenos...
                                  </span>
                                ) : (
                                  "Prenesi delovni nalog"
                                )}
                              </Button>
                              <Button
                                onClick={() => saveWorkOrder(order._id)}
                                disabled={!orderHasUnsavedChanges || isSavingOrder || isCompletingOrder || isConfirmationLocked}
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
                              {isOrderCompleted && !isConfirmationLocked ? (
                                <Button
                                  variant="secondary"
                                  onClick={() => setSignoffOrderId(order._id)}
                                >
                                  {requiresResign ? "Novo potrdilo delovnega naloga" : "Potrdilo delovnega naloga"}
                                </Button>
                              ) : null}
                              {isOrderCompleted && isConfirmationLocked ? (
                                <>
                                  {renderConfirmationDialogActions(order, false)}
                                  <Button
                                    variant="outline"
                                    onClick={() => handleSendSignedConfirmation(order)}
                                  >
                                    <Send className="mr-2 h-4 w-4" />
                                    Pošlji email s potrdilom stranki
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setCorrectionOrderId(order._id)}
                                  >
                                    Popravi potrdilo
                                  </Button>
                                </>
                              ) : null}
                            </div>
                        </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
            </div>
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

      <Dialog open={Boolean(selectedSignoffOrder)} onOpenChange={(open) => {
        if (!open) {
          setSignoffOrderId(null);
        }
      }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {`Potrdilo delovnega naloga - Projekt ${projectDisplayId || projectId}`}
            </DialogTitle>
          </DialogHeader>
          {selectedSignoffOrder ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Ekipa</p>
                  <p className="text-sm font-medium">{selectedSignoffTeamLabel || "Ni določena"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Termin izvedbe</p>
                  <p className="text-sm font-medium">{selectedSignoffExecutionDateLabel ?? "Ni določen"}</p>
                  {selectedSignoffExecutionDurationLabel ? (
                    <p className="text-xs text-muted-foreground">
                      Ocena trajanja izvedbe: {selectedSignoffExecutionDurationLabel}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Stranka</p>
                  <p className="text-sm font-medium">{selectedSignoffOrder.customerName || "Neznana stranka"}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedSignoffOrder.customerAddress || "Naslov ni zapisan"}
                  </p>
                  {selectedSignoffOrder.customerPhone ? (
                    <p className="text-sm text-muted-foreground">{selectedSignoffOrder.customerPhone}</p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2 rounded-none border border-border/70 bg-card p-4">
                <p className="text-sm font-medium">Izvedene postavke</p>
                <div className="space-y-2">
                  {(selectedSignoffOrder.items ?? []).map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-border/60 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.unit || "-"}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium tabular-nums">{typeof item.executedQuantity === "number" ? item.executedQuantity : 0}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="tabular-nums text-muted-foreground">{typeof item.offeredQuantity === "number" ? item.offeredQuantity : 0}</span>
                        {renderItemStatusBadge(item as WorkOrderItemDraft)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {getOrderConfirmationState(selectedSignoffOrder) === "signed_active" && selectedSignoffActiveConfirmation ? (
                <div className="space-y-4">
                  <div className="rounded-none border border-border/70 bg-card p-4">
                    <p className="text-sm font-medium">Potrditev izvedbe</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      S podpisom naročnik potrjuje, da so bila vsa dela izvedena, oprema dobavljena, pregledana in delujoča. Morebitne pripombe so navedene v tem dokumentu.
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      S tem se projekt šteje za zaključen.
                    </p>
                    <div className="mt-4 space-y-2">
                      <label className="text-sm font-medium">Opombe naročnika</label>
                      <div className="min-h-[104px] whitespace-pre-wrap rounded-md border border-border bg-muted/20 px-3 py-3 text-sm text-foreground">
                        {selectedSignoffActiveConfirmation.customerRemark?.trim() || "Brez opomb."}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Podpis</label>
                      <div className="rounded-lg border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 p-4">
                      {selectedSignoffActiveConfirmation.signature ? (
                        <img
                          src={selectedSignoffActiveConfirmation.signature}
                          alt="Podpis naročnika"
                          className="mx-auto max-h-[200px] w-full object-contain"
                        />
                      ) : (
                        <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
                          Podpis je shranjen.
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedSignoffActiveConfirmation.signerName || selectedSignoffOrder.customerName || "Stranka"} ·{" "}
                      {formatExecutionDateTime(selectedSignoffActiveConfirmation.signedAt ?? null) ?? "Datum ni na voljo"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 border-t pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      {renderConfirmationDialogActions(selectedSignoffOrder, false)}
                    </div>
                  </div>
                </div>
              ) : (
                <SignaturePad
                  onSign={handleCustomerSignoff}
                  signerName={selectedSignoffOrder.customerSignerName ?? selectedSignoffOrder.customerName ?? ""}
                  footerActions={renderConfirmationDialogActions(selectedSignoffOrder, true)}
                >
                  <div className="rounded-none border border-border/70 bg-card p-4">
                    <p className="text-sm font-medium">Potrditev izvedbe</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      S podpisom naročnik potrjuje, da so bila vsa dela izvedena, oprema dobavljena, pregledana in delujoča. Morebitne pripombe so navedene v tem dokumentu.
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      S tem se projekt šteje za zaključen.
                    </p>
                    <div className="mt-4 space-y-2">
                      <label className="text-sm font-medium">Opombe naročnika</label>
                      <Textarea
                        value={customerRemarkDraft}
                        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setCustomerRemarkDraft(event.target.value)}
                        placeholder="Vnesite morebitne pripombe glede izvedbe ali montaže"
                        rows={4}
                      />
                    </div>
                  </div>
                </SignaturePad>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(correctionOrderId)}
        onOpenChange={(open) => {
          if (!open && !startingCorrectionId) {
            setCorrectionOrderId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Popravi potrdilo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>Obstoječe podpisano potrdilo bo ostalo shranjeno v zgodovini.</p>
            <p>Trenutne potrjene izvedbene vrednosti bodo odklenjene za popravek.</p>
            <p>Po popravkih bo potreben nov podpis stranke, preden bo potrdilo znova veljavno.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(startingCorrectionId)}
              onClick={() => setCorrectionOrderId(null)}
            >
              Prekliči
            </Button>
            <Button
              type="button"
              disabled={!correctionOrderId || Boolean(startingCorrectionId)}
              onClick={() => {
                const targetOrder = workOrders.find((order) => order._id === correctionOrderId);
                if (targetOrder) {
                  void handleStartCorrection(targetOrder);
                }
              }}
            >
              {startingCorrectionId ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Nadaljujem...
                </span>
              ) : (
                "Nadaljuj"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <WorkOrderConfirmationComposeDialog
        open={Boolean(selectedConfirmationEmailOrder)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmationEmailOrderId(null);
          }
        }}
        projectId={projectId}
        workOrderId={selectedConfirmationEmailOrder?._id ?? null}
        customerName={selectedConfirmationEmailOrder?.customerName ?? ""}
        customerEmail={selectedConfirmationEmailOrder?.customerEmail ?? ""}
        projectName={projectDisplayId || projectId}
        workOrderIdentifier={
          selectedConfirmationEmailOrder?.code
            || selectedConfirmationEmailOrder?.title
            || projectDisplayId
            || projectId
        }
        confirmationDate={
          formatExecutionDateTime(selectedConfirmationEmailOrder?.activeConfirmationVersion?.signedAt ?? null) ?? ""
        }
        confirmationSignedAt={selectedConfirmationEmailOrder?.activeConfirmationVersion?.signedAt ?? null}
        canSendConfirmation={Boolean(
          selectedConfirmationEmailOrder && getOrderConfirmationState(selectedConfirmationEmailOrder) === "signed_active" && getActiveSignedConfirmation(selectedConfirmationEmailOrder)
        )}
        companyName=""
        onSent={async () => {
          await refreshAfterMutation();
        }}
      />
    </div>
  );
}

