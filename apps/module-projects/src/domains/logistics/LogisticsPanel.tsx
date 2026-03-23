import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  MaterialOrder,
  MaterialStatus,
  MaterialStep,
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
import { normalizeMaterialStatusLabel } from "./materialStatus";
import { useConfirmOffer } from "../core/useConfirmOffer";
import { useProjectMutationRefresh } from "../core/useProjectMutationRefresh";
import { downloadPdf } from "../../api";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
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
  mode?: "full" | "embedded";
  section?: "material" | "workorder" | "both";
  workOrderMode?: "preview" | "execute";
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

const pad2Global = (value: number) => value.toString().padStart(2, "0");
const formatDateGlobal = (date: Date) =>
  `${date.getFullYear()}-${pad2Global(date.getMonth() + 1)}-${pad2Global(date.getDate())}`;
const isWeekendDate = (date: Date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};
const adjustToWorkday = (date: Date, direction: 1 | -1) => {
  const next = new Date(date);
  while (isWeekendDate(next)) {
    next.setDate(next.getDate() + direction);
  }
  return next;
};

function buildOfferLabel(offer: ProjectLogisticsSnapshot["offerVersions"][number]) {
  return offer.title || `Verzija ${offer.versionNumber}`;
}

export function LogisticsPanel({
  projectId,
  client,
  onWorkOrderUpdated,
  mode = "full",
  section = "both",
  workOrderMode = "preview",
}: LogisticsPanelProps) {
  const [calendarOffset, setCalendarOffset] = useState(0);
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
  const [advancingMaterialOrderId, setAdvancingMaterialOrderId] = useState<string | null>(null);
  const [materialDownloading, setMaterialDownloading] = useState<"PURCHASE_ORDER" | "DELIVERY_NOTE" | null>(null);
  const [workOrderDownloading, setWorkOrderDownloading] = useState<"WORK_ORDER" | "WORK_ORDER_CONFIRMATION" | null>(null);
  const [pendingMaterialOrderIds, setPendingMaterialOrderIds] = useState<Record<string, boolean>>({});
  const timeTouchedRef = useRef(false);
  const scheduledAtRaw = typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : "";
  const [workdaysOnly, setWorkdaysOnly] = useState(true);

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
  const materialOrdersForSelectedWorkOrder = useMemo(() => {
    if (!selectedWorkOrder) return [];
    const base = filteredMaterialOrders.filter((materialOrder) => materialOrder.workOrderId === selectedWorkOrder._id);
    if (materialOrderForm?._id) {
      const merged = base.map((order) => (order._id === materialOrderForm._id ? materialOrderForm : order));
      if (merged.length > 0) return merged;
    }
    if (base.length > 0) return base;
    return materialOrderForm ? [materialOrderForm] : [];
  }, [filteredMaterialOrders, materialOrderForm, selectedWorkOrder]);

  const aggregateMaterialItems = useCallback((orders: MaterialOrder[]) => {
    const byId = new Map<string, MaterialOrder["items"][number]>();
    orders.forEach((order) => {
      (order.items ?? []).forEach((item) => {
        const key = item.id;
        if (!key) return;
        const itemQty = typeof item.quantity === "number" ? item.quantity : 0;
        const itemDelivered = typeof item.deliveredQty === "number" ? item.deliveredQty : 0;
        const existing = byId.get(key);
        if (!existing) {
          byId.set(key, { ...item, quantity: itemQty, deliveredQty: itemDelivered });
          return;
        }
        const merged = { ...existing };
        merged.quantity = (typeof merged.quantity === "number" ? merged.quantity : 0) + itemQty;
        merged.deliveredQty = (typeof merged.deliveredQty === "number" ? merged.deliveredQty : 0) + itemDelivered;
        if (!merged.name && item.name) merged.name = item.name;
        if (!merged.unit && item.unit) merged.unit = item.unit;
        if (!merged.note && item.note) merged.note = item.note;
        if (!merged.productId && item.productId) merged.productId = item.productId;
        if (!merged.dobavitelj && item.dobavitelj) merged.dobavitelj = item.dobavitelj;
        if (!merged.naslovDobavitelja && item.naslovDobavitelja) merged.naslovDobavitelja = item.naslovDobavitelja;
        byId.set(key, merged);
      });
    });
    return Array.from(byId.values());
  }, []);
  const resolveMaterialOrderById = useCallback(
    (materialOrderId: string) => {
      if (materialOrderForm?._id === materialOrderId) return materialOrderForm;
      return filteredMaterialOrders.find((order) => order._id === materialOrderId) ?? null;
    },
    [filteredMaterialOrders, materialOrderForm],
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
        scheduledConfirmedAt: selectedWorkOrder.scheduledConfirmedAt ?? null,
        assignedEmployeeIds: Array.isArray(selectedWorkOrder.assignedEmployeeIds)
          ? selectedWorkOrder.assignedEmployeeIds
          : [],
      });
    } else {
      setWorkOrderForm({});
    }
  }, [selectedWorkOrder]);

  useEffect(() => {
    if (selectedWorkOrder?.scheduledAt) {
      timeTouchedRef.current = true;
    }
  }, [selectedWorkOrder?.scheduledAt]);

  useEffect(() => {
    if (!selectedWorkOrder) return;
    if (scheduledAtRaw) return;
    const today = new Date();
    today.setDate(today.getDate() + 14);
    const todayString = formatDateGlobal(today);
    setWorkOrderForm((prev) => {
      const currentValue = typeof prev.scheduledAt === "string" ? prev.scheduledAt : "";
      if (currentValue) return prev;
      return { ...prev, scheduledAt: `${todayString}T08:00` };
    });
  }, [scheduledAtRaw, selectedWorkOrder]);

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
    setWorkOrderForm((prev) => {
      if (field === "scheduledAt") {
        return { ...prev, [field]: value, scheduledConfirmedAt: null };
      }
      return { ...prev, [field]: value };
    });
  };

  useEffect(() => {
    if (!workdaysOnly) return;
    if (!scheduledAtRaw) return;
    const [datePart, timePartRaw] = scheduledAtRaw.split("T");
    if (!datePart) return;
    const [yearRaw, monthRaw, dayRaw] = datePart.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return;
    const currentDate = new Date(year, month - 1, day);
    if (!isWeekendDate(currentDate)) return;
    const adjusted = adjustToWorkday(currentDate, 1);
    const timePart = timePartRaw?.slice(0, 5) || "08:00";
    const nextDate = formatDateGlobal(adjusted);
    handleWorkOrderChange("scheduledAt", `${nextDate}T${timePart}`);
  }, [handleWorkOrderChange, scheduledAtRaw, workdaysOnly]);

  const toggleAssignedEmployee = (employeeId: string) => {
    setWorkOrderForm((prev) => {
      const current = Array.isArray(prev.assignedEmployeeIds) ? prev.assignedEmployeeIds : [];
      const next = current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId];
      return { ...prev, assignedEmployeeIds: next };
    });
  };

  const updateMaterialOrderForm = useCallback(
    (materialOrderId: string, updates: Partial<MaterialOrder>) => {
      const currentMaterial = resolveMaterialOrderById(materialOrderId);
      if (!currentMaterial) return;
      setMaterialOrderForm((prev) => {
        const base = prev && prev._id === materialOrderId ? prev : currentMaterial;
        return { ...base, ...updates };
      });
      setPendingMaterialOrderIds((prev) => ({ ...prev, [materialOrderId]: true }));
    },
    [resolveMaterialOrderById],
  );

  const addExtraMaterialItem = useCallback(
    (
      materialOrderId: string,
      draft: { productId: string | null; name: string; unit: string; quantity: number; note: string },
    ) => {
      const currentMaterial = resolveMaterialOrderById(materialOrderId);
      if (!currentMaterial) return;
      const extraItem = {
        id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId: draft.productId,
        name: draft.name.trim(),
        quantity: 0,
        deliveredQty: Math.max(0, Number(draft.quantity) || 0),
        unit: draft.unit.trim(),
        note: draft.note.trim(),
        dobavitelj: "",
        naslovDobavitelja: "",
        materialStep: "Prevzeto" as MaterialStep,
        isExtra: true,
      };
      const nextItems = [...(Array.isArray(currentMaterial.items) ? currentMaterial.items : []), extraItem];
      updateMaterialOrderForm(materialOrderId, { items: nextItems });
    },
    [resolveMaterialOrderById, updateMaterialOrderForm],
  );

  const handleDownloadMaterialPdf = async (
    materialOrderId: string,
    docType: "PURCHASE_ORDER" | "DELIVERY_NOTE",
  ) => {
    const target = resolveMaterialOrderById(materialOrderId) ?? materialOrderForm ?? selectedMaterialOrder ?? null;
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

  const handleAdvanceMaterialStep = async (materialOrderId: string, targetStep: MaterialStep) => {
    if (!materialOrderId) return;
    setAdvancingMaterialOrderId(materialOrderId);
    try {
      const response = await fetch(`/api/projects/${projectId}/material-orders/${materialOrderId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStep }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Napaka pri posodabljanju materiala.");
        return;
      }
      if (payload.data?.materialOrders) {
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                materialOrders: payload.data.materialOrders,
                materialOrder: payload.data.materialOrders[0] ?? prev.materialOrder,
              }
            : prev,
        );
      }
      await refreshAfterMutation(fetchSnapshot);
    } catch (error) {
      toast.error("Napaka pri posodabljanju materiala.");
    } finally {
      setAdvancingMaterialOrderId(null);
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
      const hasOverrideConfirmedAt =
        workOrderOverrides && Object.prototype.hasOwnProperty.call(workOrderOverrides, "scheduledConfirmedAt");
      const resolvedScheduledConfirmedAt = hasOverrideConfirmedAt
        ? workOrderOverrides?.scheduledConfirmedAt
        : typeof workOrderForm.scheduledConfirmedAt === "string"
          ? workOrderForm.scheduledConfirmedAt
          : workOrderForm.scheduledConfirmedAt === null
            ? null
            : undefined;
      const response = await fetch(`/api/projects/${projectId}/work-orders/${selectedWorkOrder._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: selectedWorkOrder._id,
          scheduledAt: typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : null,
          scheduledConfirmedAt: resolvedScheduledConfirmedAt,
          assignedEmployeeIds: Array.isArray(workOrderForm.assignedEmployeeIds) ? workOrderForm.assignedEmployeeIds : [],
          location: workOrderForm.location ?? "",
          notes: workOrderForm.notes ?? "",
          status: workOrderOverrides?.status ?? workOrderForm.status ?? undefined,
          items: Array.isArray(workOrderOverrides?.items) ? workOrderOverrides?.items : undefined,
          materialOrderId: materialOverrides?._id ?? currentMaterial?._id ?? null,
          materialStatus: materialOverrides?.materialStatus ?? currentMaterial?.materialStatus ?? undefined,
          materialAssignedEmployeeIds: Array.isArray(workOrderForm.assignedEmployeeIds)
            ? workOrderForm.assignedEmployeeIds
            : undefined,
          pickupMethod: materialOverrides?.pickupMethod ?? currentMaterial?.pickupMethod ?? undefined,
          pickupLocation: materialOverrides?.pickupLocation ?? currentMaterial?.pickupLocation ?? undefined,
          logisticsOwnerId: materialOverrides?.logisticsOwnerId ?? currentMaterial?.logisticsOwnerId ?? undefined,
          pickupNote: materialOverrides?.pickupNote ?? currentMaterial?.pickupNote ?? undefined,
          deliveryNotePhotos: Array.isArray(materialOverrides?.deliveryNotePhotos)
            ? materialOverrides?.deliveryNotePhotos
            : Array.isArray(currentMaterial?.deliveryNotePhotos)
              ? currentMaterial?.deliveryNotePhotos
              : undefined,
          pickupConfirmedAt:
            materialOverrides && Object.prototype.hasOwnProperty.call(materialOverrides, "pickupConfirmedAt")
              ? materialOverrides.pickupConfirmedAt
              : currentMaterial?.pickupConfirmedAt ?? undefined,
          materialItems: Array.isArray(materialOverrides?.items)
            ? materialOverrides?.items
            : Array.isArray(currentMaterial?.items)
              ? currentMaterial?.items
              : undefined,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Delovnega naloga ni mogoce shraniti.");
        return false;
      }
      const updated: LogisticsWorkOrder = payload.data;
      const mergedWorkOrder = { ...updated, ...(workOrderOverrides ?? {}) };
      const materialTargetId = materialOverrides?._id ?? currentMaterial?._id ?? null;
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
        const materialBase =
          materialTargetId !== null
            ? previousMaterialOrders.find((order) => order._id === materialTargetId) ?? currentMaterial
            : currentMaterial;
        const mergedMaterial = materialBase
          ? { ...materialBase, ...(materialOverrides ?? {}) }
          : materialBase;
        const nextMaterialOrders = mergedMaterial && mergedMaterial._id
          ? previousMaterialOrders.some((materialOrder) => materialOrder._id === mergedMaterial._id)
            ? previousMaterialOrders.map((materialOrder) =>
                materialOrder._id === mergedMaterial._id ? mergedMaterial : materialOrder,
              )
            : [...previousMaterialOrders, mergedMaterial]
          : previousMaterialOrders;

        const selectedMaterial =
          (materialTargetId
            ? nextMaterialOrders.find((order) => order._id === materialTargetId)
            : nextMaterialOrders.find((order) => order.workOrderId === mergedWorkOrder._id)) ?? null;

        return {
          ...prev,
          workOrders: nextWorkOrders,
          workOrder: mergedWorkOrder,
          materialOrders: nextMaterialOrders,
          materialOrder: selectedMaterial ?? nextMaterialOrders[0] ?? null,
        };
      });
      const materialBase =
        materialTargetId !== null
          ? (materialOrderForm?._id === materialTargetId ? materialOrderForm : currentMaterial)
          : currentMaterial;
      const mergedMaterial = materialBase
        ? { ...materialBase, ...(materialOverrides ?? {}) }
        : materialBase;
      if (mergedMaterial && materialOrderForm?._id === mergedMaterial._id) {
        setMaterialOrderForm((prev) => (prev ? { ...prev, ...(materialOverrides ?? {}), ...mergedMaterial } : mergedMaterial));
      }
      setWorkOrderForm({
        ...mergedWorkOrder,
        scheduledAt: mergedWorkOrder.scheduledAt ?? "",
        scheduledConfirmedAt: mergedWorkOrder.scheduledConfirmedAt ?? null,
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
  const effectiveMaterialStatusLabel = normalizeMaterialStatusLabel(effectiveMaterialStatus);

  const resolveField = (value?: string | null, fallback?: string | null) => (value ?? fallback ?? "").trim();

  const resolvedCustomerName = resolveField(workOrderForm.customerName, selectedWorkOrder?.customerName);
  const resolvedCustomerAddress = resolveField(workOrderForm.customerAddress, selectedWorkOrder?.customerAddress);
  const resolvedCustomerEmail = resolveField(workOrderForm.customerEmail, selectedWorkOrder?.customerEmail);
  const resolvedCustomerPhone = resolveField(workOrderForm.customerPhone, selectedWorkOrder?.customerPhone);
  const resolvedSchedule = resolveField(
    typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : undefined,
    selectedWorkOrder?.scheduledAt ?? undefined,
  );
  const resolvedScheduleConfirmedAt = resolveField(
    typeof workOrderForm.scheduledConfirmedAt === "string" ? workOrderForm.scheduledConfirmedAt : undefined,
    selectedWorkOrder?.scheduledConfirmedAt ?? undefined,
  );
  const isTermConfirmed = Boolean(resolvedScheduleConfirmedAt);
  const canConfirmSchedule = Boolean(resolvedSchedule && !isTermConfirmed);
  const hasAssignedTeam = (workOrderForm.assignedEmployeeIds ?? selectedWorkOrder?.assignedEmployeeIds ?? []).length > 0;

  const canIssueOrder = Boolean(resolvedSchedule && hasAssignedTeam && isTermConfirmed);

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

  const handleConfirmSchedule = async () => {
    if (!resolvedSchedule || !selectedWorkOrder) return;
    const confirmedAt = new Date().toISOString();
    setWorkOrderForm((prev) => ({ ...prev, scheduledConfirmedAt: confirmedAt }));
    const saved = await handleSaveWorkOrder(undefined, { scheduledConfirmedAt: confirmedAt });
    if (saved) {
      toast.success("Termin potrjen.");
    }
  };

  const handleUnconfirmSchedule = async () => {
    if (!selectedWorkOrder) return;
    setWorkOrderForm((prev) => ({ ...prev, scheduledConfirmedAt: null }));
    const saved = await handleSaveWorkOrder(undefined, { scheduledConfirmedAt: null });
    if (saved) {
      toast.success("Potrditev termina odstranjena.");
    }
  };

  const updateWorkOrderItemQty = async (itemId: string, deliveredQty: number, shouldSave: boolean) => {
    const currentItems =
      Array.isArray(workOrderForm.items) && workOrderForm.items.length > 0
        ? workOrderForm.items
        : Array.isArray(selectedWorkOrder?.items)
          ? selectedWorkOrder?.items ?? []
          : [];
    const nextItems = currentItems.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        executedQuantity: Math.max(0, deliveredQty),
      };
    });
    setWorkOrderForm((prev) => ({ ...prev, items: nextItems }));
    if (shouldSave) {
      await handleSaveWorkOrder(undefined, { items: nextItems });
    }
  };

  const renderWorkOrder = (workOrder: LogisticsWorkOrder | null) => {
    if (!workOrder) {
      return <p className="text-sm text-muted-foreground">Delovni nalog bo ustvarjen ob potrditvi ponudbe.</p>;
    }

    const customerName = workOrder.customerName || client?.name || "";
    const customerAddress = workOrder.customerAddress || formatClientAddress(client ?? null) || "";
    const customerEmail = workOrder.customerEmail || client?.email || "";
    const customerPhone = workOrder.customerPhone || client?.phone || "";
    const canDownloadWorkOrderPdf = !!workOrder?._id;
    const [streetRaw, postalRaw] = customerAddress.split(/,(.+)/);
    const streetLine = streetRaw?.trim() ?? "";
    const postalLine = postalRaw?.trim() ?? "";
    const scheduledAtValue = typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : "";
    const [datePart, timePartRaw] = scheduledAtValue.split("T");
    const timePart = timePartRaw?.slice(0, 5) ?? "";
    const [hoursRaw, minutesRaw] = timePart.split(":");
    const hoursValue = Number(hoursRaw ?? "0");
    const minutesValue = Number(minutesRaw ?? "0");
    const workOrderItems =
      Array.isArray(workOrderForm.items) && workOrderForm.items.length > 0
        ? workOrderForm.items
        : Array.isArray(workOrder.items)
          ? workOrder.items
          : [];
    const materialItems =
      materialOrdersForSelectedWorkOrder.length > 0
        ? aggregateMaterialItems(materialOrdersForSelectedWorkOrder)
        : Array.isArray(materialOrderForm?.items)
          ? materialOrderForm?.items ?? []
          : Array.isArray(selectedMaterialOrder?.items)
            ? selectedMaterialOrder?.items ?? []
            : [];
    const materialItemsById = new Map(materialItems.map((item) => [item.id, item]));
    const totalMinutes = workOrderItems.reduce((sum, item) => {
      const quantity = typeof item.quantity === "number" ? item.quantity : 0;
      const casovnaNorma = typeof item.casovnaNorma === "number" ? item.casovnaNorma : 0;
      return sum + quantity * casovnaNorma;
    }, 0);
    const formatDuration = (value: number) => {
      if (value <= 0) return "0 min";
      if (value < 60) return `${value} min`;
      const hours = Math.floor(value / 60);
      const minutes = value % 60;
      return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
    };
    const durationLabel = formatDuration(totalMinutes);
    const todayPlus21 = new Date();
    todayPlus21.setDate(todayPlus21.getDate() + 21);
    const calendarAnchor = datePart ? new Date(`${datePart}T00:00:00`) : todayPlus21;
    const anchorYear = calendarAnchor.getFullYear();
    const anchorMonth = calendarAnchor.getMonth();
    const pad2 = (value: number) => value.toString().padStart(2, "0");
    const formatDate = (date: Date) =>
      `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    const anchorDateString = formatDate(calendarAnchor);
    const monthNames = [
      "Januar",
      "Februar",
      "Marec",
      "April",
      "Maj",
      "Junij",
      "Julij",
      "Avgust",
      "September",
      "Oktober",
      "November",
      "December",
    ];
    const firstMonth = new Date(anchorYear, anchorMonth + calendarOffset, 1);
    const secondMonth = new Date(anchorYear, anchorMonth + calendarOffset + 1, 1);
    const firstMonthStart = new Date(firstMonth.getFullYear(), firstMonth.getMonth(), 1);
    const secondMonthStart = new Date(secondMonth.getFullYear(), secondMonth.getMonth(), 1);
    const firstDaysInMonth = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + 1, 0).getDate();
    const secondDaysInMonth = new Date(secondMonth.getFullYear(), secondMonth.getMonth() + 1, 0).getDate();
    const firstStartOffset = (firstMonthStart.getDay() + 6) % 7;
    const secondStartOffset = (secondMonthStart.getDay() + 6) % 7;
    const calendarMonths = [
      { month: firstMonth, days: firstDaysInMonth, offset: firstStartOffset },
      { month: secondMonth, days: secondDaysInMonth, offset: secondStartOffset },
    ];
    const todayDateString = formatDate(new Date());
    const baseDateString = datePart || anchorDateString;
    const [baseYearRaw, baseMonthRaw, baseDayRaw] = baseDateString.split("-");
    const baseYear = Number(baseYearRaw ?? anchorYear);
    const baseMonth = Number(baseMonthRaw ?? anchorMonth + 1);
    const baseDay = Number(baseDayRaw ?? 1);
    const dowLabels = ["NED", "PON", "TOR", "SRE", "\u010cET", "PET", "SOB"];
    const baseDateForDow = new Date(baseYear, baseMonth - 1, baseDay);
    const dowLabel = Number.isNaN(baseDateForDow.getTime()) ? "?" : dowLabels[baseDateForDow.getDay()];
    const setDateParts = (year: number, month: number, day: number, direction: 1 | -1 | 0 = 0) => {
      const safeYear = Number.isFinite(year) ? year : anchorYear;
      const safeMonth = Math.min(12, Math.max(1, Number.isFinite(month) ? month : anchorMonth + 1));
      const daysInTarget = new Date(safeYear, safeMonth, 0).getDate();
      const safeDay = Math.min(daysInTarget, Math.max(1, Number.isFinite(day) ? day : 1));
      const tentativeDate = new Date(safeYear, safeMonth - 1, safeDay);
      if (workdaysOnly && direction === 0 && isWeekendDate(tentativeDate)) {
        return;
      }
      const targetDate = workdaysOnly && direction !== 0 ? adjustToWorkday(tentativeDate, direction) : tentativeDate;
      const nextDate = formatDate(targetDate);
      const shouldDefaultTime = !timeTouchedRef.current && !timePartRaw;
      const nextHours = shouldDefaultTime ? 8 : hoursValue;
      const nextMinutes = shouldDefaultTime ? 0 : minutesValue;
      handleWorkOrderChange("scheduledAt", `${nextDate}T${pad2(nextHours)}:${pad2(nextMinutes)}`);
    };
    const updateTimeValue = (nextHours: number, nextMinutes: number) => {
      timeTouchedRef.current = true;
      const hours = Math.min(23, Math.max(0, nextHours));
      const minutes = Math.min(55, Math.max(0, Math.round(nextMinutes / 5) * 5));
      const nextDate = baseDateString;
      handleWorkOrderChange("scheduledAt", `${nextDate}T${pad2(hours)}:${pad2(minutes)}`);
    };
    return (
      <div className="space-y-5">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Podatki stranke</p>
              <div className="space-y-1 text-sm">
                {customerName && <p>{customerName}</p>}
                {customerEmail && <p>{customerEmail}</p>}
                {customerPhone && <p>{customerPhone}</p>}
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">Naslov:</span>
                <div className="text-right">
                  {streetLine && <div>{streetLine}</div>}
                  {postalLine && <div>{postalLine}</div>}
                </div>
              </div>
            </div>
          </div>
          <hr className="border-border/60" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Termin izvedbe</label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={workdaysOnly}
                  onChange={(event) => setWorkdaysOnly(event.target.checked)}
                  disabled={isTermConfirmed}
                />
                <span>Samo delovni dnevi</span>
              </label>
              <div className="grid gap-3">
                <div className="rounded-md border border-input bg-background p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
                    <button
                      type="button"
                      className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                      onClick={() => setCalendarOffset((prev) => prev - 1)}
                      aria-label={"Prejšnji mesec"}
                      disabled={isTermConfirmed}
                    >
                      {"‹"}
                    </button>
                    <div className="flex flex-1 justify-between gap-4 text-center">
                      <span className="pointer-events-none cursor-default">
                        {monthNames[firstMonth.getMonth()]} {firstMonth.getFullYear()}
                      </span>
                      <span className="pointer-events-none cursor-default">
                        {monthNames[secondMonth.getMonth()]} {secondMonth.getFullYear()}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                      onClick={() => setCalendarOffset((prev) => prev + 1)}
                      aria-label={"Naslednji mesec"}
                      disabled={isTermConfirmed}
                    >
                      {"›"}
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {calendarMonths.map((entry) => {
                      const monthYear = entry.month.getFullYear();
                      const monthIndex = entry.month.getMonth();
                      return (
                        <div
                          key={`${monthYear}-${monthIndex}`}
                          className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground"
                        >
                          {["Po", "To", "Sr", "Če", "Pe", "So", "Ne"].map((label) => (
                            <span key={`${monthYear}-${monthIndex}-${label}`} className="py-1">
                              {label}
                            </span>
                          ))}
                          {Array.from({ length: entry.offset }).map((_, index) => (
                            <span key={`${monthYear}-${monthIndex}-empty-${index}`} className="py-1" />
                          ))}
                          {Array.from({ length: entry.days }).map((_, index) => {
                            const day = index + 1;
                            const dayDate = `${monthYear}-${pad2(monthIndex + 1)}-${pad2(day)}`;
                            const isSelected = datePart === dayDate;
                            const isToday = dayDate === todayDateString;
                            const isWeekend = isWeekendDate(new Date(monthYear, monthIndex, day));
                            const isDisabled = (workdaysOnly && isWeekend) || isTermConfirmed;
                            return (
                              <button
                                key={dayDate}
                                type="button"
                                className={`rounded-md py-1 text-sm transition ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : isDisabled
                                      ? "cursor-not-allowed text-muted-foreground/40"
                                      : "hover:bg-muted"
                                } ${isToday ? "rounded-full ring-2 ring-red-500 ring-offset-0" : ""}`}
                                disabled={isDisabled}
                                onClick={() => {
                                  if (isDisabled) return;
                                  setDateParts(monthYear, monthIndex + 1, day);
                                }}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-md border border-input bg-background px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                      <span className="text-base font-semibold tabular-nums">{dowLabel}</span>
                      <span className="text-base font-semibold">-</span>
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            className="rounded-md border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                            onClick={() => setDateParts(baseYear, baseMonth, baseDay + 1, 1)}
                            aria-label={"Povečaj dan"}
                            disabled={isTermConfirmed}
                          >
                            +
                          </button>
                          <div className="text-base font-semibold tabular-nums">{baseDay}</div>
                          <button
                            type="button"
                            className="rounded-md border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                            onClick={() => setDateParts(baseYear, baseMonth, baseDay - 1, -1)}
                            aria-label={"Zmanjšaj dan"}
                            disabled={isTermConfirmed}
                          >
                            -
                          </button>
                        </div>
                        <span className="text-base font-semibold">.</span>
                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            className="rounded-md border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                            onClick={() => setDateParts(baseYear, baseMonth + 1, baseDay, 1)}
                            aria-label={"Povečaj mesec"}
                            disabled={isTermConfirmed}
                          >
                            +
                          </button>
                          <div className="text-base font-semibold tabular-nums">{baseMonth}</div>
                          <button
                            type="button"
                            className="rounded-md border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                            onClick={() => setDateParts(baseYear, baseMonth - 1, baseDay, -1)}
                            aria-label={"Zmanjšaj mesec"}
                            disabled={isTermConfirmed}
                          >
                            -
                          </button>
                        </div>
                        <span className="text-base font-semibold">.</span>
                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            className="rounded-md border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                            onClick={() => setDateParts(baseYear + 1, baseMonth, baseDay, 1)}
                            aria-label={"Povečaj leto"}
                            disabled={isTermConfirmed}
                          >
                            +
                          </button>
                          <div className="text-base font-semibold tabular-nums">{baseYear}</div>
                          <button
                            type="button"
                            className="rounded-md border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                            onClick={() => setDateParts(baseYear - 1, baseMonth, baseDay, -1)}
                            aria-label={"Zmanjšaj leto"}
                            disabled={isTermConfirmed}
                          >
                            -
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            className="rounded-md border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                            onClick={() => updateTimeValue(hoursValue + 1, minutesValue)}
                            aria-label={"Povečaj ure"}
                            disabled={isTermConfirmed}
                          >
                            +
                          </button>
                          <div className="text-base font-semibold tabular-nums">{Number.isFinite(hoursValue) ? hoursValue : 0}</div>
                          <button
                            type="button"
                            className="rounded-md border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                            onClick={() => updateTimeValue(hoursValue - 1, minutesValue)}
                            aria-label={"Zmanjšaj ure"}
                            disabled={isTermConfirmed}
                          >
                            -
                          </button>
                        </div>
                        <span className="text-base font-semibold">:</span>
                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            className="rounded-md border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                            onClick={() => updateTimeValue(hoursValue, minutesValue + 5)}
                            aria-label={"Povečaj minute"}
                            disabled={isTermConfirmed}
                          >
                            +
                          </button>
                          <div className="text-base font-semibold tabular-nums">{pad2(Number.isFinite(minutesValue) ? minutesValue : 0)}</div>
                          <button
                            type="button"
                            className="rounded-md border border-input px-2 py-0.5 text-[10px] hover:bg-muted"
                            onClick={() => updateTimeValue(hoursValue, minutesValue - 5)}
                            aria-label={"Zmanjšaj minute"}
                            disabled={isTermConfirmed}
                          >
                            -
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isTermConfirmed ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleUnconfirmSchedule}
                          disabled={savingWorkOrder}
                        >
                          Prekliči termin
                        </Button>
                      ) : resolvedSchedule ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleConfirmSchedule}
                          disabled={!canConfirmSchedule || savingWorkOrder}
                        >
                          Potrdi termin
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Ocena trajanja izvedbe: <span className="font-medium text-foreground">{durationLabel}</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tehniki (ekipa)</label>
                <div className="flex flex-wrap gap-2">
                  {employees.filter((employee) => employee.active).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ni zaposlenih.</p>
                  ) : (
                    employees
                      .filter((employee) => employee.active)
                      .map((employee) => {
                        const isSelected = (workOrderForm.assignedEmployeeIds ?? []).includes(employee.id);
                        return (
                          <button
                            key={employee.id}
                            type="button"
                            onClick={() => toggleAssignedEmployee(employee.id)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              isSelected
                                ? "border-primary bg-primary/10 !text-primary"
                                : "border-border bg-card !text-muted-foreground hover:border-primary"
                            }`}
                          >
                            {employee.name}
                          </button>
                        );
                      })
                  )}
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
              <div className="space-y-1">
                <label className="text-sm font-medium">Status materiala</label>
                <p className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                  {effectiveMaterialStatusLabel ?? "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="hidden overflow-hidden rounded-[var(--radius-card)] border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow>
                {workOrderMode === "execute" ? (
                  <TableHead className="text-right w-[56px]">Imamo</TableHead>
                ) : null}
                <TableHead>Artikel</TableHead>
                <TableHead className="text-center tabular-nums w-[90px]">{"Količina"}</TableHead>
                <TableHead className="text-center tabular-nums w-[90px]">Enota</TableHead>
                {workOrderMode === "execute" ? (
                  <>
                    <TableHead className="text-center tabular-nums w-[90px]">Razlika</TableHead>
                  </>
                ) : (
                  <TableHead className="text-center w-[96px]">Pripravljeno</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(workOrder.items ?? []).map((item) => {
                const requiredQty = typeof item.quantity === "number" ? item.quantity : 0;
                if (workOrderMode !== "execute") {
                  const materialKey = item.offerItemId ?? item.id;
                  const materialItem = materialItemsById.get(materialKey);
                  const isService = Boolean(item.isService) || (Boolean(item.productId) && !materialItem);
                  const materialRequired =
                    typeof materialItem?.quantity === "number" ? materialItem.quantity : requiredQty;
                  const deliveredQty = typeof materialItem?.deliveredQty === "number" ? materialItem.deliveredQty : 0;
                  const isReady = isService ? hasAssignedTeam : deliveredQty - materialRequired >= 0;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-center tabular-nums w-[90px]">{item.quantity}</TableCell>
                      <TableCell className="text-center tabular-nums w-[90px]">{item.unit}</TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                            isReady
                              ? "border-green-600 bg-green-600 text-white"
                              : "border-red-600 text-red-600"
                          }`}
                        >
                          {isReady ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                }
                const executedQty = typeof item.executedQuantity === "number" ? item.executedQuantity : 0;
                const diff = executedQty - requiredQty;
                const status = diff === 0 ? "ok" : diff < 0 ? "missing" : "extra";
                const isEnough = diff >= 0;
                const borderClass =
                  status === "ok" ? "border-green-600" : status === "missing" ? "border-red-600" : "border-orange-500";
                const fillClass =
                  status === "ok" ? "bg-green-600" : status === "missing" ? "bg-transparent" : "bg-orange-500";
                const displayDelta = diff > 0 ? `+${diff}` : `${diff}`;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-right w-[56px] align-top">
                      <label className="relative inline-flex items-center justify-center cursor-pointer p-1">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          aria-label="Imamo material"
                          checked={isEnough}
                          onChange={() => {
                            void updateWorkOrderItemQty(item.id, requiredQty, true);
                          }}
                        />
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                            isEnough ? fillClass : "bg-transparent"
                          } ${borderClass} peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40`}
                        >
                          {isEnough && (
                            <svg
                              viewBox="0 0 20 20"
                              aria-hidden="true"
                              className="h-4 w-4 text-white"
                              fill="currentColor"
                            >
                              <path d="M7.667 13.4 4.6 10.333l-1.2 1.2 4.267 4.267 8-8-1.2-1.2-6 6z" />
                            </svg>
                          )}
                        </span>
                      </label>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{item.name}</span>
                        {diff < 0 && (
                          <Badge
                            variant="destructive"
                            className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700"
                          >
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            Manjka {Math.abs(diff)}
                          </Badge>
                        )}
                        {diff > 0 && (
                          <Badge className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-700">
                            Dodatno {diff}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums w-[90px]">{item.quantity}</TableCell>
                    <TableCell className="text-center tabular-nums w-[90px]">{item.unit}</TableCell>
                    <TableCell className="text-center tabular-nums w-[90px]">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => {
                            const nextExecuted = Math.max(0, executedQty - 1);
                            void updateWorkOrderItemQty(item.id, nextExecuted, true);
                          }}
                          aria-label={"Zmanjšaj razliko"}
                        >
                          -
                        </Button>
                        <span className="min-w-[28px] text-center tabular-nums">{displayDelta}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => {
                            const nextExecuted = executedQty + 1;
                            void updateWorkOrderItemQty(item.id, nextExecuted, true);
                          }}
                          aria-label={"Povečaj razliko"}
                        >
                          +
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-3 md:hidden">
          {(workOrder.items ?? []).map((item) => {
            const requiredQty = typeof item.quantity === "number" ? item.quantity : 0;
            if (workOrderMode !== "execute") {
              const materialKey = item.offerItemId ?? item.id;
              const materialItem = materialItemsById.get(materialKey);
              const isService = Boolean(item.isService) || (Boolean(item.productId) && !materialItem);
              const materialRequired =
                typeof materialItem?.quantity === "number" ? materialItem.quantity : requiredQty;
              const deliveredQty = typeof materialItem?.deliveredQty === "number" ? materialItem.deliveredQty : 0;
              const isReady = isService ? hasAssignedTeam : deliveredQty - materialRequired >= 0;
              return (
                <div key={item.id} className="space-y-3 rounded-[var(--radius-card)] border border-border/70 bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-5">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.unit || "-"}</p>
                    </div>
                    <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                        isReady
                          ? "border-green-600 bg-green-600 text-white"
                          : "border-red-600 text-red-600"
                      }`}
                      aria-label={isReady ? "Pripravljeno" : "Ni pripravljeno"}
                    >
                      {isReady ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Količina</p>
                      <p className="font-medium tabular-nums">{requiredQty}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pripravljeno</p>
                      <p className="font-medium">{isReady ? "Da" : "Ne"}</p>
                    </div>
                  </div>
                </div>
              );
            }
            const executedQty = typeof item.executedQuantity === "number" ? item.executedQuantity : 0;
            const diff = executedQty - requiredQty;
            const status = diff === 0 ? "ok" : diff < 0 ? "missing" : "extra";
            const isEnough = diff >= 0;
            const borderClass =
              status === "ok" ? "border-green-600" : status === "missing" ? "border-red-600" : "border-orange-500";
            const fillClass =
              status === "ok" ? "bg-green-600" : status === "missing" ? "bg-transparent" : "bg-orange-500";
            const displayDelta = diff > 0 ? `+${diff}` : `${diff}`;
            return (
              <div key={item.id} className="space-y-3 rounded-[var(--radius-card)] border border-border/70 bg-card p-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm font-semibold leading-5">{item.name}</p>
                    {diff < 0 && (
                      <Badge
                        variant="destructive"
                        className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700"
                      >
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Manjka {Math.abs(diff)}
                      </Badge>
                    )}
                    {diff > 0 && (
                      <Badge className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-700">
                        Dodatno {diff}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.unit || "-"}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Količina</p>
                    <p className="font-medium tabular-nums">{requiredQty}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Razlika</p>
                    <p className="font-medium tabular-nums">{displayDelta}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Imamo</p>
                    <p className="text-sm font-medium">{isEnough ? "Da" : "Ne"}</p>
                  </div>
                  <label className="relative inline-flex items-center justify-center cursor-pointer p-1">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      aria-label="Imamo material"
                      checked={isEnough}
                      onChange={() => {
                        void updateWorkOrderItemQty(item.id, requiredQty, true);
                      }}
                    />
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                        isEnough ? fillClass : "bg-transparent"
                      } ${borderClass} peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40`}
                    >
                      {isEnough && (
                        <svg
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                          className="h-4 w-4 text-white"
                          fill="currentColor"
                        >
                          <path d="M7.667 13.4 4.6 10.333l-1.2 1.2 4.267 4.267 8-8-1.2-1.2-6 6z" />
                        </svg>
                      )}
                    </span>
                  </label>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Glavna akcija</p>
                    <p className="text-sm text-muted-foreground">Posodobi izvedeno količino</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      onClick={() => {
                        const nextExecuted = Math.max(0, executedQty - 1);
                        void updateWorkOrderItemQty(item.id, nextExecuted, true);
                      }}
                      aria-label={"Zmanjšaj razliko"}
                    >
                      -
                    </Button>
                    <span className="min-w-[34px] text-center text-sm font-medium tabular-nums">{displayDelta}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      onClick={() => {
                        const nextExecuted = executedQty + 1;
                        void updateWorkOrderItemQty(item.id, nextExecuted, true);
                      }}
                      aria-label={"Povečaj razliko"}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownloadWorkOrderPdf("WORK_ORDER")}
              disabled={!canDownloadWorkOrderPdf || (workOrderDownloading !== null && workOrderDownloading !== "WORK_ORDER")}
            >
              {workOrderDownloading === "WORK_ORDER" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Prenesi nalog
            </Button>
            <Button
              variant="outline"
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => handleSaveWorkOrder()} disabled={savingWorkOrder}>
              {savingWorkOrder ? "Shranjujem..." : "Shrani podatke"}
            </Button>
            <Button onClick={handleIssueWorkOrder} disabled={!canIssueOrder || savingWorkOrder || issuingOrder}>
              {issuingOrder ? "Izdajam..." : "Izdaj nalog"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const updateDeliveredQty = async (
    materialOrderId: string,
    itemId: string,
    deliveredQty: number,
    shouldSave: boolean,
  ) => {
    const currentMaterial = resolveMaterialOrderById(materialOrderId);
    if (!currentMaterial) return;
    const nextItems = (currentMaterial.items ?? []).map((item) => {
      if (item.id !== itemId) return item;
      const clamped = Math.max(0, deliveredQty);
      return { ...item, deliveredQty: clamped };
    });
    if (materialOrderForm?._id === materialOrderId) {
      setMaterialOrderForm((prev) => (prev ? { ...prev, items: nextItems } : prev));
    }
    if (shouldSave) {
      const saved = await handleSaveWorkOrder({ _id: materialOrderId, items: nextItems });
      if (saved) {
        setPendingMaterialOrderIds((prev) => ({ ...prev, [materialOrderId]: false }));
      }
      return;
    }
    setPendingMaterialOrderIds((prev) => ({ ...prev, [materialOrderId]: true }));
  };

  const handleConfirmPickup = async (materialOrderId: string) => {
    const currentMaterial = resolveMaterialOrderById(materialOrderId);
    if (!currentMaterial) return;
    const confirmedAt = new Date().toISOString();
    const nextItems = (currentMaterial.items ?? []).map((item) => {
      const plannedQty = typeof item.quantity === "number" ? item.quantity : 0;
      const takenQty = typeof item.deliveredQty === "number" ? item.deliveredQty : 0;
      return {
        ...item,
        materialStep: item.isExtra ? "Prevzeto" : takenQty >= plannedQty ? "Prevzeto" : item.materialStep ?? "Za prevzem",
      };
    });
    const nextMaterial: Partial<MaterialOrder> = {
      _id: materialOrderId,
      items: nextItems,
      materialStatus: "Prevzeto",
      pickupConfirmedAt: confirmedAt,
      assignedEmployeeIds: Array.isArray(workOrderForm.assignedEmployeeIds) ? workOrderForm.assignedEmployeeIds : [],
    };
    updateMaterialOrderForm(materialOrderId, nextMaterial);
    const saved = await handleSaveWorkOrder(nextMaterial);
    if (saved) {
      setPendingMaterialOrderIds((prev) => ({ ...prev, [materialOrderId]: false }));
      toast.success("Prevzem materiala potrjen.");
    }
  };

  const saveMaterialOrderChanges = async (materialOrderId: string): Promise<boolean> => {
    const currentMaterial = resolveMaterialOrderById(materialOrderId);
    if (!currentMaterial) return false;
    const saved = await handleSaveWorkOrder({
      _id: materialOrderId,
      items: Array.isArray(currentMaterial.items) ? currentMaterial.items : [],
    });
    if (saved) {
      setPendingMaterialOrderIds((prev) => ({ ...prev, [materialOrderId]: false }));
    }
    return saved;
  };

  const handleAdvanceMaterialStepWithSave = async (materialOrderId: string, targetStep: MaterialStep) => {
    if (pendingMaterialOrderIds[materialOrderId]) {
      const saved = await saveMaterialOrderChanges(materialOrderId);
      if (!saved) return;
    }
    await handleAdvanceMaterialStep(materialOrderId, targetStep);
  };

  const shouldShowOfferSelector = confirmedOffers.length > 0;
  const shouldRenderOfferDropdown = confirmedOffers.length > 1;

  const headerWorkOrderStatus: WorkOrderStatus =
    (workOrderForm.status as WorkOrderStatus) ?? (selectedWorkOrder?.status as WorkOrderStatus) ?? "draft";
  const materialOrdersForDisplay = useMemo(() => {
    if (filteredMaterialOrders.length > 0) {
      return filteredMaterialOrders.map((order) =>
        materialOrderForm && order._id === materialOrderForm._id ? materialOrderForm : order,
      );
    }
    return materialOrderForm ? [materialOrderForm] : [];
  }, [filteredMaterialOrders, materialOrderForm]);

  if (mode === "embedded") {
    return (
      <div className="space-y-6">
        {section === "material" || section === "both" ? (
          <Card id="dashboard-logistics-material">
            <CardHeader className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Material</p>
                <CardTitle className="mt-1">Naročilo za material</CardTitle>
                <p className="text-sm text-muted-foreground">Upravljaj status naročila in spremljaj pripravo materiala.</p>
              </div>
            </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {materialOrdersForDisplay.length === 0 ? (
                <span className="text-sm text-muted-foreground">Naročilo za material še ni ustvarjeno.</span>
              ) : (
                materialOrdersForDisplay.map((order) => (
                  <MaterialOrderCard
                    key={order._id}
                    materialOrder={order}
                    executionDate={typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : selectedWorkOrder?.scheduledAt ?? null}
                    executionDateConfirmedAt={
                      typeof workOrderForm.scheduledConfirmedAt === "string"
                        ? workOrderForm.scheduledConfirmedAt
                        : selectedWorkOrder?.scheduledConfirmedAt ?? null
                    }
                    executionTeamIds={Array.isArray(workOrderForm.assignedEmployeeIds) ? workOrderForm.assignedEmployeeIds : []}
                    onExecutionDateChange={(value) => handleWorkOrderChange("scheduledAt", value)}
                    onConfirmExecutionDate={() => {
                      void handleConfirmSchedule();
                    }}
                    onUnconfirmExecutionDate={() => {
                      void handleUnconfirmSchedule();
                    }}
                    onToggleExecutionTeam={toggleAssignedEmployee}
                    onPickupMethodChange={(value) => updateMaterialOrderForm(order._id, { pickupMethod: value })}
                    onPickupLocationChange={(value) => updateMaterialOrderForm(order._id, { pickupLocation: value })}
                    onLogisticsOwnerChange={(employeeId) => updateMaterialOrderForm(order._id, { logisticsOwnerId: employeeId })}
                    onPickupNoteChange={(value) => updateMaterialOrderForm(order._id, { pickupNote: value })}
                    onDeliveryNotePhotosChange={(photos) => updateMaterialOrderForm(order._id, { deliveryNotePhotos: photos })}
                    onAddExtraMaterial={(draft) => addExtraMaterialItem(order._id, draft)}
                    onConfirmPickup={() => {
                      void handleConfirmPickup(order._id);
                    }}
                    onAdvanceStep={(step) => {
                      void handleAdvanceMaterialStepWithSave(order._id, step);
                    }}
                    savingWorkOrder={savingWorkOrder || advancingMaterialOrderId === order._id}
                    employees={employees}
                    onDownloadPurchaseOrder={() => handleDownloadMaterialPdf(order._id, "PURCHASE_ORDER")}
                    onDownloadDeliveryNote={() => handleDownloadMaterialPdf(order._id, "DELIVERY_NOTE")}
                    onDeliveredQtyChange={(itemId, deliveredQty) => {
                      void updateDeliveredQty(order._id, itemId, deliveredQty, false);
                    }}
                    onDeliveredQtyCommit={(itemId, deliveredQty) => {
                      void updateDeliveredQty(order._id, itemId, deliveredQty, true);
                    }}
                    onSaveMaterialChanges={() => {
                      void saveMaterialOrderChanges(order._id);
                    }}
                    hasPendingMaterialChanges={Boolean(pendingMaterialOrderIds[order._id])}
                    canDownloadPdf={Boolean(order._id)}
                    downloadingPdf={materialDownloading}
                  />
                ))
              )}
            </div>
          </CardContent>
          </Card>
        ) : null}

        {section === "workorder" || section === "both" ? (
          <Card id="dashboard-logistics-workorder">
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
              {filteredWorkOrders.length === 0 ? (
                <span className="text-sm text-muted-foreground">Delovni nalog še ni ustvarjen.</span>
              ) : null}
              {renderWorkOrder(selectedWorkOrder)}
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {materialOrdersForDisplay.length === 0 ? (
                <span className="text-sm text-muted-foreground">Naročilo za material še ni ustvarjeno.</span>
              ) : (
                materialOrdersForDisplay.map((order) => (
                  <MaterialOrderCard
                    key={order._id}
                    materialOrder={order}
                    executionDate={typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : selectedWorkOrder?.scheduledAt ?? null}
                    executionDateConfirmedAt={
                      typeof workOrderForm.scheduledConfirmedAt === "string"
                        ? workOrderForm.scheduledConfirmedAt
                        : selectedWorkOrder?.scheduledConfirmedAt ?? null
                    }
                    executionTeamIds={Array.isArray(workOrderForm.assignedEmployeeIds) ? workOrderForm.assignedEmployeeIds : []}
                    onExecutionDateChange={(value) => handleWorkOrderChange("scheduledAt", value)}
                    onConfirmExecutionDate={() => {
                      void handleConfirmSchedule();
                    }}
                    onUnconfirmExecutionDate={() => {
                      void handleUnconfirmSchedule();
                    }}
                    onToggleExecutionTeam={toggleAssignedEmployee}
                    onPickupMethodChange={(value) => updateMaterialOrderForm(order._id, { pickupMethod: value })}
                    onPickupLocationChange={(value) => updateMaterialOrderForm(order._id, { pickupLocation: value })}
                    onLogisticsOwnerChange={(employeeId) => updateMaterialOrderForm(order._id, { logisticsOwnerId: employeeId })}
                    onPickupNoteChange={(value) => updateMaterialOrderForm(order._id, { pickupNote: value })}
                    onDeliveryNotePhotosChange={(photos) => updateMaterialOrderForm(order._id, { deliveryNotePhotos: photos })}
                    onAddExtraMaterial={(draft) => addExtraMaterialItem(order._id, draft)}
                    onConfirmPickup={() => {
                      void handleConfirmPickup(order._id);
                    }}
                    onAdvanceStep={(step) => {
                      void handleAdvanceMaterialStepWithSave(order._id, step);
                    }}
                    savingWorkOrder={savingWorkOrder || advancingMaterialOrderId === order._id}
                    employees={employees}
                    onDownloadPurchaseOrder={() => handleDownloadMaterialPdf(order._id, "PURCHASE_ORDER")}
                    onDownloadDeliveryNote={() => handleDownloadMaterialPdf(order._id, "DELIVERY_NOTE")}
                    onDeliveredQtyChange={(itemId, deliveredQty) => {
                      void updateDeliveredQty(order._id, itemId, deliveredQty, false);
                    }}
                    onDeliveredQtyCommit={(itemId, deliveredQty) => {
                      void updateDeliveredQty(order._id, itemId, deliveredQty, true);
                    }}
                    onSaveMaterialChanges={() => {
                      void saveMaterialOrderChanges(order._id);
                    }}
                    hasPendingMaterialChanges={Boolean(pendingMaterialOrderIds[order._id])}
                    canDownloadPdf={Boolean(order._id)}
                    downloadingPdf={materialDownloading}
                  />
                ))
              )}
            </div>
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
            {filteredWorkOrders.length === 0 ? (
              <span className="text-sm text-muted-foreground">Delovni nalog še ni ustvarjen.</span>
            ) : null}
            {renderWorkOrder(selectedWorkOrder)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


