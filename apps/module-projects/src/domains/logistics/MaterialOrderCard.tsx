import { useRef } from "react";
import type { MaterialOrder, MaterialStatus } from "@aintel/shared/types/logistics";
import type { Employee } from "@aintel/shared/types/employee";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

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
  nextStatus: MaterialStatus | null;
  onAdvanceStatus: (status: MaterialStatus) => void;
  savingWorkOrder: boolean;
  employees: Employee[];
  assignedEmployeeIds: string[];
  onToggleAssignedEmployee: (employeeId: string) => void;
  onDownloadPurchaseOrder: () => void;
  onDownloadDeliveryNote: () => void;
  onDeliveredQtyChange: (itemId: string, deliveredQty: number) => void;
  onDeliveredQtyCommit: (itemId: string, deliveredQty: number) => void;
  canDownloadPdf: boolean;
  downloadingPdf: "PURCHASE_ORDER" | "DELIVERY_NOTE" | null;
}

export function MaterialOrderCard({
  materialOrder,
  nextStatus,
  onAdvanceStatus,
  savingWorkOrder,
  employees,
  assignedEmployeeIds,
  onToggleAssignedEmployee,
  onDownloadPurchaseOrder,
  onDownloadDeliveryNote,
  onDeliveredQtyChange,
  onDeliveredQtyCommit,
  canDownloadPdf,
  downloadingPdf,
}: MaterialOrderCardProps) {
  const toggleRef = useRef<Record<string, boolean>>({});

  if (!materialOrder) {
    return <p className="text-sm text-muted-foreground">Naročilo za material bo ustvarjeno ob potrditvi ponudbe.</p>;
  }

  const groupedByDobavitelj = groupMaterialLinesByDobavitelj(materialOrder.items ?? []);

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
      {missingItemsCount > 0 && (
        <div className="text-sm text-muted-foreground">Manjkajoce postavke: {missingItemsCount}</div>
      )}
      {groupedByDobavitelj.map((group) => (
        <div key={group.dobaviteljKey} className="space-y-2">
          <div className="space-y-1 text-sm">
            <div className="font-medium">
              <span className="text-muted-foreground">Dobavitelj</span>: {group.dobaviteljLabel}
            </div>
            <div className="text-muted-foreground">
              Naslov dobavitelja:{" "}
              {group.dobaviteljLabel === "MANJKA DOBAVITELJ"
                ? "—"
                : group.naslovDobavitelja || "—"}
            </div>
          </div>
          <div className="border rounded-[var(--radius-card)] bg-card overflow-hidden">
            <Table className="table-fixed w-full">
              <colgroup>
                <col />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "56px" }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>Dobavitelj</TableHead>
                  <TableHead className="text-center tabular-nums w-[90px]">{"Koli\u010dina"}</TableHead>
                  <TableHead className="text-center tabular-nums w-[90px]">Razlika</TableHead>
                  <TableHead className="text-right w-[56px]">Imamo</TableHead>
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
                  const isOn = Boolean(toggleRef.current[item.id]);
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
                              toggleRef.current[item.id] = false;
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
                              toggleRef.current[item.id] = false;
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
                            checked={isOn}
                            onChange={() => {
                              toggleRef.current[item.id] = !isOn;
                              onDeliveredQtyChange(item.id, requiredQty);
                              onDeliveredQtyCommit(item.id, requiredQty);
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
        {nextStatus && (
          <Button
            onClick={() => onAdvanceStatus(nextStatus)}
            disabled={savingWorkOrder}
            title="Naprej"
            aria-label="Naprej"
            className="px-5"
            style={{
              clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)",
              paddingRight: "20px",
            }}
          >
            {nextStatus}
          </Button>
        )}
      </div>
    </div>
  );
}

