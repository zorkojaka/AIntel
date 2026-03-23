import { useState, type ChangeEvent } from "react";
import type { Employee } from "@aintel/shared/types/employee";
import type {
  MaterialOrder,
  MaterialPickupMethod,
  MaterialStep,
} from "@aintel/shared/types/logistics";
import { AlertTriangle, Loader2 } from "lucide-react";
import { PriceListProductAutocomplete } from "../../components/PriceListProductAutocomplete";
import { PhaseRibbon, type PhaseRibbonStatus } from "../../components/PhaseRibbon";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Textarea } from "../../components/ui/textarea";

type MaterialLine = MaterialOrder["items"][number];

type ExtraMaterialDraft = {
  productId: string | null;
  name: string;
  unit: string;
  quantity: number;
  note: string;
};

interface MaterialOrderCardProps {
  materialOrder: MaterialOrder | null;
  executionDate: string | null;
  executionDateConfirmedAt: string | null;
  executionTeamIds: string[];
  employees: Employee[];
  onExecutionDateChange: (value: string) => void;
  onConfirmExecutionDate: () => void;
  onUnconfirmExecutionDate: () => void;
  onToggleExecutionTeam: (employeeId: string) => void;
  onPickupMethodChange: (value: MaterialPickupMethod) => void;
  onPickupLocationChange: (value: string) => void;
  onLogisticsOwnerChange: (employeeId: string | null) => void;
  onPickupNoteChange: (value: string) => void;
  onDeliveryNotePhotosChange: (photos: string[]) => void;
  onAddExtraMaterial: (draft: ExtraMaterialDraft) => void;
  onConfirmPickup: () => void;
  onAdvanceStep?: (step: MaterialStep) => void;
  savingWorkOrder: boolean;
  onDownloadPurchaseOrder: () => void;
  onDownloadDeliveryNote: () => void;
  onDeliveredQtyChange: (itemId: string, deliveredQty: number) => void;
  onDeliveredQtyCommit: (itemId: string, deliveredQty: number) => void;
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

const RAW_MATERIAL_STEPS: MaterialStep[] = [
  "Za naročiti",
  "Naročeno",
  "Za prevzem",
  "Prevzeto",
  "Pripravljeno",
];

const MATERIAL_STEPS: MaterialStep[] = ["Naročeno", "Za prevzem", "Prevzeto", "Pripravljeno"];

const PICKUP_METHOD_LABELS: Record<MaterialPickupMethod, string> = {
  COMPANY_PICKUP: "Prevzem v firmi",
  SUPPLIER_PICKUP: "Prevzem pri dobavitelju",
  DIRECT_TO_INSTALLER: "Direktna dostava monterju",
  DIRECT_TO_SITE: "Direktna dostava na objekt",
};

const AUTOCOMPLETE_INPUT_CLASS =
  "h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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

function resolveRawStep(value?: string | null): MaterialStep {
  return RAW_MATERIAL_STEPS.includes(value as MaterialStep) ? (value as MaterialStep) : "Za naročiti";
}

function resolveDisplayStep(value?: string | null): MaterialStep {
  if (value === "Za naročiti") return "Naročeno";
  return MATERIAL_STEPS.includes(value as MaterialStep) ? (value as MaterialStep) : "Naročeno";
}

function isStepEligible(item: MaterialLine, targetStep: MaterialStep) {
  if (targetStep === "Naročeno") return true;
  if (targetStep === "Za prevzem") return true;
  if (targetStep === "Prevzeto") {
    const plannedQty = typeof item.quantity === "number" ? item.quantity : 0;
    const takenQty = typeof item.deliveredQty === "number" ? item.deliveredQty : 0;
    return takenQty >= plannedQty;
  }
  if (targetStep === "Pripravljeno") return true;
  return false;
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return "Ni določeno";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ni določeno";
  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Napaka pri branju slike."));
    reader.readAsDataURL(file);
  });
}

export function MaterialOrderCard(props: MaterialOrderCardProps) {
  const {
    materialOrder,
    executionDate,
    executionDateConfirmedAt,
    executionTeamIds,
    employees,
    onExecutionDateChange,
    onConfirmExecutionDate,
    onUnconfirmExecutionDate,
    onToggleExecutionTeam,
    onPickupMethodChange,
    onPickupLocationChange,
    onLogisticsOwnerChange,
    onPickupNoteChange,
    onDeliveryNotePhotosChange,
    onAddExtraMaterial,
    onConfirmPickup,
    onAdvanceStep,
    savingWorkOrder,
    onDownloadPurchaseOrder,
    onDownloadDeliveryNote,
    onDeliveredQtyChange,
    onDeliveredQtyCommit,
    onSaveMaterialChanges,
    hasPendingMaterialChanges,
    canDownloadPdf,
    downloadingPdf,
  } = props;

  const [showExtraForm, setShowExtraForm] = useState(false);
  const [extraDraft, setExtraDraft] = useState<ExtraMaterialDraft>({
    productId: null,
    name: "",
    unit: "",
    quantity: 1,
    note: "",
  });

  if (!materialOrder) {
    return <p className="text-sm text-muted-foreground">Naročilo za material bo ustvarjeno ob potrditvi ponudbe.</p>;
  }

  const activeEmployees = employees.filter((employee) => employee.active);
  const employeeNameById = new Map(activeEmployees.map((employee) => [employee.id, employee.name]));
  const groupedBySupplier = groupMaterialLines(materialOrder.items ?? []);
  const sortedLines = [...(materialOrder.items ?? [])].sort((a, b) => Number(Boolean(a.isExtra)) - Number(Boolean(b.isExtra)));
  const plannedLines = sortedLines.filter((item) => !item.isExtra);
  const extraLines = sortedLines.filter((item) => item.isExtra);
  const missingCount = plannedLines.filter((item) => {
    const plannedQty = typeof item.quantity === "number" ? item.quantity : 0;
    const takenQty = typeof item.deliveredQty === "number" ? item.deliveredQty : 0;
    return takenQty < plannedQty;
  }).length;

  const pickupMethodLabel =
    materialOrder.pickupMethod && PICKUP_METHOD_LABELS[materialOrder.pickupMethod]
      ? PICKUP_METHOD_LABELS[materialOrder.pickupMethod]
      : "Ni določeno";
  const isExecutionDateConfirmed = Boolean(executionDateConfirmedAt);
  const executionTeamLabel =
    executionTeamIds.map((employeeId) => employeeNameById.get(employeeId) ?? employeeId).join(", ") || "Ni določeno";
  const logisticsOwnerLabel = materialOrder.logisticsOwnerId
    ? employeeNameById.get(materialOrder.logisticsOwnerId) ?? "Izbran član ekipe"
    : "Ni določeno";

  const rawIndexes = plannedLines.map((item) => RAW_MATERIAL_STEPS.indexOf(resolveRawStep(item.materialStep)));
  const minRawIndex = rawIndexes.length > 0 ? Math.min(...rawIndexes) : 0;
  const currentIndex =
    plannedLines.length > 0 && plannedLines.every((item) => resolveRawStep(item.materialStep) === "Pripravljeno")
      ? -1
      : Math.min(Math.max(minRawIndex - 1, 0), MATERIAL_STEPS.length - 1);
  const currentStep = currentIndex >= 0 ? MATERIAL_STEPS[currentIndex] : null;
  const nextStep =
    plannedLines.length > 0 && plannedLines.every((item) => resolveRawStep(item.materialStep) === "Pripravljeno")
      ? null
      : RAW_MATERIAL_STEPS[minRawIndex + 1] ?? null;
  const eligibleCount =
    nextStep === null
      ? 0
      : plannedLines.filter(
          (item) =>
            resolveRawStep(item.materialStep) === RAW_MATERIAL_STEPS[minRawIndex] && isStepEligible(item, nextStep),
        ).length;

  const pickupConfirmedLabel = materialOrder.pickupConfirmedAt
    ? `Prevzem potrjen ${formatDateTimeLabel(materialOrder.pickupConfirmedAt)}`
    : "Prevzem še ni potrjen";
  const executionDateConfirmationLabel = isExecutionDateConfirmed
    ? `Termin potrjen ${formatDateTimeLabel(executionDateConfirmedAt)}`
    : "Termin še ni potrjen";

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const nextPhotos = await Promise.all(files.map((file) => fileToDataUrl(file)));
    onDeliveryNotePhotosChange([...(materialOrder.deliveryNotePhotos ?? []), ...nextPhotos.filter(Boolean)]);
    event.target.value = "";
  };

  const handleAddExtra = () => {
    if (!extraDraft.name.trim()) return;
    if (!Number.isFinite(extraDraft.quantity) || extraDraft.quantity <= 0) return;
    onAddExtraMaterial(extraDraft);
    setExtraDraft({
      productId: null,
      name: "",
      unit: "",
      quantity: 1,
      note: "",
    });
    setShowExtraForm(false);
  };

  const renderLineCard = (item: MaterialLine) => {
    const plannedQty = typeof item.quantity === "number" ? item.quantity : 0;
    const takenQty = typeof item.deliveredQty === "number" ? item.deliveredQty : 0;
    const diff = takenQty - plannedQty;
    const isEnough = diff >= 0;
    const displayDelta = diff > 0 ? `+${diff}` : `${diff}`;
    return (
      <div key={item.id} className="space-y-3 rounded-[var(--radius-card)] border border-border/70 bg-card p-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold leading-5">{item.name}</p>
            {item.isExtra ? (
              <Badge className="border-blue-500/30 bg-blue-500/15 text-blue-700">Dodatno</Badge>
            ) : null}
            <Badge variant="outline" className="text-[11px]">
              {resolveDisplayStep(item.materialStep)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {diff < 0 ? (
              <Badge
                variant="destructive"
                className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700"
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Manjka {Math.abs(diff)}
              </Badge>
            ) : null}
            {diff > 0 ? (
              <Badge className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-700">
                Rezerva {diff}
              </Badge>
            ) : null}
            {item.note ? <span className="text-xs text-muted-foreground">{item.note}</span> : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Plan</p>
            <p className="font-medium tabular-nums">{plannedQty}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Prevzeto</p>
            <p className="font-medium tabular-nums">{takenQty}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Razlika</p>
            <p className="font-medium tabular-nums">{displayDelta}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="text-sm font-medium">{isEnough ? "Usklajeno" : "Potrebno dopolniti"}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9"
              onClick={() => {
                const nextQty = Math.max(0, takenQty - 1);
                onDeliveredQtyChange(item.id, nextQty);
                onDeliveredQtyCommit(item.id, nextQty);
              }}
              aria-label="Zmanjšaj prevzeto količino"
            >
              -
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 px-3 text-xs"
              onClick={() => {
                onDeliveredQtyChange(item.id, plannedQty);
                onDeliveredQtyCommit(item.id, plannedQty);
              }}
            >
              Prevzeto vse
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9"
              onClick={() => {
                const nextQty = takenQty + 1;
                onDeliveredQtyChange(item.id, nextQty);
                onDeliveredQtyCommit(item.id, nextQty);
              }}
              aria-label="Povečaj prevzeto količino"
            >
              +
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-card)] border border-border/70 bg-card p-4 shadow-sm">
        <h3 className="text-base font-semibold">Organizacija izvedbe</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Termin izvedbe</span>
            <Input
              type="datetime-local"
              value={executionDate ?? ""}
              onChange={(event) => onExecutionDateChange(event.target.value)}
            />
          </label>
          <div className="space-y-1">
            <span className="text-sm font-medium">Potrditev termina</span>
            <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <span className="text-sm text-muted-foreground">{executionDateConfirmationLabel}</span>
              {isExecutionDateConfirmed ? (
                <Button type="button" size="sm" variant="outline" onClick={onUnconfirmExecutionDate} disabled={savingWorkOrder}>
                  Prekliči termin
                </Button>
              ) : executionDate ? (
                <Button type="button" size="sm" variant="outline" onClick={onConfirmExecutionDate} disabled={savingWorkOrder}>
                  Potrdi termin
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <span className="text-sm font-medium">Izvedbena ekipa</span>
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
      </div>

      <div className="rounded-[var(--radius-card)] border border-border/60 bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Logistika materiala</h3>
          </div>
          <Badge variant="outline">{pickupMethodLabel}</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Način prevzema / dostave</span>
            <Select
              value={materialOrder.pickupMethod ?? "COMPANY_PICKUP"}
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
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Odgovorna oseba za logistiko</span>
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
      </div>

      <div className="rounded-[var(--radius-card)] border border-border/70 bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prevzem</p>
            <h3 className="text-base font-semibold">Izvedba prevzema materiala</h3>
            <p className="text-sm text-muted-foreground">
              Monter vidi lokacijo, termin, ekipo in jasno listo prevzema brez dodatnih materialnih checkboxov.
            </p>
          </div>
          <Badge variant={materialOrder.pickupConfirmedAt ? "default" : "outline"}>{pickupConfirmedLabel}</Badge>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-md bg-muted/35 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Termin</p>
            <p className="text-sm font-medium">{formatDateTimeLabel(executionDate)}</p>
          </div>
          <div className="rounded-md bg-muted/35 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ekipa</p>
            <p className="text-sm font-medium">{executionTeamLabel}</p>
          </div>
          <div className="rounded-md bg-muted/35 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Prevzem</p>
            <p className="text-sm font-medium">{pickupMethodLabel}</p>
          </div>
          <div className="rounded-md bg-muted/35 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Logistika</p>
            <p className="text-sm font-medium">{logisticsOwnerLabel}</p>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
          <span className="font-medium">Lokacija prevzema:</span> {materialOrder.pickupLocation || "Ni določeno"}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            Priprava materiala: {plannedLines.length - missingCount}/{plannedLines.length} usklajenih
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {missingCount > 0 ? (
              <span className="text-muted-foreground">Manjkajoče postavke: {missingCount}</span>
            ) : null}
            {extraLines.length > 0 ? <span className="text-muted-foreground">Dodatni material: {extraLines.length}</span> : null}
          </div>
        </div>

        <div className="mt-4">
          <PhaseRibbon
            steps={MATERIAL_STEPS.map((step, index) => {
              const status: PhaseRibbonStatus =
                currentIndex === -1 ? "done" : index < currentIndex ? "done" : index === currentIndex ? "active" : "future";
              return { key: step, label: step, status };
            })}
            activeKey={currentStep ?? undefined}
            variant="static"
          />
        </div>

        <div className="mt-4 hidden overflow-hidden rounded-[var(--radius-card)] border bg-card md:block">
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead>Postavka</TableHead>
                <TableHead className="w-[80px] text-center">Plan</TableHead>
                <TableHead className="w-[90px] text-center">Prevzeto</TableHead>
                <TableHead className="w-[90px] text-center">Razlika</TableHead>
                <TableHead className="w-[110px] text-center">Status</TableHead>
                <TableHead className="w-[190px] text-right">Akcije</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLines.map((item) => {
                const plannedQty = typeof item.quantity === "number" ? item.quantity : 0;
                const takenQty = typeof item.deliveredQty === "number" ? item.deliveredQty : 0;
                const diff = takenQty - plannedQty;
                const displayDelta = diff > 0 ? `+${diff}` : `${diff}`;
                const statusLabel = diff === 0 ? "Usklajeno" : diff < 0 ? "Manjka" : "Rezerva";
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{item.name}</span>
                        {item.isExtra ? <Badge className="border-blue-500/30 bg-blue-500/15 text-blue-700">Dodatno</Badge> : null}
                        {item.note ? <span className="text-xs text-muted-foreground">{item.note}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{plannedQty}</TableCell>
                    <TableCell className="text-center tabular-nums">{takenQty}</TableCell>
                    <TableCell className="text-center tabular-nums">{displayDelta}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[11px]">
                        {statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => {
                            const nextQty = Math.max(0, takenQty - 1);
                            onDeliveredQtyChange(item.id, nextQty);
                            onDeliveredQtyCommit(item.id, nextQty);
                          }}
                          aria-label="Zmanjšaj prevzeto količino"
                        >
                          -
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-3 text-xs"
                          onClick={() => {
                            onDeliveredQtyChange(item.id, plannedQty);
                            onDeliveredQtyCommit(item.id, plannedQty);
                          }}
                        >
                          Prevzeto vse
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => {
                            const nextQty = takenQty + 1;
                            onDeliveredQtyChange(item.id, nextQty);
                            onDeliveredQtyCommit(item.id, nextQty);
                          }}
                          aria-label="Povečaj prevzeto količino"
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

        <div className="mt-4 space-y-3 md:hidden">{sortedLines.map((item) => renderLineCard(item))}</div>

        {groupedBySupplier.length > 0 ? (
          <div className="mt-4 space-y-2 rounded-[var(--radius-card)] border border-border/60 bg-muted/15 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kje prevzeti</p>
            {groupedBySupplier.map((group) => (
              <div key={group.supplierKey} className="text-sm">
                <span className="font-medium">{group.supplierLabel}</span>
                {group.supplierAddress ? <span className="text-muted-foreground">, {group.supplierAddress}</span> : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 rounded-[var(--radius-card)] border border-border/60 bg-muted/15 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Dodatni material</p>
              <p className="text-sm text-muted-foreground">Monter lahko zabeleži dodatno ali rezervno postavko izven ponudbe.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowExtraForm((prev) => !prev)}>
              Dodaj dodatni material
            </Button>
          </div>
          {showExtraForm ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-medium">Artikel</span>
                <PriceListProductAutocomplete
                  value={extraDraft.name}
                  placeholder="Poišči artikel v ceniku"
                  inputClassName={AUTOCOMPLETE_INPUT_CLASS}
                  onChange={(name) => setExtraDraft((prev) => ({ ...prev, name, productId: null }))}
                  onCustomSelected={() => setExtraDraft((prev) => ({ ...prev, productId: null }))}
                  onProductSelected={(product) =>
                    setExtraDraft((prev) => ({
                      ...prev,
                      productId: product.id,
                      name: product.name,
                      unit: product.unit ?? prev.unit,
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">Količina</span>
                <Input
                  type="number"
                  min={1}
                  value={extraDraft.quantity}
                  onChange={(event) =>
                    setExtraDraft((prev) => ({ ...prev, quantity: Number(event.target.value) || 0 }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">Enota</span>
                <Input
                  value={extraDraft.unit}
                  onChange={(event) => setExtraDraft((prev) => ({ ...prev, unit: event.target.value }))}
                  placeholder="kos, m, ura ..."
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-medium">Opomba / razlog</span>
                <Textarea
                  rows={2}
                  value={extraDraft.note}
                  onChange={(event) => setExtraDraft((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Zakaj je bil dodan dodatni material"
                />
              </label>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button type="button" size="sm" onClick={handleAddExtra}>
                  Dodaj na prevzem
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowExtraForm(false)}>
                  Prekliči
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Opomba ob prevzemu</span>
            <Textarea
              rows={3}
              value={materialOrder.pickupNote ?? ""}
              onChange={(event) => onPickupNoteChange(event.target.value)}
              placeholder="Manjkajoči kosi, posebnosti pri dostavi, podpis dobavnice ..."
            />
          </label>
          <div className="space-y-2 rounded-[var(--radius-card)] border border-border/60 bg-muted/15 p-3">
            <div>
              <p className="text-sm font-medium">Fotografija podpisane dobavnice</p>
              <p className="text-sm text-muted-foreground">Za MVP se slika shrani kot priloga prevzema v istem zapisu.</p>
            </div>
            <Input type="file" accept="image/*" multiple onChange={handlePhotoChange} />
            {(materialOrder.deliveryNotePhotos ?? []).length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {(materialOrder.deliveryNotePhotos ?? []).map((photo, index) => (
                  <div key={`${photo.slice(0, 24)}-${index}`} className="space-y-2 rounded-md border bg-card p-2">
                    <img src={photo} alt={`Dobavnica ${index + 1}`} className="h-24 w-full rounded-md object-cover" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onDeliveryNotePhotosChange(
                          (materialOrder.deliveryNotePhotos ?? []).filter((_, photoIndex) => photoIndex !== index),
                        )
                      }
                    >
                      Odstrani
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Fotografija še ni dodana.</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={onSaveMaterialChanges}
              disabled={!hasPendingMaterialChanges || savingWorkOrder}
            >
              Shrani pripravo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadPurchaseOrder}
              disabled={!canDownloadPdf || (downloadingPdf !== null && downloadingPdf !== "PURCHASE_ORDER")}
            >
              {downloadingPdf === "PURCHASE_ORDER" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Prenesi naročilnico
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadDeliveryNote}
              disabled={!canDownloadPdf || (downloadingPdf !== null && downloadingPdf !== "DELIVERY_NOTE")}
            >
              {downloadingPdf === "DELIVERY_NOTE" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Prenesi dobavnico
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onConfirmPickup} disabled={savingWorkOrder}>
              Potrdi prevzem
            </Button>
            {nextStep && onAdvanceStep ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onAdvanceStep(nextStep)}
                disabled={savingWorkOrder || eligibleCount === 0}
              >
                Naslednji korak
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
