import type { MaterialOrder, MaterialStep } from "@aintel/shared/types/logistics";
import type { Employee } from "@aintel/shared/types/employee";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { PhaseRibbon, type PhaseRibbonStatus } from "../../components/PhaseRibbon";

type MaterialLine = MaterialOrder["items"][number];
type SupplierGroup = {
  dobaviteljKey: string;
  dobaviteljLabel: string;
  naslovDobavitelja?: string;
  lines: MaterialLine[];
};

function resolveDobavitelj(item: MaterialLine) {
  const dobavitelj = typeof item.dobavitelj === "string" ? item.dobavitelj.trim() : "";
  const naslovDobavitelja =
    typeof item.naslovDobavitelja === "string" ? item.naslovDobavitelja.trim() : "";
  const isMissing = dobavitelj.length === 0;
  if (isMissing) {
    return {
      key: "manjka-dobavitelj",
      label: "MANJKA DOBAVITELJ",
      address: "",
      isMissing: true,
    };
  }
  return {
    key: dobavitelj.toLowerCase(),
    label: dobavitelj,
    address: naslovDobavitelja,
    isMissing: false,
  };
}

function groupMaterialLinesByDobavitelj(lines: MaterialLine[]): SupplierGroup[] {
  const grouped = new Map<string, SupplierGroup>();
  lines.forEach((line) => {
    const { key, label, address, isMissing } = resolveDobavitelj(line);
    const existing = grouped.get(key);
    if (existing) {
      existing.lines.push(line);
      if (!isMissing) {
        const previous = existing.naslovDobavitelja ?? "";
        if (!previous) {
          existing.naslovDobavitelja = address;
        } else if (address && previous !== address) {
          existing.naslovDobavitelja = "(različni naslovi)";
        }
      }
      return;
    }
    grouped.set(key, {
      dobaviteljKey: key,
      dobaviteljLabel: label,
      naslovDobavitelja: isMissing ? undefined : address,
      lines: [line],
    });
  });
  return Array.from(grouped.values()).sort((a, b) => a.dobaviteljLabel.localeCompare(b.dobaviteljLabel));
}

interface MaterialOrderCardProps {
  materialOrder: MaterialOrder | null;
  onAdvanceStep?: (step: MaterialStep) => void;
  savingWorkOrder: boolean;
  employees: Employee[];
  assignedEmployeeIds: string[];
  onToggleAssignedEmployee: (employeeId: string) => void;
  onDownloadPurchaseOrder: () => void;
  onDownloadDeliveryNote: () => void;
  onDeliveredQtyChange: (itemId: string, deliveredQty: number) => void;
  onDeliveredQtyCommit: (itemId: string, deliveredQty: number) => void;
  onSaveMaterialChanges: () => void;
  hasPendingMaterialChanges: boolean;
  canDownloadPdf: boolean;
  downloadingPdf: "PURCHASE_ORDER" | "DELIVERY_NOTE" | null;
}

const RAW_MATERIAL_STEPS: MaterialStep[] = [
  "Za naročiti",
  "Naročeno",
  "Za prevzem",
  "Prevzeto",
  "Pripravljeno",
];
const MATERIAL_STEPS: MaterialStep[] = ["Naročeno", "Za prevzem", "Prevzeto", "Pripravljeno"];

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
    const requiredQty = typeof item.quantity === "number" ? item.quantity : 0;
    const deliveredQty = typeof item.deliveredQty === "number" ? item.deliveredQty : 0;
    return deliveredQty >= requiredQty;
  }
  if (targetStep === "Pripravljeno") return true;
  return false;
}

export function MaterialOrderCard({
  materialOrder,
  onAdvanceStep,
  savingWorkOrder,
  employees,
  assignedEmployeeIds,
  onToggleAssignedEmployee,
  onDownloadPurchaseOrder,
  onDownloadDeliveryNote,
  onDeliveredQtyChange,
  onDeliveredQtyCommit,
  onSaveMaterialChanges,
  hasPendingMaterialChanges,
  canDownloadPdf,
  downloadingPdf,
}: MaterialOrderCardProps) {
  if (!materialOrder) {
    return <p className="text-sm text-muted-foreground">Naročilo za material bo ustvarjeno ob potrditvi ponudbe.</p>;
  }

  const groupedByDobavitelj = groupMaterialLinesByDobavitelj(materialOrder.items ?? []);

  const allItems = materialOrder.items ?? [];
  const totalCount = allItems.length;
  const preparedCount = allItems.filter((item) => resolveRawStep(item.materialStep) === "Pripravljeno").length;
  const isFullyPrepared = totalCount > 0 && preparedCount === totalCount;
  const summaryLabel = isFullyPrepared
    ? "Material: Pripravljeno"
    : `Material: Delno (${preparedCount}/${totalCount} pripravljeno)`;
  const rawIndexes = allItems.map((item) => RAW_MATERIAL_STEPS.indexOf(resolveRawStep(item.materialStep)));
  const minRawIndex = rawIndexes.length > 0 ? Math.min(...rawIndexes) : 0;
  const currentIndex = isFullyPrepared ? -1 : Math.min(Math.max(minRawIndex - 1, 0), MATERIAL_STEPS.length - 1);
  const currentStep = currentIndex >= 0 ? MATERIAL_STEPS[currentIndex] : null;
  const nextStep = isFullyPrepared ? null : RAW_MATERIAL_STEPS[minRawIndex + 1] ?? null;
  const eligibleCount =
    nextStep === null
      ? 0
      : allItems.filter(
          (item) => resolveRawStep(item.materialStep) === RAW_MATERIAL_STEPS[minRawIndex] && isStepEligible(item, nextStep),
        ).length;
  const nextDisabledReason =
    nextStep === null ? "Material je že pripravljen." : eligibleCount === 0 ? "Ni postavk za napredovanje." : "";

  const missingItemsCount = (materialOrder.items ?? []).filter((item) => {
    const deliveredQty = typeof item.deliveredQty === "number" ? item.deliveredQty : 0;
    return item.quantity - deliveredQty > 0;
  }).length;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Ekipa (material)</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {employees.filter((employee) => employee.active).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ni zaposlenih.</p>
          ) : (
            employees
              .filter((employee) => employee.active)
              .map((employee) => (
                <label key={employee.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={assignedEmployeeIds.includes(employee.id)}
                    onChange={() => onToggleAssignedEmployee(employee.id)}
                  />
                  {employee.name}
                </label>
              ))
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">{summaryLabel}</span>
        {missingItemsCount > 0 && (
          <span className="text-muted-foreground">Manjkajoče postavke: {missingItemsCount}</span>
        )}
      </div>
      <PhaseRibbon
        steps={MATERIAL_STEPS.map((step, index) => {
          const status: PhaseRibbonStatus =
            currentIndex === -1 ? "done" : index < currentIndex ? "done" : index === currentIndex ? "active" : "future";
          return { key: step, label: step, status };
        })}
        activeKey={currentStep ?? undefined}
        variant="static"
      />
      {groupedByDobavitelj.map((group) => (
        <div key={group.dobaviteljKey} className="space-y-2">
          <div className="space-y-1 text-sm">
            <div className="font-medium">
              <span className="text-muted-foreground">Dobavitelj</span>: {group.dobaviteljLabel}
            </div>
            {group.dobaviteljLabel !== "MANJKA DOBAVITELJ" &&
            typeof group.naslovDobavitelja === "string" &&
            group.naslovDobavitelja.trim().length > 0 ? (
              <div className="text-muted-foreground">Naslov dobavitelja: {group.naslovDobavitelja}</div>
            ) : null}
          </div>
          <div className="border rounded-[var(--radius-card)] bg-card overflow-hidden">
            <Table className="table-fixed w-full">
              <colgroup>
                <col />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "56px" }} />
                <col style={{ width: "130px" }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>Dobavitelj</TableHead>
                  <TableHead className="text-center tabular-nums w-[90px]">{"Koli\u010dina"}</TableHead>
                  <TableHead className="text-center tabular-nums w-[90px]">Razlika</TableHead>
                  <TableHead className="text-right w-[56px]">Imamo</TableHead>
                  <TableHead className="text-center w-[130px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.lines.map((item) => {
                  const hasSupplier =
                    typeof item.dobavitelj === "string" &&
                    item.dobavitelj.trim().length > 0;
                  const requiredQty = typeof item.quantity === "number" ? item.quantity : 0;
                  const deliveredQty = typeof item.deliveredQty === "number" ? item.deliveredQty : 0;
                  const diff = deliveredQty - requiredQty;
                  const status = diff === 0 ? "ok" : diff < 0 ? "missing" : "extra";
                  const isEnough = diff >= 0;
                  const borderClass =
                    status === "ok" ? "border-green-600" : status === "missing" ? "border-red-600" : "border-orange-500";
                  const fillClass =
                    status === "ok" ? "bg-green-600" : status === "missing" ? "bg-transparent" : "bg-orange-500";
                  const displayDelta = diff > 0 ? `+${diff}` : `${diff}`;
                  return (
                    <TableRow key={item.id}>
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
                          {!hasSupplier && (
                            <Badge className="inline-flex items-center gap-1 rounded-md border border-yellow-500/30 bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-800">
                              Manjka dobavitelj
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums w-[90px]">{item.quantity}</TableCell>
                      <TableCell className="text-center tabular-nums w-[90px]">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => {
                              const nextDelivered = Math.max(0, deliveredQty - 1);
                              onDeliveredQtyChange(item.id, nextDelivered);
                              onDeliveredQtyCommit(item.id, nextDelivered);
                            }}
                            aria-label={"Zmanšaj razliko"}
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
                              const nextDelivered = deliveredQty + 1;
                              onDeliveredQtyChange(item.id, nextDelivered);
                              onDeliveredQtyCommit(item.id, nextDelivered);
                            }}
                            aria-label={"Povečaj razliko"}
                          >
                            +
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right w-[56px] align-top">
                        <label className="relative inline-flex items-center justify-center cursor-pointer p-1">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            aria-label="Imamo material"
                            checked={isEnough}
                            onChange={() => {
                              const nextDelivered = isEnough ? 0 : requiredQty;
                              onDeliveredQtyChange(item.id, nextDelivered);
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
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[11px]">
                          {resolveDisplayStep(item.materialStep)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={onSaveMaterialChanges}
            disabled={!hasPendingMaterialChanges || savingWorkOrder}
          >
            Shrani
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDownloadPurchaseOrder}
            disabled={!canDownloadPdf || (downloadingPdf !== null && downloadingPdf !== "PURCHASE_ORDER")}
          >
            {downloadingPdf === "PURCHASE_ORDER" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Prenesi naročilnico
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDownloadDeliveryNote}
            disabled={!canDownloadPdf || (downloadingPdf !== null && downloadingPdf !== "DELIVERY_NOTE")}
          >
            {downloadingPdf === "DELIVERY_NOTE" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Prenesi dobavnico
          </Button>
        </div>
        {nextStep && onAdvanceStep && (
          <Button
            onClick={() => onAdvanceStep(nextStep)}
            disabled={savingWorkOrder || eligibleCount === 0}
            title={nextDisabledReason || "Naslednji korak"}
            aria-label="Naslednji korak"
            className="px-5"
            style={{
              clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)",
              paddingRight: "20px",
            }}
          >
            Naslednji korak
          </Button>
        )}
      </div>
    </div>
  );
}

