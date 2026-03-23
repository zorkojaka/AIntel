import type { Employee } from "@aintel/shared/types/employee";
import type { MaterialOrder, MaterialPickupMethod, MaterialStep } from "@aintel/shared/types/logistics";
import { Download, Loader2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

type MaterialLine = MaterialOrder["items"][number];

type ExtraMaterialDraft = {
  productId: string | null;
  name: string;
  unit: string;
  quantity: number;
  note: string;
};

type InstallerAvailabilityEntry = {
  workOrderId: string;
  projectId: string;
  projectCode: string;
  projectTitle?: string | null;
  title?: string | null;
  scheduledAt: string | null;
};

interface MaterialOrderCardProps {
  materialOrder: MaterialOrder | null;
  technicianNote?: string;
  executionDate: string | null;
  executionDateConfirmedAt: string | null;
  executionDateConfirmedBy?: string | null;
  executionDurationLabel?: string | null;
  mainInstallerId: string | null;
  executionTeamIds: string[];
  installerAvailability: InstallerAvailabilityEntry[];
  employees: Employee[];
  onExecutionDateChange: (value: string) => void;
  onConfirmExecutionDate: () => void;
  onUnconfirmExecutionDate: () => void;
  onMainInstallerChange: (employeeId: string | null) => void;
  onToggleExecutionTeam: (employeeId: string) => void;
  onPickupMethodChange: (value: MaterialPickupMethod) => void;
  onPickupLocationChange: (value: string) => void;
  onLogisticsOwnerChange: (employeeId: string | null) => void;
  onTechnicianNoteChange?: (value: string) => void;
  onPickupNoteChange: (value: string) => void;
  onDeliveryNotePhotosChange: (photos: string[]) => void;
  onAddExtraMaterial: (draft: ExtraMaterialDraft) => void;
  onConfirmPickup: () => void;
  onAdvanceStep?: (step: MaterialStep) => void;
  savingWorkOrder: boolean;
  onPreviewPurchaseOrder: () => void;
  onDownloadPurchaseOrder: () => void;
  onDownloadDeliveryNote: () => void;
  onDeliveredQtyChange: (itemId: string, deliveredQty: number) => void;
  onDeliveredQtyCommit: (itemId: string, deliveredQty: number) => void;
  onMaterialItemsChange: (items: MaterialLine[]) => void;
  onSaveMaterialChanges: () => void;
  hasPendingMaterialChanges: boolean;
  canDownloadPdf: boolean;
  downloadingPdf: "PURCHASE_ORDER" | "DELIVERY_NOTE" | null;
}

type SupplierGroup = {
  supplierKey: string;
  supplierLabel: string;
  supplierAddress?: string;
  lines: MaterialLine[];
};

const PICKUP_METHOD_LABELS: Record<MaterialPickupMethod, string> = {
  COMPANY_PICKUP: "Prevzem v firmi",
  SUPPLIER_PICKUP: "Prevzem pri dobavitelju",
  DIRECT_TO_INSTALLER: "Direktna dostava monterju",
  DIRECT_TO_SITE: "Direktna dostava na objekt",
};

function resolveSupplier(item: MaterialLine) {
  const supplier = typeof item.dobavitelj === "string" ? item.dobavitelj.trim() : "";
  const supplierAddress =
    typeof item.naslovDobavitelja === "string" ? item.naslovDobavitelja.trim() : "";
  if (!supplier) {
    return {
      key: "missing-supplier",
      label: "MANJKA DOBAVITELJ",
      address: "",
      isMissing: true,
    };
  }
  return {
    key: supplier.toLowerCase(),
    label: supplier,
    address: supplierAddress,
    isMissing: false,
  };
}

function groupMaterialLines(lines: MaterialLine[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();
  lines.forEach((line) => {
    const { key, label, address, isMissing } = resolveSupplier(line);
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      if (!isMissing) {
        const previous = existing.supplierAddress ?? "";
        if (!previous) {
          existing.supplierAddress = address;
        } else if (address && previous !== address) {
          existing.supplierAddress = "(različni naslovi)";
        }
      }
      return;
    }
    groups.set(key, {
      supplierKey: key,
      supplierLabel: label,
      supplierAddress: isMissing ? undefined : address,
      lines: [line],
    });
  });

  return Array.from(groups.values()).sort((a, b) => a.supplierLabel.localeCompare(b.supplierLabel));
}

function resolveMaterialStep(value?: string | null): MaterialStep {
  if (value === "Za naročiti" || value === "Naročeno" || value === "Za prevzem" || value === "Prevzeto" || value === "Pripravljeno") {
    return value;
  }
  return "Za naročiti";
}

function isOrdered(step: MaterialStep) {
  return step !== "Za naročiti";
}

function resolveOrderedQty(item: MaterialLine) {
  return typeof item.orderedQty === "number" && Number.isFinite(item.orderedQty) ? Math.max(0, item.orderedQty) : 0;
}

function resolvePlanQty(item: MaterialLine) {
  return typeof item.quantity === "number" && Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
}

function resolveOrderedStatus(item: MaterialLine) {
  const orderedQty = resolveOrderedQty(item);
  const planQty = resolvePlanQty(item);
  if (orderedQty <= 0) return "NE" as const;
  if (orderedQty < planQty) return "DELNO" as const;
  return "DA" as const;
}

function isReadyForPickup(step: MaterialStep) {
  return step === "Za prevzem" || step === "Prevzeto" || step === "Pripravljeno";
}

function getOverallStatus(readyCount: number, totalCount: number) {
  if (totalCount === 0 || readyCount === 0) {
    return {
      label: "Ni pripravljeno",
      className: "border-red-500/30 bg-red-500/10 text-red-700",
    };
  }
  if (readyCount >= totalCount) {
    return {
      label: "Pripravljeno za prevzem",
      className: "border-green-500/30 bg-green-500/10 text-green-700",
    };
  }
  return {
    label: "Delno pripravljeno",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  };
}

function getStepForFlags(nextOrdered: boolean, nextReady: boolean): MaterialStep {
  if (nextReady) return "Za prevzem";
  if (nextOrdered) return "Naročeno";
  return "Za naročiti";
}

export function MaterialOrderCard({
  materialOrder,
  technicianNote,
  executionDate,
  executionDateConfirmedAt,
  executionDateConfirmedBy,
  executionDurationLabel,
  mainInstallerId,
  executionTeamIds,
  installerAvailability,
  employees,
  onExecutionDateChange,
  onConfirmExecutionDate,
  onUnconfirmExecutionDate,
  onMainInstallerChange,
  onToggleExecutionTeam,
  onPickupMethodChange,
  onPickupLocationChange,
  onLogisticsOwnerChange,
  onTechnicianNoteChange,
  onMaterialItemsChange,
  onSaveMaterialChanges,
  hasPendingMaterialChanges,
  savingWorkOrder,
  onPreviewPurchaseOrder,
  onDownloadPurchaseOrder,
  canDownloadPdf,
  downloadingPdf,
}: MaterialOrderCardProps) {
  if (!materialOrder) {
    return <p className="text-sm text-muted-foreground">Naročilo za material bo ustvarjeno ob potrditvi ponudbe.</p>;
  }

  const activeEmployees = employees.filter((employee) => employee.active);
  const employeeNameById = new Map(employees.map((employee) => [employee.id, employee.name]));
  const selectedMainInstaller = mainInstallerId && mainInstallerId.trim().length > 0 ? mainInstallerId : null;
  const mainInstallerOptions: Array<{ id: string; name: string }> = selectedMainInstaller
    ? activeEmployees.some((employee) => employee.id === selectedMainInstaller)
      ? activeEmployees
      : [
          ...activeEmployees,
          { id: selectedMainInstaller, name: employeeNameById.get(selectedMainInstaller) ?? "Glavni monter" },
        ]
    : activeEmployees;
  const plannedLines = (materialOrder.items ?? []).filter((item) => !item.isExtra);
  const groupedBySupplier = groupMaterialLines(plannedLines);
  const orderedCount = plannedLines.filter((item) => resolveOrderedStatus(item) === "DA").length;
  const readyCount = plannedLines.filter((item) => resolveOrderedStatus(item) === "DA" && isReadyForPickup(resolveMaterialStep(item.materialStep))).length;
  const totalCount = plannedLines.length;
  const overallStatus = getOverallStatus(readyCount, totalCount);
  const materialCardClass =
    totalCount > 0 && orderedCount >= totalCount && readyCount >= totalCount
      ? "border-green-500/40 shadow-[0_0_0_1px_rgba(34,197,94,0.12)]"
      : "border-orange-400/50 shadow-[0_0_0_1px_rgba(251,146,60,0.14)]";
  const executionDateConfirmationLabel = executionDateConfirmedAt
    ? `Termin potrjen ${new Intl.DateTimeFormat("sl-SI", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(executionDateConfirmedAt))}${executionDateConfirmedBy ? ` (${executionDateConfirmedBy})` : ""}`
    : "Termin še ni potrjen";
  const hasExecutionDate = Boolean(executionDate);
  const hasExecutionTeam = executionTeamIds.length > 0;
  const executionDateCardClass =
    hasExecutionDate && executionDateConfirmedAt
      ? "border-green-500/40 shadow-[0_0_0_1px_rgba(34,197,94,0.12)]"
      : "border-orange-400/50 shadow-[0_0_0_1px_rgba(251,146,60,0.14)]";
  const executionTeamCardClass = hasExecutionTeam
    ? "border-green-500/40 shadow-[0_0_0_1px_rgba(34,197,94,0.12)]"
    : "border-orange-400/50 shadow-[0_0_0_1px_rgba(251,146,60,0.14)]";
  const executionDateInputClass =
    hasExecutionDate && executionDateConfirmedAt
      ? "border-green-500/40 focus-visible:border-green-500 focus-visible:ring-green-500/20"
      : "border-orange-400/50 focus-visible:border-orange-500 focus-visible:ring-orange-500/20";
  const pickupMethodLabel =
    materialOrder.pickupMethod && PICKUP_METHOD_LABELS[materialOrder.pickupMethod]
      ? PICKUP_METHOD_LABELS[materialOrder.pickupMethod]
      : "Ni določeno";
  const logisticsOwnerLabel = materialOrder.logisticsOwnerId
    ? employeeNameById.get(materialOrder.logisticsOwnerId) ?? "Ni določeno"
    : "Ni določeno";

  const selectedPickupLocation = materialOrder.pickupLocation?.trim() || "Ni določeno";

  const updateMaterialStep = (itemId: string, nextOrderedStatus: "DA" | "NE", nextReady: boolean) => {
    const nextItems = (materialOrder.items ?? []).map((item) => {
      if (item.id !== itemId) return item;
      const planQty = resolvePlanQty(item);
      const nextOrderedQty = nextOrderedStatus === "DA" ? planQty : 0;
      const nextOrdered = nextOrderedQty > 0;
      return {
        ...item,
        orderedQty: nextOrderedQty,
        isOrdered: nextOrdered,
        materialStep: getStepForFlags(nextOrdered, nextReady),
      };
    });
    onMaterialItemsChange(nextItems);
  };

  const updateOrderedQty = (itemId: string, nextOrderedQty: number) => {
    const nextItems = (materialOrder.items ?? []).map((item) => {
      if (item.id !== itemId) return item;
      const normalizedOrderedQty = Math.max(0, nextOrderedQty);
      return {
        ...item,
        orderedQty: normalizedOrderedQty,
        isOrdered: normalizedOrderedQty > 0,
      };
    });
    onMaterialItemsChange(nextItems);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-none border border-border/70 bg-card p-4 shadow-sm">
        <h3 className="text-base font-semibold">Organizacija izvedbe</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className={`order-1 rounded-none border bg-card p-4 ${executionTeamCardClass}`}>
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Izvedbena ekipa</h4>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {activeEmployees.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ni aktivnih zaposlenih.</p>
                  ) : (
                    activeEmployees.map((employee) => {
                      const isSelected = executionTeamIds.includes(employee.id);
                      return (
                        <button
                          key={employee.id}
                          type="button"
                          onClick={() => onToggleExecutionTeam(employee.id)}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card text-muted-foreground hover:border-primary"
                          }`}
                        >
                          {employee.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="space-y-2 rounded-none border border-border/60 bg-muted/10 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Zasedenost monterja</span>
                  <div className="w-full max-w-[220px]">
                    <Select
                      value={selectedMainInstaller ?? "none"}
                      onValueChange={(value) => onMainInstallerChange(value === "none" ? null : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Izberi monterja" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ni izbran</SelectItem>
                        {mainInstallerOptions.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!selectedMainInstaller ? (
                  <p className="text-sm text-muted-foreground">Najprej izberi glavnega monterja.</p>
                ) : installerAvailability.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ni evidentiranih prihodnjih terminov.</p>
                ) : (
                  <div className="space-y-2">
                    {installerAvailability.map((entry) => (
                      <div
                        key={entry.workOrderId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-none border border-border/50 bg-background px-3 py-2"
                      >
                        <span className="text-sm font-medium">
                          {entry.scheduledAt
                            ? new Intl.DateTimeFormat("sl-SI", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(entry.scheduledAt))
                            : "Ni določeno"}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {entry.projectCode}
                          {entry.title ? ` - ${entry.title}` : entry.projectTitle ? ` - ${entry.projectTitle}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`order-2 rounded-none border bg-card p-4 ${executionDateCardClass}`}>
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Termin izvedbe</h4>
              <div className="flex flex-wrap items-start gap-3">
                <label className="min-w-0 flex-1 space-y-1">
                  <Input
                    type="datetime-local"
                    value={executionDate ?? ""}
                    onChange={(event) => onExecutionDateChange(event.target.value)}
                    className={`h-12 text-lg font-semibold tracking-tight ${executionDateInputClass}`}
                  />
                </label>
                {executionDateConfirmedAt ? (
                  <Button type="button" size="sm" variant="outline" onClick={onUnconfirmExecutionDate} disabled={savingWorkOrder}>
                    Prekliči termin
                  </Button>
                ) : executionDate ? (
                  <Button type="button" size="sm" variant="outline" onClick={onConfirmExecutionDate} disabled={savingWorkOrder}>
                    Potrdi termin
                  </Button>
                ) : null}
              </div>
              <div>
                <span className="text-sm text-muted-foreground">{executionDateConfirmationLabel}</span>
              </div>
              {executionDurationLabel ? (
                <div>
                  <span className="text-sm text-muted-foreground">
                    Ocena trajanja izvedbe: <span className="font-medium text-foreground">{executionDurationLabel}</span>
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className={`rounded-none border bg-card p-4 shadow-sm ${materialCardClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Material</h3>
          </div>
          <Badge className={overallStatus.className}>{overallStatus.label}</Badge>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-sm font-medium">Način prevzema / dostave</span>
            <Select
              value={materialOrder.pickupMethod ?? "SUPPLIER_PICKUP"}
              onValueChange={(value) => onPickupMethodChange(value as MaterialPickupMethod)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Izberi način prevzema" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COMPANY_PICKUP">Prevzem v firmi</SelectItem>
                <SelectItem value="SUPPLIER_PICKUP">Prevzem pri dobavitelju</SelectItem>
                <SelectItem value="DIRECT_TO_INSTALLER">Direktna dostava monterju</SelectItem>
                <SelectItem value="DIRECT_TO_SITE">Direktna dostava na objekt</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Lokacija prevzema</span>
            <Input
              value={materialOrder.pickupLocation ?? ""}
              onChange={(event) => onPickupLocationChange(event.target.value)}
              placeholder="Npr. skladišče, dobavitelj ali objekt"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Odgovorna oseba</span>
            <Select
              value={materialOrder.logisticsOwnerId ?? "__none__"}
              onValueChange={(value) => onLogisticsOwnerChange(value === "__none__" ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Izberi odgovorno osebo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ni izbrano</SelectItem>
                {activeEmployees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="mt-4 space-y-4">
          {groupedBySupplier.map((group) => {
            return (
              <section key={group.supplierKey} className="rounded-none border border-border/70 bg-card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold">{group.supplierLabel}</h4>
                    {group.supplierAddress ? (
                      <p className="text-sm text-muted-foreground">{group.supplierAddress}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span>Prevzem: {pickupMethodLabel}</span>
                      <span>Lokacija: {selectedPickupLocation}</span>
                      <span>Odgovorna oseba: {logisticsOwnerLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="hidden md:block">
                  <Table className="table-fixed w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Postavka</TableHead>
                        <TableHead className="w-[90px] text-center">Plan</TableHead>
                        <TableHead className="w-[120px] text-center">Naročeno qty</TableHead>
                        <TableHead className="w-[100px] text-center">Razlika</TableHead>
                        <TableHead className="w-[140px] text-center">Naročeno</TableHead>
                        <TableHead className="w-[180px] text-center">Pripravljeno za prevzem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.lines.map((item) => {
                        const step = resolveMaterialStep(item.materialStep);
                        const orderedQty = resolveOrderedQty(item);
                        const planQty = resolvePlanQty(item);
                        const orderedStatus = resolveOrderedStatus(item);
                        const ordered = orderedStatus !== "NE";
                        const ready = isReadyForPickup(step) && ordered;
                        const diff = orderedQty - planQty;
                        const displayDiff = diff > 0 ? `+${diff}` : `${diff}`;
                        const diffClass = diff < 0 ? "text-red-600" : diff > 0 ? "text-amber-600" : "text-foreground";
                        const orderedButtonClass =
                          orderedStatus === "DA"
                            ? "border-green-500/30 bg-green-500/10 text-green-700"
                            : orderedStatus === "DELNO"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:border-amber-500/60"
                              : "border-orange-400/50 bg-orange-500/10 text-orange-700 hover:border-orange-500/60";
                        const readyButtonClass = !ordered
                          ? "border-border bg-muted/60 text-muted-foreground"
                          : ready
                            ? "border-green-500/30 bg-green-500/10 text-green-700"
                            : "border-orange-400/50 bg-orange-500/10 text-orange-700 hover:border-orange-500/60";
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              <div className="space-y-1">
                                <span>{item.name}</span>
                                {item.note ? <p className="text-xs text-muted-foreground">{item.note}</p> : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-center tabular-nums">{planQty}</TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min={0}
                                step="1"
                                value={orderedQty}
                                onChange={(event) => updateOrderedQty(item.id, Number(event.target.value) || 0)}
                                className="h-8 text-center tabular-nums"
                              />
                            </TableCell>
                            <TableCell className={`text-center tabular-nums ${diffClass}`}>{displayDiff}</TableCell>
                            <TableCell className="text-center">
                              <button
                                type="button"
                                onClick={() => updateMaterialStep(item.id, orderedStatus === "DA" ? "NE" : "DA", orderedStatus === "DA" ? false : ready)}
                                className={`inline-flex h-8 min-w-[84px] items-center justify-center rounded-md border px-3 text-xs font-medium transition ${orderedButtonClass}`}
                              >
                                {orderedStatus}
                              </button>
                            </TableCell>
                            <TableCell className="text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!ordered) return;
                                  updateMaterialStep(item.id, "DA", !ready);
                                }}
                                className={`inline-flex h-8 min-w-[148px] items-center justify-center rounded-md border px-3 text-xs font-medium transition ${readyButtonClass}`}
                                disabled={!ordered}
                              >
                                {ready ? "Pripravljeno" : "Označi pripravljeno"}
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 p-4 md:hidden">
                  {group.lines.map((item) => {
                    const step = resolveMaterialStep(item.materialStep);
                    const orderedQty = resolveOrderedQty(item);
                    const planQty = resolvePlanQty(item);
                    const orderedStatus = resolveOrderedStatus(item);
                    const ordered = orderedStatus !== "NE";
                    const ready = isReadyForPickup(step) && ordered;
                    const diff = orderedQty - planQty;
                    const displayDiff = diff > 0 ? `+${diff}` : `${diff}`;
                    const diffClass = diff < 0 ? "text-red-600" : diff > 0 ? "text-amber-600" : "text-foreground";
                    const orderedButtonClass =
                      orderedStatus === "DA"
                        ? "border-green-500/30 bg-green-500/10 text-green-700"
                        : orderedStatus === "DELNO"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                          : "border-orange-400/50 bg-orange-500/10 text-orange-700";
                    const readyButtonClass = !ordered
                      ? "border-border bg-muted/60 text-muted-foreground"
                      : ready
                        ? "border-green-500/30 bg-green-500/10 text-green-700"
                        : "border-orange-400/50 bg-orange-500/10 text-orange-700";
                    return (
                      <div key={item.id} className="space-y-3 rounded-none border border-border/60 bg-background p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{item.name}</p>
                          {item.note ? <p className="text-xs text-muted-foreground">{item.note}</p> : null}
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Plan</p>
                            <p className="font-medium tabular-nums">{planQty}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Naročeno qty</p>
                            <Input
                              type="number"
                              min={0}
                              step="1"
                              value={orderedQty}
                              onChange={(event) => updateOrderedQty(item.id, Number(event.target.value) || 0)}
                              className="h-9 text-center tabular-nums"
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Razlika</p>
                            <p className={`font-medium tabular-nums ${diffClass}`}>{displayDiff}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updateMaterialStep(item.id, orderedStatus === "DA" ? "NE" : "DA", orderedStatus === "DA" ? false : ready)}
                            className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-medium transition ${orderedButtonClass}`}
                          >
                            Naročeno: {orderedStatus}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!ordered) return;
                              updateMaterialStep(item.id, "DA", !ready);
                            }}
                            className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-medium transition ${readyButtonClass}`}
                            disabled={!ordered}
                          >
                            {ready ? "Pripravljeno za prevzem" : "Označi pripravljeno"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {onTechnicianNoteChange ? (
          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <label className="shrink-0 text-sm font-medium">Opombe</label>
            <Input
              value={technicianNote ?? ""}
              onChange={(event) => onTechnicianNoteChange(event.target.value)}
              placeholder="Navodila za tehnika"
              className="flex-1"
            />
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Naročeno {orderedCount} / {totalCount}</span>
            <span>Pripravljeno za prevzem {readyCount} / {totalCount}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {canDownloadPdf ? (
              <div className="inline-flex h-8 items-center rounded-md border border-border/70 bg-background">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-none border-r border-border/70 px-3"
                  onClick={onPreviewPurchaseOrder}
                  disabled={downloadingPdf !== null && downloadingPdf !== "PURCHASE_ORDER"}
                >
                  Predogled naročilnice
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-none"
                  onClick={onDownloadPurchaseOrder}
                  disabled={downloadingPdf !== null && downloadingPdf !== "PURCHASE_ORDER"}
                  aria-label="Prenesi naročilnico"
                >
                  {downloadingPdf === "PURCHASE_ORDER" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
              </div>
            ) : null}
            <Button type="button" size="sm" onClick={onSaveMaterialChanges} disabled={!hasPendingMaterialChanges || savingWorkOrder}>
              {savingWorkOrder ? "Shranjujem..." : "Shrani pripravo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
