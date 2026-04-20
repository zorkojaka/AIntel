import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  MaterialOrder,
  MaterialPickupMethod,
  MaterialStatus,
  MaterialStep,
  ProjectLogisticsSnapshot,
  WorkOrderExecutionSpec,
  WorkOrderExecutionUnit,
  WorkOrderPhoto,
  WorkOrder as LogisticsWorkOrder,
  WorkOrderStatus,
} from "@aintel/shared/types/logistics";
import type { Employee } from "@aintel/shared/types/employee";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { MaterialOrderCard } from "./MaterialOrderCard";
import { normalizeMaterialStatusLabel } from "./materialStatus";
import { useConfirmOffer } from "../core/useConfirmOffer";
import { useProjectMutationRefresh } from "../core/useProjectMutationRefresh";
import { downloadPdf } from "../../api";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, Loader2, Trash2, X } from "lucide-react";
import { buildTenantHeaders } from "@aintel/shared/utils/tenant";
import { useSettingsData } from "@aintel/module-settings";
import { PhotoCapture, type ExistingPhoto, type PhotoSaveResponseData } from "@aintel/ui";

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
  onRegisterSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
  mode?: "full" | "embedded";
  section?: "material" | "workorder" | "both";
  workOrderMode?: "preview" | "execute";
}

type InstallerAvailabilityEntry = {
  workOrderId: string;
  projectId: string;
  projectCode: string;
  projectTitle?: string | null;
  title?: string | null;
  scheduledAt: string | null;
};

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

function formatCompanyAddress(settings: {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}) {
  const parts = [
    settings.address?.trim(),
    [settings.postalCode?.trim(), settings.city?.trim()].filter(Boolean).join(" ").trim(),
    settings.country?.trim(),
  ].filter(Boolean);
  return parts.join(", ");
}

function resolveDefaultSupplierAddress(materialOrder?: MaterialOrder | null) {
  if (!materialOrder) return "";
  for (const item of materialOrder.items ?? []) {
    const address = typeof item.naslovDobavitelja === "string" ? item.naslovDobavitelja.trim() : "";
    if (address) return address;
  }
  return "";
}

function resolvePickupLocationForMethod(
  method: MaterialPickupMethod,
  supplierAddress: string,
  companyAddress: string,
  installerAddress: string,
  siteAddress: string,
) {
  if (method === "SUPPLIER_PICKUP") return supplierAddress;
  if (method === "COMPANY_PICKUP") return companyAddress;
  if (method === "DIRECT_TO_INSTALLER") return installerAddress;
  if (method === "DIRECT_TO_SITE") return siteAddress;
  return "";
}

function formatPickupMethodLabel(method?: MaterialPickupMethod | null) {
  if (method === "COMPANY_PICKUP") return "Prevzem v firmi";
  if (method === "SUPPLIER_PICKUP") return "Prevzem pri dobavitelju";
  if (method === "DIRECT_TO_INSTALLER") return "Direktna dostava monterju";
  if (method === "DIRECT_TO_SITE") return "Direktna dostava na objekt";
  return "Ni določen";
}

function buildOfferLabel(offer: ProjectLogisticsSnapshot["offerVersions"][number]) {
  return offer.title || `Verzija ${offer.versionNumber}`;
}

function resolveMaterialPreviewStep(value?: string | null) {
  if (value === "Za naročiti" || value === "Naročeno" || value === "Za prevzem" || value === "Prevzeto" || value === "Pripravljeno") {
    return value;
  }
  return "Za naročiti";
}

function groupMaterialPreviewBySupplier(items: MaterialOrder["items"]) {
  const groups = new Map<
    string,
    {
      supplierLabel: string;
      itemCount: number;
      orderedCount: number;
      readyCount: number;
    }
  >();

  (items ?? []).forEach((item) => {
    if (item.isExtra) return;
    const supplierLabel =
      typeof item.dobavitelj === "string" && item.dobavitelj.trim().length > 0 ? item.dobavitelj.trim() : "Manjka dobavitelj";
    const existing = groups.get(supplierLabel) ?? {
      supplierLabel,
      itemCount: 0,
      orderedCount: 0,
      readyCount: 0,
    };
    existing.itemCount += 1;
    const plannedQty = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
    const orderedQty = typeof item.orderedQty === "number" && Number.isFinite(item.orderedQty) ? Math.max(0, item.orderedQty) : 0;
    const orderedStatus = orderedQty <= 0 ? "NE" : orderedQty < plannedQty ? "DELNO" : "DA";
    const isFullyOrdered = orderedStatus === "DA";
    if (isFullyOrdered) existing.orderedCount += 1;
    const step = resolveMaterialPreviewStep(item.materialStep);
    if (isFullyOrdered && (step === "Za prevzem" || step === "Prevzeto" || step === "Pripravljeno")) {
      existing.readyCount += 1;
    }
    groups.set(supplierLabel, existing);
  });

  return Array.from(groups.values()).sort((a, b) => a.supplierLabel.localeCompare(b.supplierLabel));
}

function formatExecutionDuration(items: LogisticsWorkOrder["items"] | undefined) {
  const totalMinutes = (items ?? []).reduce((sum, item) => {
    const quantity = typeof item.quantity === "number" ? item.quantity : 0;
    const casovnaNorma = typeof item.casovnaNorma === "number" ? item.casovnaNorma : 0;
    return sum + quantity * casovnaNorma;
  }, 0);

  if (totalMinutes <= 0) return "0 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

function normalizeExecutionMode(value: WorkOrderExecutionSpec["mode"] | undefined) {
  return value === "per_unit" || value === "measured" ? value : "simple";
}

function sanitizeExecutionUnits(units: WorkOrderExecutionSpec["executionUnits"] | undefined) {
  return Array.isArray(units)
    ? units.map((unit) => ({
        id: unit.id,
        label: unit.label ?? "",
        location: unit.location ?? "",
        instructions: unit.instructions ?? "",
        isCompleted: !!unit.isCompleted,
        note: unit.note ?? "",
        unitPhotos: Array.isArray(unit.unitPhotos) ? unit.unitPhotos : [],
        prepPhotos: Array.isArray(unit.prepPhotos) ? unit.prepPhotos : [],
      }))
    : [];
}

function ensureExecutionSpec(spec: WorkOrderExecutionSpec | null | undefined): WorkOrderExecutionSpec {
  return {
    mode: normalizeExecutionMode(spec?.mode),
    locationSummary: spec?.locationSummary ?? "",
    instructions: spec?.instructions ?? "",
    trackingUnitLabel: spec?.trackingUnitLabel ?? "",
    executionUnits: sanitizeExecutionUnits(spec?.executionUnits),
  };
}

function normalizeWorkOrderPhotos(photos: ExistingPhoto[] | undefined): WorkOrderPhoto[] | undefined {
  if (!photos) return undefined;
  return photos.map((photo) => ({
    _id: photo._id ?? photo.id ?? "",
    id: photo.id ?? photo._id,
    url: photo.url,
    type: photo.type === "prep" ? "prep" : "unit",
    itemIndex: typeof photo.itemIndex === "number" ? photo.itemIndex : 0,
    unitIndex: typeof photo.unitIndex === "number" ? photo.unitIndex : 0,
    uploadedAt: typeof photo.uploadedAt === "string" ? photo.uploadedAt : new Date().toISOString(),
  }));
}

function getExecutionModeLabel(mode: WorkOrderExecutionSpec["mode"] | undefined) {
  if (mode === "per_unit") return "Po enotah";
  if (mode === "measured") return "Merjeno";
  return "Enostavno";
}

function getPerUnitSummary(spec: WorkOrderExecutionSpec) {
  const totalUnits = spec.executionUnits?.length ?? 0;
  const completedUnits = (spec.executionUnits ?? []).filter((unit) => unit.isCompleted).length;
  if (totalUnits === 0) return "Enote: 0";
  return `Enote: ${completedUnits}/${totalUnits}`;
}

function getPreparedUnitsSummary(item: LogisticsWorkOrder["items"][number]) {
  const spec = ensureExecutionSpec(item.executionSpec);
  const definedUnits = spec.executionUnits?.length ?? 0;
  const targetCount = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
  if (targetCount > 0) {
    return `Enote: ${definedUnits}/${targetCount}`;
  }
  return `Enote: ${definedUnits}`;
}

function isMeasurementLikeUnit(unit?: string | null) {
  const normalized = (unit ?? "").trim().toLowerCase();
  return ["km", "h", "ura", "ur", "min", "m", "m2", "m3", "kg", "g", "l"].includes(normalized);
}

function isServiceWorkOrderItem(item: LogisticsWorkOrder["items"][number]) {
  return item.isService === true;
}

function isProductWorkOrderItem(item: LogisticsWorkOrder["items"][number]) {
  return !isServiceWorkOrderItem(item);
}

function canRenderLocationDefinition(item: LogisticsWorkOrder["items"][number]) {
  return isProductWorkOrderItem(item) && !isMeasurementLikeUnit(item.unit);
}

function isLocationDefinitionItem(item: LogisticsWorkOrder["items"][number]) {
  return canRenderLocationDefinition(item);
}

function getDesiredLocationUnitCount(item: LogisticsWorkOrder["items"][number]) {
  if (!isLocationDefinitionItem(item)) return 0;
  const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
  if (quantity <= 1) return 1;
  if (Number.isInteger(quantity)) return quantity;
  return 1;
}

export function LogisticsPanel({
  projectId,
  client,
  onWorkOrderUpdated,
  onRegisterSaveHandler,
  mode = "full",
  section = "both",
  workOrderMode = "preview",
}: LogisticsPanelProps) {
  const { settings } = useSettingsData({ applyTheme: false });
  const [snapshot, setSnapshot] = useState<ProjectLogisticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selectedOfferVersionId, setSelectedOfferVersionId] = useState<string | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [workOrderForm, setWorkOrderForm] = useState<Partial<LogisticsWorkOrder>>({});
  const [materialOrderForm, setMaterialOrderForm] = useState<MaterialOrder | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [installerAvailability, setInstallerAvailability] = useState<InstallerAvailabilityEntry[]>([]);
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [locationTouched, setLocationTouched] = useState(false);
  const [savingWorkOrder, setSavingWorkOrder] = useState(false);
  const [issuingOrder, setIssuingOrder] = useState(false);
  const [advancingMaterialOrderId, setAdvancingMaterialOrderId] = useState<string | null>(null);
  const [materialDownloading, setMaterialDownloading] = useState<"PURCHASE_ORDER" | "DELIVERY_NOTE" | null>(null);
  const [workOrderDownloading, setWorkOrderDownloading] = useState<"WORK_ORDER" | "WORK_ORDER_CONFIRMATION" | null>(null);
  const [pendingMaterialOrderIds, setPendingMaterialOrderIds] = useState<Record<string, boolean>>({});
  const [expandedExecutionItems, setExpandedExecutionItems] = useState<Record<string, boolean>>({});
  const [activeUnitPhotoCapture, setActiveUnitPhotoCapture] = useState<{
    workOrderId: string;
    itemIndex: number;
    unitIndex: number;
  } | null>(null);

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
  const activePrepPhotos = useMemo(() => {
    if (!activeUnitPhotoCapture) return [];
    const photos = workOrderForm._id === activeUnitPhotoCapture.workOrderId
      ? workOrderForm.photos ?? selectedWorkOrder?.photos ?? []
      : selectedWorkOrder?.photos ?? [];
    return photos
      .filter(
        (photo) =>
          photo.type === "prep" &&
          photo.itemIndex === activeUnitPhotoCapture.itemIndex &&
          photo.unitIndex === activeUnitPhotoCapture.unitIndex,
      )
      .map((photo): ExistingPhoto => ({
        id: photo.id ?? photo._id,
        url: photo.url,
      }));
  }, [activeUnitPhotoCapture, selectedWorkOrder?.photos, workOrderForm._id, workOrderForm.photos]);
  const syncWorkOrderPhotos = useCallback(
    (workOrderId: string, data: PhotoSaveResponseData) => {
      const photos = normalizeWorkOrderPhotos(data.photos);
      if (!photos) return;
      setWorkOrderForm((prev) => (prev._id === workOrderId ? { ...prev, photos } : prev));
      if (onWorkOrderUpdated && selectedWorkOrder?._id === workOrderId) {
        onWorkOrderUpdated({ ...selectedWorkOrder, photos });
      }
    },
    [onWorkOrderUpdated, selectedWorkOrder],
  );
  const companyPickupAddress = useMemo(() => formatCompanyAddress(settings), [settings]);
  const sitePickupAddress = useMemo(() => formatClientAddress(client ?? null), [client]);
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
  const selectedExecutionDurationLabel = useMemo(() => {
    const items =
      Array.isArray(workOrderForm.items) && workOrderForm.items.length > 0
        ? workOrderForm.items
        : Array.isArray(selectedWorkOrder?.items)
          ? selectedWorkOrder.items
          : [];
    return formatExecutionDuration(items);
  }, [selectedWorkOrder?.items, workOrderForm.items]);

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
        scheduledConfirmedBy: selectedWorkOrder.scheduledConfirmedBy ?? null,
        mainInstallerId: selectedWorkOrder.mainInstallerId ?? null,
        assignedEmployeeIds: Array.isArray(selectedWorkOrder.assignedEmployeeIds)
          ? selectedWorkOrder.assignedEmployeeIds
          : [],
      });
    } else {
      setWorkOrderForm({});
    }
  }, [selectedWorkOrder]);

  useEffect(() => {
    const mainInstallerId =
      typeof workOrderForm.mainInstallerId === "string" && workOrderForm.mainInstallerId.trim().length > 0
        ? workOrderForm.mainInstallerId
        : typeof selectedWorkOrder?.mainInstallerId === "string" && selectedWorkOrder.mainInstallerId.trim().length > 0
          ? selectedWorkOrder.mainInstallerId
          : "";
    if (!mainInstallerId) {
      setInstallerAvailability([]);
      return;
    }

    let alive = true;
    const controller = new AbortController();
    const excludeWorkOrderId = selectedWorkOrder?._id ?? "";

    const fetchInstallerAvailability = async () => {
      try {
        const query = excludeWorkOrderId ? `?excludeWorkOrderId=${encodeURIComponent(excludeWorkOrderId)}` : "";
        const response = await fetch(
          `/api/projects/${projectId}/logistics/installer-availability/${mainInstallerId}${query}`,
          { signal: controller.signal },
        );
        const payload = await response.json();
        if (!alive) return;
        if (!payload?.success) {
          setInstallerAvailability([]);
          return;
        }
        setInstallerAvailability(Array.isArray(payload.data) ? payload.data : []);
      } catch (error) {
        if (!alive || (error instanceof DOMException && error.name === "AbortError")) return;
        setInstallerAvailability([]);
      }
    };

    void fetchInstallerAvailability();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [projectId, selectedWorkOrder?._id, selectedWorkOrder?.mainInstallerId, workOrderForm.mainInstallerId]);

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

  const handleWorkOrderChange = <K extends keyof LogisticsWorkOrder>(field: K, value: LogisticsWorkOrder[K]) => {
    if (field === "location") setLocationTouched(true);
    if (field === "customerEmail") setEmailTouched(true);
    if (field === "customerPhone") setPhoneTouched(true);
    setWorkOrderForm((prev) => {
      if (field === "scheduledAt") {
        return {
          ...prev,
          [field]: value as LogisticsWorkOrder["scheduledAt"],
          scheduledConfirmedAt: null,
          scheduledConfirmedBy: null,
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const toggleAssignedEmployee = (employeeId: string) => {
    setWorkOrderForm((prev) => {
      const current = Array.isArray(prev.assignedEmployeeIds) ? prev.assignedEmployeeIds : [];
      const next = current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId];
      const currentMainInstallerId =
        typeof prev.mainInstallerId === "string" && prev.mainInstallerId.trim().length > 0 ? prev.mainInstallerId : null;
      const nextMainInstallerId =
        currentMainInstallerId && next.includes(currentMainInstallerId)
          ? currentMainInstallerId
          : next[0] ?? null;
      return {
        ...prev,
        assignedEmployeeIds: next,
        mainInstallerId: nextMainInstallerId,
      };
    });
  };

  const handleMainInstallerChange = (employeeId: string | null) => {
    setWorkOrderForm((prev) => {
      const current = Array.isArray(prev.assignedEmployeeIds) ? prev.assignedEmployeeIds : [];
      const normalizedId = employeeId && employeeId.trim().length > 0 ? employeeId : null;
      const nextAssignedIds =
        normalizedId && !current.includes(normalizedId) ? [normalizedId, ...current] : current;
      return {
        ...prev,
        mainInstallerId: normalizedId,
        assignedEmployeeIds: nextAssignedIds,
      };
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

  const handlePickupMethodChange = useCallback(
    (materialOrderId: string, value: MaterialPickupMethod) => {
      const currentMaterial = resolveMaterialOrderById(materialOrderId);
      if (!currentMaterial) return;
      const resolvedMainInstallerId =
        typeof workOrderForm.mainInstallerId === "string" && workOrderForm.mainInstallerId.trim().length > 0
          ? workOrderForm.mainInstallerId.trim()
          : typeof selectedWorkOrder?.mainInstallerId === "string" && selectedWorkOrder.mainInstallerId.trim().length > 0
            ? selectedWorkOrder.mainInstallerId.trim()
            : "";
      const supplierAddress = resolveDefaultSupplierAddress(
        materialOrderForm?._id === materialOrderId ? materialOrderForm : currentMaterial,
      );
      const installerAddress = resolvedMainInstallerId
        ? employees.find((employee) => employee.id === resolvedMainInstallerId)?.address?.trim() ?? ""
        : "";
      const autoPickupLocation = resolvePickupLocationForMethod(
        value,
        supplierAddress,
        companyPickupAddress,
        installerAddress,
        sitePickupAddress,
      );
      updateMaterialOrderForm(materialOrderId, {
        pickupMethod: value,
        pickupLocation: autoPickupLocation || currentMaterial.pickupLocation || "",
      });
    },
    [
      companyPickupAddress,
      employees,
      materialOrderForm,
      resolveMaterialOrderById,
      selectedWorkOrder?.mainInstallerId,
      sitePickupAddress,
      updateMaterialOrderForm,
      workOrderForm.mainInstallerId,
    ],
  );

  useEffect(() => {
    if (!selectedMaterialOrder?._id) return;

    const resolvedMainInstallerId =
      typeof workOrderForm.mainInstallerId === "string" && workOrderForm.mainInstallerId.trim().length > 0
        ? workOrderForm.mainInstallerId.trim()
        : typeof selectedWorkOrder?.mainInstallerId === "string" && selectedWorkOrder.mainInstallerId.trim().length > 0
          ? selectedWorkOrder.mainInstallerId.trim()
          : "";
    const defaultSupplierAddress = resolveDefaultSupplierAddress(materialOrderForm ?? selectedMaterialOrder);
    const installerAddress = resolvedMainInstallerId
      ? employees.find((employee) => employee.id === resolvedMainInstallerId)?.address?.trim() ?? ""
      : "";
    const currentPickupMethod = materialOrderForm?.pickupMethod ?? selectedMaterialOrder.pickupMethod ?? null;
    const nextPickupMethod: MaterialPickupMethod = currentPickupMethod ?? "SUPPLIER_PICKUP";
    const currentPickupLocation =
      typeof (materialOrderForm?.pickupLocation ?? selectedMaterialOrder.pickupLocation) === "string"
        ? (materialOrderForm?.pickupLocation ?? selectedMaterialOrder.pickupLocation ?? "").trim()
        : "";
    const autoPickupLocation = resolvePickupLocationForMethod(
      nextPickupMethod,
      defaultSupplierAddress,
      companyPickupAddress,
      installerAddress,
      sitePickupAddress,
    );

    const updates: Partial<MaterialOrder> = {};

    if (!currentPickupMethod) {
      updates.pickupMethod = nextPickupMethod;
    }
    if (resolvedMainInstallerId && materialOrderForm?.logisticsOwnerId !== resolvedMainInstallerId) {
      updates.logisticsOwnerId = resolvedMainInstallerId;
    }
    if (!resolvedMainInstallerId && materialOrderForm?.logisticsOwnerId) {
      updates.logisticsOwnerId = null;
    }
    if (!currentPickupLocation && autoPickupLocation) {
      updates.pickupLocation = autoPickupLocation;
    }

    if (Object.keys(updates).length > 0) {
      updateMaterialOrderForm(selectedMaterialOrder._id, updates);
    }
  }, [
    companyPickupAddress,
    employees,
    materialOrderForm,
    selectedMaterialOrder,
    selectedWorkOrder?.mainInstallerId,
    sitePickupAddress,
    updateMaterialOrderForm,
    workOrderForm.mainInstallerId,
  ]);

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
        isOrdered: false,
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
      const url = `/api/projects/${projectId}/material-orders/${target._id}/pdf?docType=${docType}&mode=download`;
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

  const openMaterialPdfPreview = (materialOrderId: string, docType: "PURCHASE_ORDER" | "DELIVERY_NOTE") => {
    const target = resolveMaterialOrderById(materialOrderId) ?? materialOrderForm ?? selectedMaterialOrder ?? null;
    if (!target?._id) {
      toast.error("Naročilo še ni pripravljeno za predogled.");
      return;
    }
    const url = `/api/projects/${projectId}/material-orders/${target._id}/pdf?docType=${docType}&mode=inline`;
    window.open(url, "_blank", "noopener,noreferrer");
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
      const url = `/api/projects/${projectId}/work-orders/${target._id}/pdf?docType=${docType}&mode=download`;
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

  const openWorkOrderPdfPreview = (docType: "WORK_ORDER" | "WORK_ORDER_CONFIRMATION") => {
    const target = selectedWorkOrder ?? null;
    if (!target?._id) {
      toast.error("Delovni nalog ni pripravljen za predogled.");
      return;
    }
    const url = `/api/projects/${projectId}/work-orders/${target._id}/pdf?docType=${docType}&mode=inline`;
    window.open(url, "_blank", "noopener,noreferrer");
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
      const resolvedItems = Array.isArray(workOrderOverrides?.items)
        ? workOrderOverrides.items
        : Array.isArray(workOrderForm.items)
          ? workOrderForm.items
          : undefined;
      const response = await fetch(`/api/projects/${projectId}/work-orders/${selectedWorkOrder._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: selectedWorkOrder._id,
          scheduledAt: typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : null,
          scheduledConfirmedAt: resolvedScheduledConfirmedAt,
          mainInstallerId:
            typeof workOrderForm.mainInstallerId === "string" && workOrderForm.mainInstallerId.trim().length > 0
              ? workOrderForm.mainInstallerId
              : null,
          assignedEmployeeIds: Array.isArray(workOrderForm.assignedEmployeeIds) ? workOrderForm.assignedEmployeeIds : [],
          location: workOrderForm.location ?? "",
          notes: workOrderForm.notes ?? "",
          status: workOrderOverrides?.status ?? workOrderForm.status ?? undefined,
          items: resolvedItems,
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
        scheduledConfirmedBy: mergedWorkOrder.scheduledConfirmedBy ?? null,
        mainInstallerId: mergedWorkOrder.mainInstallerId ?? null,
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

  const openPrepPhotoCapture = (payload: {
    workOrderId: string;
    itemIndex: number;
    unitIndex: number;
  }) => {
    setActiveUnitPhotoCapture(payload);
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
  const currentIssueMaterialOrder = materialOrderForm ?? selectedMaterialOrder ?? null;
  const currentIssueMaterialItems = (currentIssueMaterialOrder?.items ?? []).filter((item) => !item.isExtra);
  const isMaterialReadyForIssue =
    currentIssueMaterialItems.length > 0 &&
    currentIssueMaterialItems.every((item) => {
      const plannedQty = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
      const orderedQty = typeof item.orderedQty === "number" && Number.isFinite(item.orderedQty) ? Math.max(0, item.orderedQty) : 0;
      const step = resolveMaterialPreviewStep(item.materialStep);
      return orderedQty > 0 && orderedQty >= plannedQty && (step === "Za prevzem" || step === "Prevzeto" || step === "Pripravljeno");
    });

  const canIssueOrder = Boolean(resolvedSchedule && hasAssignedTeam && isTermConfirmed);
  const canIssueWorkOrder = canIssueOrder && isMaterialReadyForIssue;
  const issueRequirements = [
    {
      label: "Izvedbena ekipa",
      met: hasAssignedTeam,
      missingText: "Manjka izvedbena ekipa",
    },
    {
      label: "Termin izvedbe",
      met: Boolean(resolvedSchedule),
      missingText: "Manjka termin izvedbe",
    },
    {
      label: "Potrditev termina",
      met: isTermConfirmed,
      missingText: "Termin še ni potrjen",
    },
    {
      label: "Material",
      met: isMaterialReadyForIssue,
      missingText: "Material še ni pripravljen za prevzem",
    },
  ];

  const handleIssueWorkOrder = async () => {
    if (!canIssueWorkOrder || issuingOrder || !selectedWorkOrder) return;
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
    setWorkOrderForm((prev) => ({ ...prev, scheduledConfirmedAt: null, scheduledConfirmedBy: null }));
    const saved = await handleSaveWorkOrder(undefined, { scheduledConfirmedAt: null });
    if (saved) {
      toast.success("Potrditev termina odstranjena.");
    }
  };

  useEffect(() => {
    if (!onRegisterSaveHandler) return;
    onRegisterSaveHandler(async () => Boolean(await handleSaveWorkOrder()));
    return () => onRegisterSaveHandler(null);
  }, [onRegisterSaveHandler, handleSaveWorkOrder]);

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

  const toggleExecutionDetails = (itemId: string) => {
    setExpandedExecutionItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const updateWorkOrderItems = (updater: (items: LogisticsWorkOrder["items"]) => LogisticsWorkOrder["items"]) => {
    setWorkOrderForm((prev) => {
      const baseItems =
        Array.isArray(prev.items) && prev.items.length > 0
          ? prev.items
          : Array.isArray(selectedWorkOrder?.items)
            ? selectedWorkOrder.items
            : [];
      return { ...prev, items: updater(baseItems) };
    });
  };

  const updateExecutionSpecForItem = (itemId: string, changes: Partial<WorkOrderExecutionSpec>) => {
    updateWorkOrderItems((items) =>
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              executionSpec: {
                ...ensureExecutionSpec(item.executionSpec),
                ...changes,
                executionUnits:
                  changes.executionUnits !== undefined
                    ? sanitizeExecutionUnits(changes.executionUnits)
                    : ensureExecutionSpec(item.executionSpec).executionUnits,
              },
            }
          : item,
      ),
    );
  };

  const updateExecutionUnitForItem = (
    itemId: string,
    unitId: string,
    changes: Partial<WorkOrderExecutionUnit>,
  ) => {
    const currentItems =
      Array.isArray(workOrderForm.items) && workOrderForm.items.length > 0
        ? workOrderForm.items
        : Array.isArray(selectedWorkOrder?.items)
          ? selectedWorkOrder.items
          : [];
    const currentItem = currentItems.find((item) => item.id === itemId);
    const spec = ensureExecutionSpec(currentItem?.executionSpec);
    const nextUnits = (spec.executionUnits ?? []).map((unit) => (unit.id === unitId ? { ...unit, ...changes } : unit));
    updateExecutionSpecForItem(itemId, { executionUnits: nextUnits });
  };

  const addExecutionUnitForItem = (itemId: string) => {
    const currentItems =
      Array.isArray(workOrderForm.items) && workOrderForm.items.length > 0
        ? workOrderForm.items
        : Array.isArray(selectedWorkOrder?.items)
          ? selectedWorkOrder.items
          : [];
    const currentItem = currentItems.find((item) => item.id === itemId);
    const spec = ensureExecutionSpec(currentItem?.executionSpec);
    const nextUnit: WorkOrderExecutionUnit = {
      id:
        typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: "",
      location: "",
      instructions: "",
      isCompleted: false,
      note: "",
    };
    updateExecutionSpecForItem(itemId, {
      mode: "per_unit",
      executionUnits: [...(spec.executionUnits ?? []), nextUnit],
    });
    setExpandedExecutionItems((prev) => ({ ...prev, [itemId]: true }));
  };

  const deleteExecutionUnitForItem = (itemId: string, unitId: string) => {
    const currentItems =
      Array.isArray(workOrderForm.items) && workOrderForm.items.length > 0
        ? workOrderForm.items
        : Array.isArray(selectedWorkOrder?.items)
          ? selectedWorkOrder.items
          : [];
    const currentItem = currentItems.find((item) => item.id === itemId);
    const spec = ensureExecutionSpec(currentItem?.executionSpec);
    updateExecutionSpecForItem(itemId, {
      executionUnits: (spec.executionUnits ?? []).filter((unit) => unit.id !== unitId),
    });
  };

  const buildProductLocationUnits = (item: LogisticsWorkOrder["items"][number]) => {
    const spec = ensureExecutionSpec(item.executionSpec);
    const targetCount = getDesiredLocationUnitCount(item);
    return Array.from({ length: targetCount }, (_, index) => {
      const existing = spec.executionUnits?.[index];
      return {
        id: existing?.id ?? `draft-${item.id}-${index}`,
        label: String(index + 1),
        location: existing?.location ?? "",
        instructions: existing?.instructions ?? "",
        isCompleted: !!existing?.isCompleted,
        note: existing?.note ?? "",
      };
    });
  };

  const updateProductLocationUnit = (
    item: LogisticsWorkOrder["items"][number],
    index: number,
    changes: Partial<WorkOrderExecutionUnit>,
  ) => {
    const units = buildProductLocationUnits(item).map((unit, unitIndex) =>
      unitIndex === index
        ? {
            ...unit,
            ...changes,
          }
        : unit,
    );
    updateExecutionSpecForItem(item.id, {
      executionUnits: units.map((unit) => ({
        id: unit.id,
        label: unit.label,
        location: unit.location ?? "",
        instructions: unit.instructions ?? "",
        isCompleted: !!unit.isCompleted,
        note: unit.note ?? "",
      })),
    });
  };

  const renderPreparationExecutionDetails = (
    item: LogisticsWorkOrder["items"][number],
    compact = false,
    options?: { showToggle?: boolean },
  ) => {
    const spec = ensureExecutionSpec(item.executionSpec);
    const isExpanded = !!expandedExecutionItems[item.id];
    const isPerUnit = spec.mode === "per_unit";
    const unitLabel = spec.trackingUnitLabel?.trim() || "Enota";

    return (
      <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm font-medium">Detajli izvedbe</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Način izvedbe: {getExecutionModeLabel(spec.mode)}</span>
              {isPerUnit ? <span>{getPreparedUnitsSummary(item)}</span> : null}
            </div>
          </div>
          {options?.showToggle !== false ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => toggleExecutionDetails(item.id)}
            >
              {isExpanded ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
              {isExpanded ? "Skrij detajle" : "Odpri detajle"}
            </Button>
          ) : null}
        </div>
        {isExpanded ? (
          <div className="space-y-3">
            <div className={compact ? "space-y-3" : "grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]"}>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Način izvedbe</span>
                <Select
                  value={spec.mode ?? "simple"}
                  onValueChange={(value) =>
                    updateExecutionSpecForItem(item.id, {
                      mode: value as WorkOrderExecutionSpec["mode"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Izberi način izvedbe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Enostavno</SelectItem>
                    <SelectItem value="per_unit">Po enotah</SelectItem>
                    <SelectItem value="measured">Merjeno</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {!isPerUnit ? (
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Lokacija</span>
                  <Input
                    value={spec.locationSummary ?? ""}
                    onChange={(event) =>
                      updateExecutionSpecForItem(item.id, { locationSummary: event.target.value })
                    }
                    placeholder="Npr. dnevna soba, vhod nad vrati"
                  />
                </label>
              ) : null}
            </div>
            {isPerUnit ? (
              <div className="space-y-3 rounded-md border border-dashed border-border/70 bg-background/80 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Razčlenitev po enotah</p>
                    <p className="text-xs text-muted-foreground">Glavni vnos: oznaka, lokacija, opomba.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => addExecutionUnitForItem(item.id)}>
                    Dodaj enoto
                  </Button>
                </div>
                <div className={compact ? "space-y-3" : "grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]"}>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Privzeta oznaka enote</span>
                    <Input
                      value={spec.trackingUnitLabel ?? ""}
                      onChange={(event) =>
                        updateExecutionSpecForItem(item.id, { trackingUnitLabel: event.target.value })
                      }
                      placeholder="Npr. senzor"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Splošna opomba</span>
                    <Input
                      value={spec.instructions ?? ""}
                      onChange={(event) =>
                        updateExecutionSpecForItem(item.id, { instructions: event.target.value })
                      }
                      placeholder="Kratka skupna opomba za to postavko."
                    />
                  </label>
                </div>
                {(spec.executionUnits?.length ?? 0) === 0 ? (
                  <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    Ni pripravljenih enot. Dodaj enoto za vsako lokacijo montaže.
                  </div>
                ) : null}
                <div className="space-y-2">
                  <div className="hidden grid-cols-[minmax(140px,1fr)_minmax(220px,1.6fr)_minmax(180px,1.2fr)_auto] gap-2 px-1 text-xs text-muted-foreground md:grid">
                    <span>Oznaka</span>
                    <span>Lokacija</span>
                    <span>Opomba</span>
                    <span></span>
                  </div>
                  {(spec.executionUnits ?? []).map((unit, index) => (
                    <div key={unit.id} className="rounded-md border border-border/70 bg-muted/10 p-2">
                      <div className={compact ? "space-y-2" : "grid gap-2 md:grid-cols-[minmax(140px,1fr)_minmax(220px,1.6fr)_minmax(180px,1.2fr)_auto]"}>
                        <Input
                          value={unit.label ?? ""}
                          onChange={(event) =>
                            updateExecutionUnitForItem(item.id, unit.id, { label: event.target.value })
                          }
                          placeholder={`${unitLabel} ${index + 1}`}
                        />
                        <Input
                          value={unit.location ?? ""}
                          onChange={(event) =>
                            updateExecutionUnitForItem(item.id, unit.id, { location: event.target.value })
                          }
                          placeholder="Npr. dnevna soba"
                        />
                        <Input
                          value={unit.instructions ?? ""}
                          onChange={(event) =>
                            updateExecutionUnitForItem(item.id, unit.id, { instructions: event.target.value })
                          }
                          placeholder="Opomba"
                        />
                        <div className="flex items-center justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteExecutionUnitForItem(item.id, unit.id)}
                            aria-label="Izbriši enoto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {!isPerUnit ? (
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Splošna opomba</span>
                <Input
                  value={spec.instructions ?? ""}
                  onChange={(event) =>
                    updateExecutionSpecForItem(item.id, { instructions: event.target.value })
                  }
                  placeholder="Kratka opomba za izvedbo."
                />
              </label>
            ) : null}
          </div>
        ) : null}
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
    const canDownloadWorkOrderPdf = !!workOrder?._id;
    const [streetRaw, postalRaw] = customerAddress.split(/,(.+)/);
    const streetLine = streetRaw?.trim() ?? "";
    const postalLine = postalRaw?.trim() ?? "";
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
              <p className="text-sm font-medium text-muted-foreground">Naslov</p>
              <div className="space-y-1 text-sm text-left">
                {streetLine && <div>{streetLine}</div>}
                {postalLine && <div>{postalLine}</div>}
              </div>
            </div>
          </div>
          <hr className="border-border/60" />
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
              {workOrderItems.map((item) => {
                const requiredQty = typeof item.quantity === "number" ? item.quantity : 0;
                const executionSpec = ensureExecutionSpec(item.executionSpec);
                if (workOrderMode !== "execute") {
                  const materialKey = item.offerItemId ?? item.id;
                  const materialItem = materialItemsById.get(materialKey);
                  const isService = isServiceWorkOrderItem(item);
                  const materialRequired =
                    typeof materialItem?.quantity === "number" ? materialItem.quantity : requiredQty;
                  const deliveredQty = typeof materialItem?.deliveredQty === "number" ? materialItem.deliveredQty : 0;
                  const isReady = isService ? hasAssignedTeam : deliveredQty - materialRequired >= 0;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{item.name}</span>
                          {executionSpec.mode === "per_unit" ? (
                            <Badge variant="outline">{getPreparedUnitsSummary(item)}</Badge>
                          ) : null}
                        </div>
                      </TableCell>
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
          {workOrderItems.map((item) => {
            const requiredQty = typeof item.quantity === "number" ? item.quantity : 0;
            const executionSpec = ensureExecutionSpec(item.executionSpec);
            if (workOrderMode !== "execute") {
              const materialKey = item.offerItemId ?? item.id;
              const materialItem = materialItemsById.get(materialKey);
              const isService = isServiceWorkOrderItem(item);
              const materialRequired =
                typeof materialItem?.quantity === "number" ? materialItem.quantity : requiredQty;
              const deliveredQty = typeof materialItem?.deliveredQty === "number" ? materialItem.deliveredQty : 0;
              const isReady = isService ? hasAssignedTeam : deliveredQty - materialRequired >= 0;
              return (
                <div key={item.id} className="space-y-3 rounded-[var(--radius-card)] border border-border/70 bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-5">{item.name}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs text-muted-foreground">{item.unit || "-"}</p>
                        {executionSpec.mode === "per_unit" ? (
                          <Badge variant="outline">{getPreparedUnitsSummary(item)}</Badge>
                        ) : null}
                      </div>
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
            <Button variant="outline" size="sm" onClick={() => handleSaveWorkOrder()} disabled={savingWorkOrder}>
              {savingWorkOrder ? "Shranjujem..." : "Shrani podatke"}
            </Button>
            <Button size="sm" onClick={handleIssueWorkOrder} disabled={!canIssueOrder || savingWorkOrder || issuingOrder}>
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

  const renderTaskPreview = (workOrder: LogisticsWorkOrder | null) => {
    const materialPreviewOrders =
      materialOrdersForSelectedWorkOrder.length > 0
        ? materialOrdersForSelectedWorkOrder
        : materialOrderForm
          ? [materialOrderForm]
          : selectedMaterialOrder
            ? [selectedMaterialOrder]
            : [];
    const previewMaterialItems = materialPreviewOrders.flatMap((order) => order.items ?? []);
    const supplierGroups = groupMaterialPreviewBySupplier(previewMaterialItems);
    const previewWorkOrder = workOrder ?? selectedWorkOrder;
    const previewTeamIds = Array.isArray(workOrderForm.assignedEmployeeIds) && workOrderForm.assignedEmployeeIds.length > 0
      ? workOrderForm.assignedEmployeeIds
      : previewWorkOrder?.assignedEmployeeIds ?? [];
    const previewTeamNames = previewTeamIds
      .map((id) => employees.find((employee) => employee.id === id)?.name)
      .filter((value): value is string => Boolean(value));
    const previewSchedule =
      typeof workOrderForm.scheduledAt === "string" && workOrderForm.scheduledAt.trim().length > 0
        ? workOrderForm.scheduledAt
        : previewWorkOrder?.scheduledAt ?? null;
    const previewExecutionNote =
      typeof workOrderForm.notes === "string" && workOrderForm.notes.trim().length > 0
        ? workOrderForm.notes.trim()
        : previewWorkOrder?.notes?.trim() ?? "";
    const previewItems =
      Array.isArray(workOrderForm.items) && workOrderForm.items.length > 0
        ? workOrderForm.items
        : previewWorkOrder?.items ?? [];
    const previewServiceCount = previewItems.filter((item) => isServiceWorkOrderItem(item)).length;
    const previewProductCount = previewItems.length - previewServiceCount;
    const previewDurationLabel = formatExecutionDuration(previewItems);

    const formatSchedule = (value?: string | null) =>
      value
        ? new Intl.DateTimeFormat("sl-SI", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(value))
        : "Ni določen";

    const renderReadinessBadge = (readyCount: number, totalCount: number) => {
      if (totalCount === 0 || readyCount === 0) {
        return <Badge variant="outline">Ni pripravljeno</Badge>;
      }
      if (readyCount >= totalCount) {
        return <Badge className="border-green-500/30 bg-green-500/10 text-green-700">Pripravljeno za prevzem</Badge>;
      }
      return <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700">Delno pripravljeno</Badge>;
    };

    const renderPdfActionGroup = (
      label: string,
      onPreview: () => void,
      onDownload: () => void,
      downloading: boolean,
    ) => (
      <div className="inline-flex h-8 items-center rounded-md border border-border/70 bg-background">
        <Button variant="ghost" size="sm" className="h-8 rounded-none border-r border-border/70 px-3" onClick={onPreview}>
          {label}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-none"
          onClick={onDownload}
          disabled={downloading}
          aria-label={`Prenesi ${label.toLowerCase()}`}
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
      </div>
    );

    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-none border border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Nalog za prevzem</h4>
              </div>
              {renderReadinessBadge(
                supplierGroups.reduce((sum, group) => sum + group.readyCount, 0),
                supplierGroups.reduce((sum, group) => sum + group.itemCount, 0),
              )}
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-3">
              {supplierGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">Predogled naloga za prevzem bo na voljo po pripravi materiala.</p>
              ) : (
                supplierGroups.map((group) => (
                  <div key={group.supplierLabel} className="rounded-none bg-card px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{group.supplierLabel}</p>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p>Prevzem: {formatPickupMethodLabel(materialOrderForm?.pickupMethod ?? selectedMaterialOrder?.pickupMethod ?? null)}</p>
                          <p>Lokacija: {materialOrderForm?.pickupLocation ?? selectedMaterialOrder?.pickupLocation ?? "Ni določena"}</p>
                          <p>Odgovorna oseba: {employees.find((employee) => employee.id === (materialOrderForm?.logisticsOwnerId ?? selectedMaterialOrder?.logisticsOwnerId ?? ""))?.name ?? "Ni določena"}</p>
                        </div>
                      </div>
                      {renderReadinessBadge(group.readyCount, group.itemCount)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span>Postavke: {group.itemCount}</span>
                      <span>Naročeno {group.orderedCount} / {group.itemCount}</span>
                      <span>Pripravljeno {group.readyCount} / {group.itemCount}</span>
                    </div>
                  </div>
                ))
              )}
              {selectedMaterialOrder?._id ? (
                <div className="mt-auto flex justify-end pt-2">
                  {renderPdfActionGroup(
                    "Predogled naročilnice",
                    () => openMaterialPdfPreview(selectedMaterialOrder._id, "PURCHASE_ORDER"),
                    () => {
                      void handleDownloadMaterialPdf(selectedMaterialOrder._id, "PURCHASE_ORDER");
                    },
                    materialDownloading === "PURCHASE_ORDER",
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-none border border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Delovni nalog za izvedbo</h4>
              </div>
              <Badge variant="outline">{previewItems.length} postavk</Badge>
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-3">
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Termin izvedbe</p>
                  <p className="font-medium">{formatSchedule(previewSchedule)}</p>
                  <p className="text-sm text-muted-foreground">Ocena trajanja izvedbe: {previewDurationLabel}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Ekipa</p>
                  <p className="font-medium">{previewTeamNames.length > 0 ? previewTeamNames.join(", ") : "Ni določena"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Število produktov</p>
                  <p className="font-medium">{previewProductCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Število storitev</p>
                  <p className="font-medium">{previewServiceCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Opombe za tehnika</p>
                  <p className="font-medium">{previewExecutionNote || "Brez opomb"}</p>
                </div>
              </div>
              {previewWorkOrder?._id ? (
                <div className="mt-auto flex justify-end pt-2">
                  {renderPdfActionGroup(
                    "Predogled naloga",
                    () => openWorkOrderPdfPreview("WORK_ORDER"),
                    () => {
                      void handleDownloadWorkOrderPdf("WORK_ORDER");
                    },
                    workOrderDownloading === "WORK_ORDER",
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderExecutionDefinition = (workOrder: LogisticsWorkOrder | null) => {
    const sourceWorkOrder = workOrder ?? selectedWorkOrder;
    if (!sourceWorkOrder) {
      return (
        <Card>
          <CardHeader className="pb-0">
            <h3 className="text-base font-semibold">Definicija izvedbe</h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Delovni nalog še ni pripravljen za definiranje izvedbe.</p>
          </CardContent>
        </Card>
      );
    }

    const sourceItems =
      Array.isArray(workOrderForm.items) && workOrderForm.items.length > 0
        ? workOrderForm.items
        : Array.isArray(sourceWorkOrder.items)
          ? sourceWorkOrder.items
          : [];
    const prioritizedItems = sourceItems
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const aService = isServiceWorkOrderItem(a.item) ? 1 : 0;
        const bService = isServiceWorkOrderItem(b.item) ? 1 : 0;
        if (aService !== bService) return aService - bService;
        return a.index - b.index;
      })
      .map(({ item }) => item);

    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-0">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Definicija izvedbe</h3>
            <p className="text-sm text-muted-foreground">Določi lokacije za posamezne produktne enote.</p>
          </div>
          <Badge variant="outline">{prioritizedItems.length} postavk</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {prioritizedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ni postavk za pripravo definicije izvedbe.</p>
          ) : (
            <div className="space-y-3">
              {prioritizedItems.map((item) => {
                const itemIndex = Math.max(0, sourceItems.findIndex((candidate) => candidate.id === item.id));
                const isServiceRow = isServiceWorkOrderItem(item);
                const isProductCandidate = isProductWorkOrderItem(item);
                const canDefineLocations = canRenderLocationDefinition(item);
                const locationUnits = canDefineLocations ? buildProductLocationUnits(item) : [];
                const isExpanded = isServiceRow ? !!expandedExecutionItems[item.id] : expandedExecutionItems[item.id] !== false;
                return (
                  <div key={item.id} className="rounded-lg border border-border/70 bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{item.name}</p>
                          {isServiceRow ? <Badge variant="outline">Storitev</Badge> : null}
                          {isProductCandidate ? <Badge variant="outline">Produkt</Badge> : null}
                          {canDefineLocations ? <Badge variant="outline">{getPreparedUnitsSummary(item)}</Badge> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Količina: {item.quantity ?? 0} {item.unit || ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() =>
                          setExpandedExecutionItems((prev) => ({
                            ...prev,
                            [item.id]: !isExpanded,
                          }))
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown className="mr-1 h-4 w-4" />
                        ) : (
                          <ChevronRight className="mr-1 h-4 w-4" />
                        )}
                        Detajli izvedbe
                      </Button>
                    </div>
                    {isExpanded ? (
                      <div className="mt-3 space-y-3">
                        {canDefineLocations ? (
                          <div className="space-y-2">
                            {locationUnits.length === 0 ? (
                              <div className="text-sm text-muted-foreground">Ni pripravljenih enot.</div>
                            ) : null}
                            {locationUnits.map((unit, index) => (
                              <div key={unit.id} className="rounded-md border border-border/70 bg-muted/10 p-2">
                                <div className="grid gap-2 md:grid-cols-[120px_minmax(240px,1.8fr)_minmax(180px,1.2fr)_140px]">
                                  <div className="flex items-center text-sm font-medium">{unit.label}</div>
                                  <Input
                                    value={unit.location ?? ""}
                                    onChange={(event) =>
                                      updateProductLocationUnit(item, index, { location: event.target.value })
                                    }
                                    placeholder="Lokacija"
                                  />
                                  <Input
                                    value={unit.instructions ?? ""}
                                    onChange={(event) =>
                                      updateProductLocationUnit(item, index, { instructions: event.target.value })
                                    }
                                    placeholder="Opomba"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      void openPrepPhotoCapture({
                                        workOrderId: sourceWorkOrder._id,
                                        itemIndex,
                                        unitIndex: index,
                                      })
                                    }
                                  >
                                    Fotografija
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                            {isServiceRow
                              ? "Lokacije se v tej fazi definirajo pri povezanih produktih, ne na storitvi."
                              : "Za to postavko lokacijska razčlenitev v tej fazi ni potrebna."}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end border-t border-border/60 pt-4">
            <Button variant="outline" size="sm" onClick={() => void handleSaveWorkOrder()} disabled={savingWorkOrder}>
              {savingWorkOrder ? "Shranjujem definicijo..." : "Shrani definicijo izvedbe"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderPickupTaskPreview = () => {
    const materialPreviewOrders =
      materialOrdersForSelectedWorkOrder.length > 0
        ? materialOrdersForSelectedWorkOrder
        : materialOrderForm
          ? [materialOrderForm]
          : selectedMaterialOrder
            ? [selectedMaterialOrder]
            : [];
    const previewMaterialItems = materialPreviewOrders.flatMap((order) => order.items ?? []);
    const supplierGroups = groupMaterialPreviewBySupplier(previewMaterialItems);

    const renderReadinessBadge = (readyCount: number, totalCount: number) => {
      if (totalCount === 0 || readyCount === 0) {
        return <Badge variant="outline">Ni pripravljeno</Badge>;
      }
      if (readyCount >= totalCount) {
        return <Badge className="border-green-500/30 bg-green-500/10 text-green-700">Pripravljeno za prevzem</Badge>;
      }
      return <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700">Delno pripravljeno</Badge>;
    };

    const renderPdfActionGroup = (
      label: string,
      onPreview: () => void,
      onDownload: () => void,
      downloading: boolean,
    ) => (
      <div className="inline-flex h-8 items-center rounded-md border border-border/70 bg-background">
        <Button variant="ghost" size="sm" className="h-8 rounded-none border-r border-border/70 px-3" onClick={onPreview}>
          {label}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-none"
          onClick={onDownload}
          disabled={downloading}
          aria-label={`Prenesi ${label.toLowerCase()}`}
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
      </div>
    );

    return (
      <Card className="rounded-none border border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Nalog za prevzem</h4>
          </div>
          {renderReadinessBadge(
            supplierGroups.reduce((sum, group) => sum + group.readyCount, 0),
            supplierGroups.reduce((sum, group) => sum + group.itemCount, 0),
          )}
        </CardHeader>
        <CardContent className="flex h-full flex-col gap-3">
          {supplierGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Predogled naloga za prevzem bo na voljo po pripravi materiala.</p>
          ) : (
            supplierGroups.map((group) => (
              <div key={group.supplierLabel} className="rounded-none bg-card px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{group.supplierLabel}</p>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>Prevzem: {formatPickupMethodLabel(materialOrderForm?.pickupMethod ?? selectedMaterialOrder?.pickupMethod ?? null)}</p>
                      <p>Lokacija: {materialOrderForm?.pickupLocation ?? selectedMaterialOrder?.pickupLocation ?? "Ni določena"}</p>
                      <p>Odgovorna oseba: {employees.find((employee) => employee.id === (materialOrderForm?.logisticsOwnerId ?? selectedMaterialOrder?.logisticsOwnerId ?? ""))?.name ?? "Ni določena"}</p>
                    </div>
                  </div>
                  {renderReadinessBadge(group.readyCount, group.itemCount)}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>Postavke: {group.itemCount}</span>
                  <span>Naročeno {group.orderedCount} / {group.itemCount}</span>
                  <span>Pripravljeno {group.readyCount} / {group.itemCount}</span>
                </div>
              </div>
            ))
          )}
          {selectedMaterialOrder?._id ? (
            <div className="mt-auto flex justify-end pt-2">
              {renderPdfActionGroup(
                "Predogled naročilnice",
                () => openMaterialPdfPreview(selectedMaterialOrder._id, "PURCHASE_ORDER"),
                () => {
                  void handleDownloadMaterialPdf(selectedMaterialOrder._id, "PURCHASE_ORDER");
                },
                materialDownloading === "PURCHASE_ORDER",
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
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

  const applyMaterialItemsAndSave = async (materialOrderId: string, items: MaterialOrder["items"]): Promise<boolean> => {
    updateMaterialOrderForm(materialOrderId, { items });
    const saved = await handleSaveWorkOrder({
      _id: materialOrderId,
      items,
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
          <div id="dashboard-logistics-material" className="space-y-4">
            {materialOrdersForDisplay.length === 0 ? (
              <span className="text-sm text-muted-foreground">Naročilo za material še ni ustvarjeno.</span>
            ) : (
              materialOrdersForDisplay.map((order) => (
                <MaterialOrderCard
                  key={order._id}
                  materialOrder={order}
                  technicianNote={workOrderForm.notes ?? ""}
                  executionDate={typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : selectedWorkOrder?.scheduledAt ?? null}
                  executionDateConfirmedAt={
                    typeof workOrderForm.scheduledConfirmedAt === "string"
                      ? workOrderForm.scheduledConfirmedAt
                      : selectedWorkOrder?.scheduledConfirmedAt ?? null
                  }
                  executionDateConfirmedBy={
                    typeof workOrderForm.scheduledConfirmedBy === "string"
                      ? workOrderForm.scheduledConfirmedBy
                      : selectedWorkOrder?.scheduledConfirmedBy ?? null
                  }
                  executionDurationLabel={selectedExecutionDurationLabel}
                  mainInstallerId={
                    typeof workOrderForm.mainInstallerId === "string"
                      ? workOrderForm.mainInstallerId
                      : selectedWorkOrder?.mainInstallerId ?? null
                  }
                  executionTeamIds={Array.isArray(workOrderForm.assignedEmployeeIds) ? workOrderForm.assignedEmployeeIds : []}
                  installerAvailability={installerAvailability}
                  onExecutionDateChange={(value) => handleWorkOrderChange("scheduledAt", value)}
                  onConfirmExecutionDate={() => {
                    void handleConfirmSchedule();
                  }}
                  onUnconfirmExecutionDate={() => {
                    void handleUnconfirmSchedule();
                  }}
                  onMainInstallerChange={handleMainInstallerChange}
                  onToggleExecutionTeam={toggleAssignedEmployee}
                  onPickupMethodChange={(value) => handlePickupMethodChange(order._id, value)}
                  onPickupLocationChange={(value) => updateMaterialOrderForm(order._id, { pickupLocation: value })}
                  onLogisticsOwnerChange={(employeeId) => updateMaterialOrderForm(order._id, { logisticsOwnerId: employeeId })}
                  onTechnicianNoteChange={(value) => handleWorkOrderChange("notes", value)}
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
                  onPreviewPurchaseOrder={() => openMaterialPdfPreview(order._id, "PURCHASE_ORDER")}
                  onDownloadPurchaseOrder={() => handleDownloadMaterialPdf(order._id, "PURCHASE_ORDER")}
                  onDownloadDeliveryNote={() => handleDownloadMaterialPdf(order._id, "DELIVERY_NOTE")}
                  onMaterialItemsChange={(items) => updateMaterialOrderForm(order._id, { items })}
                  onDeliveredQtyChange={(itemId, deliveredQty) => {
                    void updateDeliveredQty(order._id, itemId, deliveredQty, false);
                  }}
                  onDeliveredQtyCommit={(itemId, deliveredQty) => {
                    void updateDeliveredQty(order._id, itemId, deliveredQty, true);
                  }}
                  onSaveMaterialChanges={() => {
                    void saveMaterialOrderChanges(order._id);
                  }}
                  onBulkMarkOrdered={(items) => {
                    void applyMaterialItemsAndSave(order._id, items);
                  }}
                  onBulkMarkReady={(items) => {
                    void applyMaterialItemsAndSave(order._id, items);
                  }}
                  hasPendingMaterialChanges={Boolean(pendingMaterialOrderIds[order._id])}
                  canDownloadPdf={Boolean(order._id)}
                  downloadingPdf={materialDownloading}
                />
              ))
            )}
          </div>
        ) : null}

        {section === "workorder" || section === "both" ? (
          <>
            <Card id="dashboard-logistics-workorder">
              <CardHeader className="hidden" />
              <CardContent className="space-y-4">
                {filteredWorkOrders.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Delovni nalog še ni ustvarjen.</span>
                ) : null}
                {renderTaskPreview(selectedWorkOrder)}
              </CardContent>
            </Card>
            {renderExecutionDefinition(selectedWorkOrder)}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {shouldShowOfferSelector && shouldRenderOfferDropdown && (
        <div className="flex flex-wrap items-center justify-between gap-4">
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
        </div>
      )}

      <div className="space-y-4">
        {materialOrdersForDisplay.length === 0 ? (
          <span className="text-sm text-muted-foreground">Naročilo za material še ni ustvarjeno.</span>
        ) : (
          materialOrdersForDisplay.map((order) => (
            <MaterialOrderCard
              key={order._id}
              materialOrder={order}
              technicianNote={workOrderForm.notes ?? ""}
              executionDate={typeof workOrderForm.scheduledAt === "string" ? workOrderForm.scheduledAt : selectedWorkOrder?.scheduledAt ?? null}
              executionDateConfirmedAt={
                typeof workOrderForm.scheduledConfirmedAt === "string"
                  ? workOrderForm.scheduledConfirmedAt
                  : selectedWorkOrder?.scheduledConfirmedAt ?? null
              }
              executionDateConfirmedBy={
                typeof workOrderForm.scheduledConfirmedBy === "string"
                  ? workOrderForm.scheduledConfirmedBy
                  : selectedWorkOrder?.scheduledConfirmedBy ?? null
              }
              executionDurationLabel={selectedExecutionDurationLabel}
              mainInstallerId={
                typeof workOrderForm.mainInstallerId === "string"
                  ? workOrderForm.mainInstallerId
                  : selectedWorkOrder?.mainInstallerId ?? null
              }
              executionTeamIds={Array.isArray(workOrderForm.assignedEmployeeIds) ? workOrderForm.assignedEmployeeIds : []}
              installerAvailability={installerAvailability}
              onExecutionDateChange={(value) => handleWorkOrderChange("scheduledAt", value)}
              onConfirmExecutionDate={() => {
                void handleConfirmSchedule();
              }}
              onUnconfirmExecutionDate={() => {
                void handleUnconfirmSchedule();
              }}
              onMainInstallerChange={handleMainInstallerChange}
              onToggleExecutionTeam={toggleAssignedEmployee}
              onPickupMethodChange={(value) => handlePickupMethodChange(order._id, value)}
              onPickupLocationChange={(value) => updateMaterialOrderForm(order._id, { pickupLocation: value })}
              onLogisticsOwnerChange={(employeeId) => updateMaterialOrderForm(order._id, { logisticsOwnerId: employeeId })}
              onTechnicianNoteChange={(value) => handleWorkOrderChange("notes", value)}
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
              onPreviewPurchaseOrder={() => openMaterialPdfPreview(order._id, "PURCHASE_ORDER")}
              onDownloadPurchaseOrder={() => handleDownloadMaterialPdf(order._id, "PURCHASE_ORDER")}
              onDownloadDeliveryNote={() => handleDownloadMaterialPdf(order._id, "DELIVERY_NOTE")}
              onMaterialItemsChange={(items) => updateMaterialOrderForm(order._id, { items })}
              onDeliveredQtyChange={(itemId, deliveredQty) => {
                void updateDeliveredQty(order._id, itemId, deliveredQty, false);
              }}
              onDeliveredQtyCommit={(itemId, deliveredQty) => {
                void updateDeliveredQty(order._id, itemId, deliveredQty, true);
              }}
              onSaveMaterialChanges={() => {
                void saveMaterialOrderChanges(order._id);
              }}
              onBulkMarkOrdered={(items) => {
                void applyMaterialItemsAndSave(order._id, items);
              }}
              onBulkMarkReady={(items) => {
                void applyMaterialItemsAndSave(order._id, items);
              }}
              hasPendingMaterialChanges={Boolean(pendingMaterialOrderIds[order._id])}
              canDownloadPdf={Boolean(order._id)}
              downloadingPdf={materialDownloading}
            />
          ))
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-0">
          <h3 className="text-base font-semibold">Predogled nalogov</h3>
          <div className="flex flex-wrap justify-end gap-2">
            {issueRequirements.map((requirement) => (
              <Badge
                key={requirement.label}
                variant="outline"
                className={
                  requirement.met
                    ? "border-green-500/30 bg-green-500/10 text-green-700"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700"
                }
              >
                {requirement.met ? requirement.label : requirement.missingText}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredWorkOrders.length === 0 ? (
            <span className="text-sm text-muted-foreground">Delovni nalog še ni ustvarjen.</span>
          ) : null}
          {renderTaskPreview(selectedWorkOrder)}
          <div className="flex justify-end border-t border-border/60 pt-4">
            <Button size="sm" onClick={handleIssueWorkOrder} disabled={!canIssueWorkOrder || savingWorkOrder || issuingOrder}>
              {issuingOrder ? "Izdajam..." : "Izdaj delovni nalog"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {renderExecutionDefinition(selectedWorkOrder)}

      <Dialog open={Boolean(activeUnitPhotoCapture)} onOpenChange={(open) => {
        if (!open) {
          setActiveUnitPhotoCapture(null);
        }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fotografije enote</DialogTitle>
          </DialogHeader>
          {activeUnitPhotoCapture ? (
            <PhotoCapture
              title="Fotografije priprave"
              uploadUrl="/api/files/upload"
              saveUrl={`/api/projects/${projectId}/work-orders/${activeUnitPhotoCapture.workOrderId}/photos`}
              savePayload={(photo) => ({
                url: photo.fileUrl,
                type: "prep",
                itemIndex: activeUnitPhotoCapture.itemIndex,
                unitIndex: activeUnitPhotoCapture.unitIndex,
              })}
              deleteUrl={(_photoUrl, photoId) =>
                `/api/projects/${projectId}/work-orders/${activeUnitPhotoCapture.workOrderId}/photos/${photoId ?? ""}`
              }
              existingPhotos={activePrepPhotos}
              onSaveResponse={(data) => syncWorkOrderPhotos(activeUnitPhotoCapture.workOrderId, data)}
              onDeleteResponse={(data) => syncWorkOrderPhotos(activeUnitPhotoCapture.workOrderId, data)}
              maxPhotos={10}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
